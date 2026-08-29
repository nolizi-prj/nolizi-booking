/**
 * Who is allowed to book — blocked sources, and proof the booker owns the
 * address they typed.
 *
 * Both answer the same question at the same moment, so they are tested
 * together: the block must be refused before a slot is held, and an unverified
 * booking must not become a meeting anyone relies on.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';
import { renderMessage } from '../src/mail-render.ts';

const PORT = 55451;
const NOW = '2026-06-01T08:00:00Z';
let pg: EmbeddedPostgres;
let db: Database;
let deps: AppDeps;
let recorder: RecordingMail;

before(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: '/tmp/pumasi-pg-gate', user: 'pumasi', password: 'pumasi',
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
    set_overrides, contacts, contact_exclusions, booking_blocks, booking_intents,
    audit_events RESTART IDENTITY CASCADE`);
  await db.query(`DELETE FROM rate_events`);
  recorder = new RecordingMail();
  deps = {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: 'https://booking.test' } as NodeJS.ProcessEnv),
    mail: new RetryingMail(recorder),
    now: () => NOW,
    ready: () => true,
  };
});

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string; ip: string }> = {}) =>
  handle(deps, { method, path, ip: opts.ip ?? '15.1.1.1', form: opts.form, cookie: opts.cookie });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

/** An owner with one bookable event type, Mondays 09:00–17:00 UTC. */
async function ownerWithEvent() {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-gate')`);
  const r = await call('POST', '/signup', {
    form: { invite: 'inv-gate', email: 'host@example.com', display_name: 'Ho', timezone: 'UTC' },
  });
  const cookie = cookieOf(r as never);
  const created = await call('POST', '/app/schedules', {
    cookie, form: { title: 'Chat', slug: 'chat', duration_minutes: '30' } });
  const id = String(created.headers['location']).split('/').pop()!;
  const set = await db.query(
    `SELECT availability_set_id FROM schedules WHERE schedule_id = $1`, [id]);
  await call('POST', `/app/availability/${String(set.rows[0]!['availability_set_id'])}/hours`, {
    cookie, form: { MO: '', MO_start: '09:00', MO_end: '17:00' } });
  return { cookie, id };
}

const book = (email: string, extra: Record<string, string> = {}) =>
  call('POST', '/chat/book', {
    form: {
      start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
      name: 'Ada', email, ...extra,
    },
  });

// ── blocked sources ─────────────────────────────────────────────────────────

test('a blocked address cannot book, and holds no slot by trying', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', {
    cookie, form: { pattern: 'nuisance@spam.test', note: 'kept no-showing' } });

  const refused = await book('nuisance@spam.test');
  assert.equal(refused.status, 403);
  assert.match(refused.body, /not accepting bookings from that address/i);

  const held = await db.query(`SELECT count(*)::int AS c FROM bookings`);
  assert.equal(Number(held.rows[0]!['c']), 0, 'the refused attempt still took a slot');

  // The time it was refused for is still free for everyone else.
  const ok = await book('welcome@example.com');
  assert.equal(ok.status, 200);
});

test('blocking a domain blocks every address under it, and nothing else', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', { cookie, form: { pattern: 'spam.test' } });

  assert.equal((await book('anyone@spam.test')).status, 403);
  // A domain that merely ENDS with the blocked one is a different domain.
  assert.equal((await book('someone@notspam.test')).status, 200);
});

test('the refusal names no one — it is the owner\'s business, not the caller\'s', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', {
    cookie, form: { pattern: 'nuisance@spam.test', note: 'kept no-showing' } });
  const refused = await book('nuisance@spam.test');
  assert.ok(!refused.body.includes('host@example.com'), 'the refusal named the owner');
  assert.ok(!refused.body.includes('no-showing'), 'the refusal leaked the private note');
});

test('unblocking restores booking', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', { cookie, form: { pattern: 'later@spam.test' } });
  assert.equal((await book('later@spam.test')).status, 403);
  await call('POST', '/app/contacts/blocks', { cookie, form: { remove: 'later@spam.test' } });
  assert.equal((await book('later@spam.test')).status, 200);
});

