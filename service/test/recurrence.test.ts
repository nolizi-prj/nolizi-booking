/**
 * Recurring bookings.
 *
 * The rule comes from a library; what is tested here is the part we own — that
 * an occurrence happens at the same LOCAL time as the first one, on both sides
 * of a clock change, and that a series is all-or-nothing.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';
import { expandRecurrence, describeRecurrence, isValidRecurrence } from '../src/recurrence.ts';

const PORT = 55449;
const NOW = '2026-06-01T08:00:00Z';
let pg: EmbeddedPostgres;
let db: Database;
let deps: AppDeps;

before(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: '/tmp/pumasi-pg-recur', user: 'pumasi', password: 'pumasi',
    port: PORT, persistent: false,
  });
  await pg.initialise();
  await pg.start();
  db = await createPostgresDriver(`postgres://pumasi:pumasi@localhost:${PORT}/postgres`);
  await migrate(db);
});
after(async () => { await db?.close(); await pg?.stop(); });

beforeEach(async () => {
  await db.query(`TRUNCATE sign_in_tokens, sessions, invites, bookings, idempotency_keys,
    availability_rules, date_overrides, schedules, owners, availability_sets, set_rules,
    set_overrides, contacts RESTART IDENTITY CASCADE`);
  await db.query(`DELETE FROM rate_events`);
  deps = {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: 'https://booking.test' } as NodeJS.ProcessEnv),
    mail: new RetryingMail(new RecordingMail()),
    now: () => NOW,
    ready: () => true,
  };
});

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string; ip: string }> = {}) =>
  handle(deps, { method, path, ip: opts.ip ?? '15.1.1.1', form: opts.form, cookie: opts.cookie });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

// ── expansion ───────────────────────────────────────────────────────────────

test('a weekly series keeps its LOCAL time across a spring-forward change', () => {
  // 09:00 in Chicago every Monday, spanning the 2027-03-14 change. The wall
  // time must stay 09:00, so the UTC instant shifts by an hour — the opposite
  // of what "every 168 hours" would produce.
  const r = expandRecurrence({
    rule: 'FREQ=WEEKLY;COUNT=3',
    firstStart: '2027-03-01T15:00:00Z', // 09:00 CST
    durationMinutes: 30,
    timezone: 'America/Chicago',
  });
  assert.deepEqual(r.occurrences.map((o) => o.start), [
    '2027-03-01T15:00:00Z', // 09:00 CST
    '2027-03-08T15:00:00Z', // 09:00 CST
    '2027-03-15T14:00:00Z', // 09:00 CDT — one hour earlier in UTC
  ]);
  assert.equal(r.skipped.length, 0);
});

test('an occurrence in the spring-forward gap is reported, never shifted', () => {
  // 02:30 Chicago on 2027-03-14 does not exist; the clock jumps 02:00 -> 03:00.
  const r = expandRecurrence({
    rule: 'FREQ=WEEKLY;COUNT=2',
    firstStart: '2027-03-07T08:30:00Z', // 02:30 CST, a real time
    durationMinutes: 30,
    timezone: 'America/Chicago',
  });
  assert.equal(r.occurrences.length, 1, 'the impossible occurrence was booked anyway');
  assert.equal(r.skipped.length, 1);
  assert.ok(r.skipped[0]!.startsWith('2027-03-14T02:30'));
});

test('the series is capped, whatever the rule asks for', () => {
  const r = expandRecurrence({
    rule: 'FREQ=DAILY', // unbounded
    firstStart: '2026-06-01T09:00:00Z',
    durationMinutes: 30,
    timezone: 'UTC',
  });
  assert.equal(r.occurrences.length, 12);
});

test('rules are validated and described in plain language', () => {
  assert.ok(isValidRecurrence('FREQ=WEEKLY;COUNT=4'));
  assert.ok(isValidRecurrence('RRULE:FREQ=MONTHLY;COUNT=3'));
  assert.equal(isValidRecurrence('every other tuesday-ish'), false);
  assert.match(describeRecurrence('FREQ=WEEKLY;COUNT=4'), /week/i);
});

// ── booking a series ────────────────────────────────────────────────────────

async function recurringEvent(rule: string) {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-rec')`);
  const r = await call('POST', '/signup', {
    form: { invite: 'inv-rec', email: 'rec@example.com', display_name: 'Ro', timezone: 'UTC' },
  });
  const cookie = cookieOf(r as never);
  const created = await call('POST', '/app/schedules', {
    cookie, form: { title: 'Standup', slug: 'standup', duration_minutes: '30' } });
  const id = String(created.headers['location']).split('/').pop()!;
  const set = await db.query(
    `SELECT availability_set_id FROM schedules WHERE schedule_id = $1`, [id]);
  await call('POST', `/app/availability/${String(set.rows[0]!['availability_set_id'])}/hours`, {
    cookie, form: { MO: '', MO_start: '09:00', MO_end: '17:00' } });
  await call('POST', `/app/event/${id}`, {
    cookie, form: {
      title: 'Standup', duration_minutes: '30', granularity_minutes: '30',
      buffer_before_minutes: '0', buffer_after_minutes: '0',
      minimum_notice_minutes: '0', maximum_horizon_days: '90',
      max_bookings_per_day: '', location_kind: 'custom', location_value: '',
      available_from: '', available_until: '', recurrence_rule: rule,
    } });
  return { cookie, id };
}

test('booking a series creates every occurrence, joined as one group', async () => {
  await recurringEvent('FREQ=WEEKLY;COUNT=3');
  const page = await call('GET', '/standup');
  assert.ok(page.body.includes('name="repeat"'), 'the page never offered the series');

  const r = await call('POST', '/standup/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Ada', email: 'ada@example.com', repeat: 'on' } });
  assert.equal(r.status, 200);

  const rows = await db.query(
    `SELECT starts_at, group_id FROM bookings WHERE status = 'confirmed' ORDER BY starts_at`);
  assert.equal(rows.rows.length, 3);
  const groups = new Set(rows.rows.map((x) => String(x['group_id'])));
  assert.equal(groups.size, 1, 'the occurrences are not one series');
  assert.deepEqual(
    rows.rows.map((x) => new Date(String(x['starts_at'])).toISOString().slice(0, 10)),
    ['2026-06-01', '2026-06-08', '2026-06-15']);
});

test('a clash anywhere in the series refuses the whole thing', async () => {
  const { cookie } = await recurringEvent('FREQ=WEEKLY;COUNT=3');
  void cookie;
  // Someone already holds the third occurrence.
  const owner = await db.query(`SELECT owner_id FROM owners`);
  await db.query(
    `INSERT INTO bookings (booking_id, owner_id, starts_at, ends_at, status)
     VALUES ('taken', $1, '2026-06-15T09:00:00Z', '2026-06-15T09:30:00Z', 'confirmed')`,
    [String(owner.rows[0]!['owner_id'])]);

  const r = await call('POST', '/standup/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Ada', email: 'ada@example.com', repeat: 'on' } });
  assert.equal(r.status, 409);
  const mine = await db.query(
    `SELECT count(*)::int AS c FROM bookings WHERE booker_email = 'ada@example.com'`);
  assert.equal(Number(mine.rows[0]!['c']), 0, 'a partial series was committed');
});

test('a booker may still take a single meeting from a recurring page', async () => {
  await recurringEvent('FREQ=WEEKLY;COUNT=3');
  const r = await call('POST', '/standup/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Solo', email: 'solo@example.com' } }); // no repeat
  assert.equal(r.status, 200);
  const rows = await db.query(`SELECT group_id FROM bookings WHERE status = 'confirmed'`);
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0]!['group_id'], null);
});

test('cancelling a series cancels all of it', async () => {
  await recurringEvent('FREQ=WEEKLY;COUNT=3');
  await call('POST', '/standup/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Ada', email: 'ada@example.com', repeat: 'on' } });
  const tok = await db.query(`SELECT token FROM bookings WHERE token IS NOT NULL`);
  const r = await call('POST', `/b/${String(tok.rows[0]!['token'])}/cancel`);
  assert.equal(r.status, 200);
  const left = await db.query(`SELECT count(*)::int AS c FROM bookings WHERE status = 'confirmed'`);
  assert.equal(Number(left.rows[0]!['c']), 0);
});

test('an unparseable rule is refused rather than stored', async () => {
  const { cookie, id } = await recurringEvent('FREQ=WEEKLY;COUNT=3');
  await call('POST', `/app/event/${id}`, {
    cookie, form: {
      title: 'Standup', duration_minutes: '30', granularity_minutes: '30',
      buffer_before_minutes: '0', buffer_after_minutes: '0',
      minimum_notice_minutes: '0', maximum_horizon_days: '90',
      max_bookings_per_day: '', location_kind: 'custom', location_value: '',
      available_from: '', available_until: '', recurrence_rule: 'not a rule',
    } });
  const row = await db.query(`SELECT recurrence_rule FROM schedules WHERE schedule_id = $1`, [id]);
  assert.equal(row.rows[0]!['recurrence_rule'], null);
});

test('D3 · the management link deletes the WHOLE series: names, notes, answers', async () => {
  // The token rides the first row, but a series is many rows, each carrying
  // the booker's name and email. Deletion that reached one occurrence and
  // kept the rest was found by cross-family review; this composes it.
  await recurringEvent('FREQ=WEEKLY;COUNT=3');
  await call('POST', '/standup/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Ada', email: 'ada@example.com', repeat: 'on' } });
  const all = await db.query(`SELECT booking_id, token FROM bookings ORDER BY starts_at`);
  assert.equal(all.rows.length, 3);
  const token = String(all.rows.find((r) => r['token'])!['token']);

  const r = await call('POST', `/b/${token}/delete`, { form: { confirm: 'yes' } });
  assert.equal(r.status, 200);

  const left = await db.query(
    `SELECT count(*)::int AS c FROM bookings
      WHERE booker_email IS NOT NULL OR booker_name IS NOT NULL`);
  assert.equal(Number(left.rows[0]!['c']), 0,
    'no sibling row keeps the booker\'s identity after the link deletes');
  const ans = await db.query(`SELECT count(*)::int AS c FROM booking_answers`);
  assert.equal(Number(ans.rows[0]!['c']), 0, 'no sibling row keeps answers');
  const cancelled = await db.query(
    `SELECT count(*)::int AS c FROM bookings WHERE status = 'cancelled'`);
  assert.equal(Number(cancelled.rows[0]!['c']), 3, 'every occurrence is cancelled');
});
