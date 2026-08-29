/**
 * P5 — teams and multi-host scheduling.
 *
 * The amendment under test: B2 stays a per-owner invariant; a collective
 * meeting occupies several owners via one row each, committed all-or-nothing.
 * Round-robin assigns one host per booking, fairest first, and the row lives
 * under that host so the trigger guards it unchanged.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';

const PORT = 55443;
const NOW = '2026-06-01T08:00:00Z'; // a Monday
let pg: EmbeddedPostgres;
let db: Database;
let deps: AppDeps;
let mail: RecordingMail;

before(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: '/tmp/pumasi-pg-teams', user: 'pumasi', password: 'pumasi',
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
    set_overrides, contacts, contact_exclusions, single_use_links, orgs, org_members,
    event_hosts RESTART IDENTITY CASCADE`);
  await db.query(`DELETE FROM rate_events`);
  mail = new RecordingMail();
  deps = {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: 'https://booking.test' } as NodeJS.ProcessEnv),
    mail: new RetryingMail(mail),
    now: () => NOW,
    ready: () => true,
  };
});

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string; query: Record<string,string>; ip: string }> = {}) =>
  handle(deps, { method, path, ip: opts.ip ?? '6.6.6.6', form: opts.form, cookie: opts.cookie, query: opts.query });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

async function makeOwner(email: string, hours: [string, string] | null): Promise<{ cookie: string; ownerId: string }> {
  await db.query(`INSERT INTO invites (code) VALUES ($1)`, [`inv-${email}`]);
  const r = await call('POST', '/signup', {
    form: { invite: `inv-${email}`, email, display_name: email.split('@')[0]!, timezone: 'UTC' },
  });
  const cookie = cookieOf(r as never);
  const { rows } = await db.query(`SELECT owner_id FROM owners WHERE email = $1`, [email]);
  const ownerId = String(rows[0]!['owner_id']);
  if (hours) {
    // Every owner needs their own availability set with hours; the cheapest
    // route is creating one via the sets endpoint and saving hours on it.
    await call('POST', '/app/availability', { cookie, form: { name: 'Hours' } });
    const set = await db.query(
      `SELECT set_id FROM availability_sets WHERE owner_id = $1`, [ownerId]);
    await call('POST', `/app/availability/${String(set.rows[0]!['set_id'])}/hours`, {
      cookie, form: { MO_start: hours[0], MO_end: hours[1] },
    });
  }
  return { cookie, ownerId };
}

/** A team of `a` (admin/creator) and `b`, and a team event type on `a`. */
async function makeTeamEvent(
  kind: 'round_robin' | 'collective',
  aHours: [string, string], bHours: [string, string],
): Promise<{ a: { cookie: string; ownerId: string }; b: { cookie: string; ownerId: string }; scheduleId: string }> {
  const a = await makeOwner('a@t.example', aHours);
  const b = await makeOwner('b@t.example', bHours);
  await call('POST', '/app/team', { cookie: a.cookie, form: { name: 'T' } });
  const org = await db.query(`SELECT org_id FROM orgs`);
  await call('POST', `/app/team/${String(org.rows[0]!['org_id'])}/members`, {
    cookie: a.cookie, form: { email: 'b@t.example' },
  });
  const created = await call('POST', '/app/schedules', {
    cookie: a.cookie, form: { title: 'Duo', slug: 'duo', duration_minutes: '30' },
  });
  const scheduleId = String(created.headers['location']).split('/').pop()!;
  const save = await call('POST', `/app/event/${scheduleId}`, {
    cookie: a.cookie, form: {
      title: 'Duo', duration_minutes: '30', granularity_minutes: '30',
      buffer_before_minutes: '0', buffer_after_minutes: '0',
      minimum_notice_minutes: '0', maximum_horizon_days: '30',
      max_bookings_per_day: '', location_kind: 'custom', location_value: '',
      available_from: '', available_until: '',
      scheduling_kind: kind,
      [`host:${a.ownerId}`]: 'on', [`host:${b.ownerId}`]: 'on',
    },
  });
  assert.equal(save.status, 303);
  return { a, b, scheduleId };
}

test('team management: admins add members; members cannot', async () => {
  const a = await makeOwner('adm@t.example', null);
  const b = await makeOwner('mem@t.example', null);
  const c = await makeOwner('out@t.example', null);
  await call('POST', '/app/team', { cookie: a.cookie, form: { name: 'Crew' } });
  const org = String((await db.query(`SELECT org_id FROM orgs`)).rows[0]!['org_id']);
  const add = await call('POST', `/app/team/${org}/members`, {
    cookie: a.cookie, form: { email: 'mem@t.example' } });
  assert.equal(add.status, 303);
  const denied = await call('POST', `/app/team/${org}/members`, {
    cookie: b.cookie, form: { email: 'out@t.example' } });
  assert.equal(denied.status, 404);
  void c;
  const members = await db.query(`SELECT count(*)::int AS c FROM org_members`);
  assert.equal(Number(members.rows[0]!['c']), 2);
});

test('collective offers the intersection of the hosts’ hours', async () => {
  await makeTeamEvent('collective', ['09:00', '12:00'], ['10:00', '14:00']);
  const page = await call('GET', '/duo');
  assert.equal(page.status, 200);
  assert.ok(!page.body.includes('data-start="2026-06-01T09:00:00Z"'), 'A-only hour offered');
  assert.ok(page.body.includes('data-start="2026-06-01T10:00:00Z"'), 'shared hour missing');
  assert.ok(page.body.includes('data-start="2026-06-01T11:30:00Z"'));
  assert.ok(!page.body.includes('data-start="2026-06-01T12:00:00Z"'), 'B-only hour offered');
});