test('an owner cannot block themselves out of their own page', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', { cookie, form: { pattern: 'host@example.com' } });
  const rows = await db.query(`SELECT count(*)::int AS c FROM booking_blocks`);
  assert.equal(Number(rows.rows[0]!['c']), 0);
});

test('a block belongs to one owner, not to the service', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', { cookie, form: { pattern: 'nuisance@spam.test' } });

  // A second owner, untouched by the first one's block.
  await db.query(`INSERT INTO invites (code) VALUES ('inv-two')`);
  const r2 = await call('POST', '/signup', {
    form: { invite: 'inv-two', email: 'other@example.com', display_name: 'Ot', timezone: 'UTC' } });
  const c2 = cookieOf(r2 as never);
  const made = await call('POST', '/app/schedules', {
    cookie: c2, form: { title: 'Talk', slug: 'talk', duration_minutes: '30' } });
  const id2 = String(made.headers['location']).split('/').pop()!;
  const set2 = await db.query(
    `SELECT availability_set_id FROM schedules WHERE schedule_id = $1`, [id2]);
  await call('POST', `/app/availability/${String(set2.rows[0]!['availability_set_id'])}/hours`, {
    cookie: c2, form: { MO: '', MO_start: '09:00', MO_end: '17:00' } });

  const r = await call('POST', '/talk/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Ada', email: 'nuisance@spam.test' } });
  assert.equal(r.status, 200, 'one owner\'s block reached another owner\'s page');
});

// ── booking email verification ──────────────────────────────────────────────

/** Turn verification on for the event type created by ownerWithEvent(). */
async function requireVerification(cookie: string, id: string) {
  await call('POST', `/app/event/${id}`, {
    cookie, form: {
      title: 'Chat', duration_minutes: '30', granularity_minutes: '30',
      buffer_before_minutes: '0', buffer_after_minutes: '0',
      minimum_notice_minutes: '0', maximum_horizon_days: '90',
      max_bookings_per_day: '', location_kind: 'custom', location_value: '',
      available_from: '', available_until: '', require_email_verification: 'on',
    } });
}

/** The /v/<token> link out of the most recent verification mail. */
function verifyLink(): string {
  const m = [...recorder.sent].reverse().find((x) => x.kind === 'verify');
  assert.ok(m, 'no verification mail was sent');
  return `/v/${m.token}`;
}

test('an unverified booking makes no meeting, and holds no time', async () => {
  const { cookie, id } = await ownerWithEvent();
  await requireVerification(cookie, id);

  const r = await book('ada@example.com');
  assert.equal(r.status, 200);
  assert.match(r.body, /Check your email/i);

  const made = await db.query(`SELECT count(*)::int AS c FROM bookings`);
  assert.equal(Number(made.rows[0]!['c']), 0, 'an unproven address got a booking');

  // The point of not holding it: someone else can still take the time.
  const other = await call('POST', '/chat/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Bo', email: 'bo@example.com' } });
  assert.equal(other.status, 200);
});

test('the verification mail does not claim a meeting exists', async () => {
  const { cookie, id } = await ownerWithEvent();
  await requireVerification(cookie, id);
  await book('ada@example.com');
  const m = [...recorder.sent].reverse().find((x) => x.kind === 'verify')!;
  assert.equal(m.to, 'ada@example.com');
  // Someone whose address a stranger typed must not read this as an appointment,
  // so the assertion is on what actually reaches them, not on the message object.
  const out = renderMessage(m, 'https://booking.test');
  assert.match(out.subject, /confirm/i);
  assert.match(out.text, /Nothing is booked yet/i);
  assert.ok(!/is confirmed/i.test(out.text), 'the mail told them it was booked');
});

test('following the link books it, once', async () => {
  const { cookie, id } = await ownerWithEvent();
  await requireVerification(cookie, id);
  await book('ada@example.com');

  const link = verifyLink();
  const ok = await call('GET', link);
  assert.equal(ok.status, 200);
  const rows = await db.query(
    `SELECT booker_email FROM bookings WHERE status = 'confirmed'`);
  assert.equal(rows.rows.length, 1);
  assert.equal(rows.rows[0]!['booker_email'], 'ada@example.com');

  // A second use of the same link is refused, and books nothing further.
  const again = await call('GET', link);
  assert.equal(again.status, 404);
  const after = await db.query(`SELECT count(*)::int AS c FROM bookings WHERE status = 'confirmed'`);
  assert.equal(Number(after.rows[0]!['c']), 1);
});

