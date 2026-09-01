/**
 * The owner's analytics.
 *
 * Two things are worth testing here and the rest is arithmetic: that every
 * bucket is computed in the OWNER's timezone rather than UTC (the bug that
 * makes a Monday morning meeting appear on Sunday for half the world), and
 * that the page names nobody — including after a booker has exercised their
 * deletion right, when the row survives with its identity emptied.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startPostgres, type TestPostgres } from './support/pg.ts';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';

const NOW = '2026-06-15T12:00:00Z';
let pg: TestPostgres;
let db: Database;
let deps: AppDeps;

before(async () => {
  pg = await startPostgres('analytics');
  db = await createPostgresDriver(pg.url);
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

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string; query: Record<string,string> }> = {}) =>
  handle(deps, { method, path, ip: '15.1.1.1', form: opts.form, cookie: opts.cookie, query: opts.query });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

/** An owner in `tz` with one event type. */
async function ownerIn(tz: string) {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-a')`);
  const r = await call('POST', '/signup', {
    form: { invite: 'inv-a', email: 'host@example.com', display_name: 'Ho', timezone: tz } });
  const cookie = cookieOf(r as never);
  const created = await call('POST', '/app/schedules', {
    cookie, form: { title: 'Chat', slug: 'chat', duration_minutes: '30' } });
  const id = String(created.headers['location']).split('/').pop()!;
  const own = await db.query(`SELECT owner_id FROM owners`);
  return { cookie, id, ownerId: String(own.rows[0]!['owner_id']) };
}