test('a collective booking occupies every host, atomically, and cancels as one', async () => {
  const { a, b } = await makeTeamEvent('collective', ['09:00', '12:00'], ['09:00', '12:00']);
  const r = await call('POST', '/duo/book', {
    form: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z',
            name: 'Ada', email: 'ada@example.com' },
  });
  assert.equal(r.status, 200);
  const rows = await db.query(
    `SELECT owner_id, group_id FROM bookings WHERE status = 'confirmed' ORDER BY owner_id`);
  assert.equal(rows.rows.length, 2);
  assert.deepEqual(rows.rows.map((x) => String(x['owner_id'])).sort(),
    [a.ownerId, b.ownerId].sort());
  assert.equal(String(rows.rows[0]!['group_id']), String(rows.rows[1]!['group_id']));

  // Both hosts were told.
  const hostMails = mail.sent.filter((m) => m.kind === 'confirmed'
    && ['a@t.example', 'b@t.example'].includes(m.to));
  assert.equal(hostMails.length, 2);

  // The manage link cancels the whole meeting.
  const tok = await db.query(`SELECT token FROM bookings WHERE token IS NOT NULL`);
  const cancel = await call('POST', `/b/${String(tok.rows[0]!['token'])}/cancel`);
  assert.equal(cancel.status, 200);
  const left = await db.query(`SELECT count(*)::int AS c FROM bookings WHERE status = 'confirmed'`);
  assert.equal(Number(left.rows[0]!['c']), 0);
});

test('a collective loses atomically when any host is already busy', async () => {
  const { a, b } = await makeTeamEvent('collective', ['09:00', '12:00'], ['09:00', '12:00']);
  // Host B is privately busy at 10:00 (a solo booking on their own calendar).
  await db.query(
    `INSERT INTO bookings (booking_id, owner_id, starts_at, ends_at, status)
     VALUES ('busy-b', $1, '2026-06-01T10:00:00Z', '2026-06-01T10:30:00Z', 'confirmed')`,
    [b.ownerId]);

  const r = await call('POST', '/duo/book', {
    form: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z',
            name: 'Ada', email: 'ada@example.com' },
  });
  assert.equal(r.status, 409);
  const aRows = await db.query(
    `SELECT count(*)::int AS c FROM bookings WHERE owner_id = $1`, [a.ownerId]);
  assert.equal(Number(aRows.rows[0]!['c']), 0, 'host A kept a half-committed row');
});

test('round robin unions availability and rotates by load', async () => {
  const { a, b } = await makeTeamEvent('round_robin', ['09:00', '10:00'], ['09:00', '11:00']);
  const page = await call('GET', '/duo');
  // Union: B-only 10:00 offered.
  assert.ok(page.body.includes('data-start="2026-06-01T10:00:00Z"'));

  const first = await call('POST', '/duo/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'One', email: 'one@example.com' } });
  assert.equal(first.status, 200);
  const second = await call('POST', '/duo/book', {
    form: { start: '2026-06-01T09:30:00Z', end: '2026-06-01T10:00:00Z',
            name: 'Two', email: 'two@example.com' } });
  assert.equal(second.status, 200);

  const who = await db.query(
    `SELECT DISTINCT owner_id FROM bookings WHERE status = 'confirmed'`);
  assert.equal(who.rows.length, 2, 'both hosts should have been assigned once');
  void a; void b;
});

test('round robin books a slot only one host can take under that host', async () => {
  const { b } = await makeTeamEvent('round_robin', ['09:00', '10:00'], ['09:00', '11:00']);
  const r = await call('POST', '/duo/book', {
    form: { start: '2026-06-01T10:30:00Z', end: '2026-06-01T11:00:00Z',
            name: 'Late', email: 'late@example.com' } });
  assert.equal(r.status, 200);
  const row = await db.query(`SELECT owner_id FROM bookings WHERE status = 'confirmed'`);
  assert.equal(String(row.rows[0]!['owner_id']), b.ownerId);
});

test('a group meeting cannot be moved, only cancelled and rebooked', async () => {
  await makeTeamEvent('collective', ['09:00', '12:00'], ['09:00', '12:00']);
  await call('POST', '/duo/book', {
    form: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z',
            name: 'Ada', email: 'ada@example.com' } });
  const tok = await db.query(`SELECT token FROM bookings WHERE token IS NOT NULL`);
  const move = await call('POST', `/b/${String(tok.rows[0]!['token'])}/reschedule`, {
    form: { start: '2026-06-01T11:00:00Z', end: '2026-06-01T11:30:00Z' } });
  assert.equal(move.status, 409);
  assert.ok(move.body.includes('cancel it and book a new time'));
});

test('a host outside the editor’s orgs cannot be attached (I4)', async () => {
  const { a, scheduleId } = await makeTeamEvent('round_robin', ['09:00', '10:00'], ['09:00', '10:00']);
  const outsider = await makeOwner('lone@t.example', ['09:00', '10:00']);
  await call('POST', `/app/event/${scheduleId}`, {
    cookie: a.cookie, form: {
      title: 'Duo', duration_minutes: '30', granularity_minutes: '30',
      buffer_before_minutes: '0', buffer_after_minutes: '0',
      minimum_notice_minutes: '0', maximum_horizon_days: '30',
      max_bookings_per_day: '', location_kind: 'custom', location_value: '',
      available_from: '', available_until: '', scheduling_kind: 'round_robin',
      [`host:${outsider.ownerId}`]: 'on',
    },
  });
  const hosts = await db.query(`SELECT owner_id FROM event_hosts WHERE schedule_id = $1`, [scheduleId]);
  assert.ok(!hosts.rows.some((h) => String(h['owner_id']) === outsider.ownerId));
});