test('an expired link is refused, and looks like any other dead link', async () => {
  const { cookie, id } = await ownerWithEvent();
  await requireVerification(cookie, id);
  await book('ada@example.com');
  const link = verifyLink();

  deps.now = () => '2026-06-01T08:31:00Z'; // 31 minutes later; the TTL is 30
  const late = await call('GET', link);
  assert.equal(late.status, 404);

  // A token that never existed answers identically, so guessing learns nothing.
  const bogus = await call('GET', '/v/00000000000000000000000000000000');
  assert.equal(bogus.status, late.status);
  assert.equal(bogus.body, late.body);
});

test('losing the time while confirming is refused, not double-booked', async () => {
  const { cookie, id } = await ownerWithEvent();
  await requireVerification(cookie, id);
  await book('ada@example.com');
  const link = verifyLink();

  // Someone takes the time before Ada gets to her mail. Written straight to
  // the table because every route to this event type now goes through
  // verification too — the competitor has to be an already-confirmed booking.
  const owner = await db.query(`SELECT owner_id FROM owners`);
  await db.query(
    `INSERT INTO bookings (booking_id, owner_id, starts_at, ends_at, status, booker_email)
     VALUES ('taken', $1, '2026-06-01T09:00:00Z', '2026-06-01T09:30:00Z', 'confirmed', 'bo@example.com')`,
    [String(owner.rows[0]!['owner_id'])]);

  const late = await call('GET', link);
  assert.equal(late.status, 409);
  const rows = await db.query(
    `SELECT booker_email FROM bookings WHERE status = 'confirmed'`);
  assert.equal(rows.rows.length, 1, 'the time was booked twice');
  assert.equal(rows.rows[0]!['booker_email'], 'bo@example.com');
});

test('verification is off unless the owner asks for it', async () => {
  await ownerWithEvent();
  const r = await book('ada@example.com');
  assert.equal(r.status, 200);
  const rows = await db.query(`SELECT count(*)::int AS c FROM bookings WHERE status = 'confirmed'`);
  assert.equal(Number(rows.rows[0]!['c']), 1, 'an ordinary booking was made to verify');
});

test('a blocked address is refused before it can be mailed anything', async () => {
  const { cookie, id } = await ownerWithEvent();
  await requireVerification(cookie, id);
  await call('POST', '/app/contacts/blocks', { cookie, form: { pattern: 'nuisance@spam.test' } });

  const r = await book('nuisance@spam.test');
  assert.equal(r.status, 403);
  // Otherwise the block becomes a way to send mail to an arbitrary address.
  assert.equal(recorder.sent.filter((m) => m.kind === 'verify').length, 0);
});

test('unredeemed intents go when the account goes', async () => {
  const { cookie, id } = await ownerWithEvent();
  await requireVerification(cookie, id);
  await book('ada@example.com');
  const held = await db.query(`SELECT count(*)::int AS c FROM booking_intents`);
  assert.equal(Number(held.rows[0]!['c']), 1);

  const gone = await call('POST', '/app/delete', { cookie, form: { confirm: 'yes' } });
  assert.ok(gone.status < 400);
  const left = await db.query(`SELECT count(*)::int AS c FROM booking_intents`);
  assert.equal(Number(left.rows[0]!['c']), 0, 'a deleted account left a booker\'s address behind');
});

test('blocks are audited, and go when the account goes', async () => {
  const { cookie } = await ownerWithEvent();
  await call('POST', '/app/contacts/blocks', { cookie, form: { pattern: 'nuisance@spam.test' } });
  const ev = await db.query(`SELECT action FROM audit_events WHERE action = 'block.added'`);
  assert.equal(ev.rows.length, 1);

  const gone = await call('POST', '/app/delete', { cookie, form: { confirm: 'yes' } });
  assert.ok(gone.status < 400, `deletion itself failed: ${gone.status}`);
  const left = await db.query(`SELECT count(*)::int AS c FROM booking_blocks`);
  assert.equal(Number(left.rows[0]!['c']), 0, 'the deleted account left its blocks behind');
});