let seq = 0;
async function booking(ownerId: string, scheduleId: string, o: {
  start: string; minutes?: number; status?: string; noShow?: boolean; created?: string;
}) {
  const start = new Date(o.start);
  const end = new Date(start.getTime() + (o.minutes ?? 30) * 60000);
  await db.query(
    `INSERT INTO bookings (booking_id, owner_id, schedule_id, starts_at, ends_at,
                           status, no_show, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [`b${++seq}`, ownerId, scheduleId, start.toISOString(), end.toISOString(),
     o.status ?? 'confirmed', o.noShow ? 1 : 0, o.created ?? '2026-06-01T00:00:00Z'],
  );
}

test('meetings are bucketed in the owner\'s timezone, not UTC', async () => {
  // 01:00 UTC on Monday is 20:00 the PREVIOUS Sunday in Chicago. An owner in
  // Chicago must see Sunday evening, which is when it happens for them.
  const { cookie, id, ownerId } = await ownerIn('America/Chicago');
  await booking(ownerId, id, { start: '2026-06-08T01:00:00Z' }); // Mon 01:00Z

  const page = await call('GET', '/app/analytics', { cookie });
  // The Sunday bar (last of the seven) carries the meeting; Monday's is empty.
  const bars = [...page.body.matchAll(/title="(Mon|Tue|Wed|Thu|Fri|Sat|Sun): (\d+)"/g)]
    .map((m) => [m[1], Number(m[2])] as const);
  const counts = Object.fromEntries(bars);
  assert.equal(counts['Sun'], 1, 'the meeting was bucketed in UTC, not the owner\'s zone');
  assert.equal(counts['Mon'], 0);

  // And the hour is the local one: 20:00, not 01:00.
  assert.match(page.body, /title="20: 1"/);
});

test('the same booking reads differently for an owner in another zone', async () => {
  const { cookie, id, ownerId } = await ownerIn('Asia/Seoul');
  await booking(ownerId, id, { start: '2026-06-08T01:00:00Z' }); // Mon 10:00 KST
  const page = await call('GET', '/app/analytics', { cookie });
  assert.match(page.body, /title="Mon: 1"/);
  assert.match(page.body, /title="10: 1"/);
});

test('cancelled meetings are counted as cancelled, not as booked', async () => {
  const { cookie, id, ownerId } = await ownerIn('UTC');
  await booking(ownerId, id, { start: '2026-06-10T09:00:00Z' });
  await booking(ownerId, id, { start: '2026-06-11T09:00:00Z', status: 'cancelled' });
  await booking(ownerId, id, { start: '2026-06-12T09:00:00Z', noShow: true });

  const page = await call('GET', '/app/analytics', { cookie });
  const stat = (label: string) => {
    const m = page.body.match(
      new RegExp(`<div class="statv">([^<]*)</div>\\s*<div class="statl">${label}</div>`));
    return m?.[1]?.trim();
  };
  assert.equal(stat('Meetings booked'), '2', 'a cancelled meeting was counted as booked');
  assert.equal(stat('Cancelled'), '1');
  assert.equal(stat('No-shows'), '1');
  assert.equal(stat('Time booked'), '1 h', 'two 30-minute meetings are one hour');
});

test('the window is honoured, and only the offered windows are accepted', async () => {
  const { cookie, id, ownerId } = await ownerIn('UTC');
  await booking(ownerId, id, { start: '2026-06-10T09:00:00Z' }); // 5 days ago
  await booking(ownerId, id, { start: '2026-04-10T09:00:00Z' }); // 66 days ago

  const short = await call('GET', '/app/analytics', { cookie });
  assert.match(short.body, /<div class="statv">1<\/div>\s*<div class="statl">Meetings booked<\/div>/);

  const long = await call('GET', '/app/analytics', { cookie, query: { days: '90' } });
  assert.match(long.body, /<div class="statv">2<\/div>\s*<div class="statl">Meetings booked<\/div>/);

  // A window nobody offered falls back to the default rather than being obeyed.
  const silly = await call('GET', '/app/analytics', { cookie, query: { days: '99999' } });
  assert.match(silly.body, /last 30 days/);
});

test('lead time is the median, so one far-off booking does not move it', async () => {
  const { cookie, id, ownerId } = await ownerIn('UTC');
  // Three booked a day ahead, one booked a year ahead.
  for (const d of ['2026-06-10', '2026-06-11', '2026-06-12']) {
    await booking(ownerId, id, { start: `${d}T09:00:00Z`, created: `${d}T09:00:00Z` });
  }
  await booking(ownerId, id, { start: '2026-06-13T09:00:00Z', created: '2025-06-13T09:00:00Z' });

  const page = await call('GET', '/app/analytics', { cookie });
  const m = page.body.match(/<div class="statv">([^<]*)<\/div>\s*<div class="statl">Booked ahead by<\/div>/);
  assert.equal(m?.[1]?.trim(), '0 days', 'the mean crept in — one outlier moved the figure');
});

test('the page names nobody, including after a booker deletes their details', async () => {
  const { cookie, id, ownerId } = await ownerIn('UTC');
  await db.query(
    `INSERT INTO bookings (booking_id, owner_id, schedule_id, starts_at, ends_at, status,
                           booker_name, booker_email, created_at)
     VALUES ('bk', $1, $2, '2026-06-10T09:00:00Z', '2026-06-10T09:30:00Z', 'confirmed',
             'Ada Lovelace', 'ada@example.com', '2026-06-01T00:00:00Z')`,
    [ownerId, id]);

  const page = await call('GET', '/app/analytics', { cookie });
  assert.ok(!page.body.includes('ada@example.com'), 'an address reached the dashboard');
  assert.ok(!page.body.includes('Ada Lovelace'), 'a booker was named on the dashboard');

  // After deletion the row remains with its identity emptied; the count stands,
  // because the count was never about the identity.
  await db.query(
    `UPDATE bookings SET booker_name = NULL, booker_email = NULL WHERE booking_id = 'bk'`);
  const after = await call('GET', '/app/analytics', { cookie });
  assert.match(after.body, /<div class="statv">1<\/div>\s*<div class="statl">Meetings booked<\/div>/);
});

test('one owner\'s numbers are their own', async () => {
  const { id, ownerId } = await ownerIn('UTC');
  await booking(ownerId, id, { start: '2026-06-10T09:00:00Z' });

  await db.query(`INSERT INTO invites (code) VALUES ('inv-b')`);
  const r2 = await call('POST', '/signup', {
    form: { invite: 'inv-b', email: 'other@example.com', display_name: 'Ot', timezone: 'UTC' } });
  const page = await call('GET', '/app/analytics', { cookie: cookieOf(r2 as never) });
  assert.match(page.body, /<div class="statv">0<\/div>\s*<div class="statl">Meetings booked<\/div>/);
});

test('an empty account gets a page, not an error', async () => {
  const { cookie } = await ownerIn('UTC');
  const page = await call('GET', '/app/analytics', { cookie });
  assert.equal(page.status, 200);
  assert.match(page.body, /Nothing booked in this window/);
});
