/**
 * SPEC-0003 — calendar connections.
 *
 * The claims under test, in the order the intent statement makes them:
 *   1. busy times in a connected calendar stop being offered;
 *   2. a booking made here lands in the calendar, and cancel/move follow;
 *   3. while the calendar cannot be consulted, the service refuses to offer
 *      or accept ANY time (fail closed) — a broken connection included;
 *   4. disconnecting deletes what we hold, in the same breath;
 *   5. credentials at rest are sealed — a copied row is not a credential.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startPostgres, type TestPostgres } from './support/pg.ts';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';
import { CalendarHub, type BookingEvent, type CalendarProvider, type ProviderCalendar, type ProviderTokens, type ScopeLevel } from '../src/calendars.ts';
import { importSealKey, open, seal } from '../src/seal.ts';
import type { Interval } from '@pumasi/booking-core';

const KEY = Buffer.alloc(32, 7).toString('base64');
const NOW = '2026-06-01T08:00:00Z'; // a Monday
let pg: TestPostgres;
let db: Database;
let deps: AppDeps;
let fake: FakeProvider;
let hub: CalendarHub;

/** A provider that answers from memory and records what was asked of it. */
class FakeProvider implements CalendarProvider {
  readonly id = 'google' as const;
  busy: Interval[] = [];
  failFreeBusy = false;
  created: { calendarId: string; ev: BookingEvent }[] = [];
  moved: { eventId: string; start: string; end: string }[] = [];
  deleted: string[] = [];
  revoked: string[] = [];
  calendars: ProviderCalendar[] = [
    { id: 'primary', name: 'Personal', primary: true },
    { id: 'work@group', name: 'Work', primary: false },
  ];

  authUrl(opts: { state: string; scopeLevel: ScopeLevel }): string {
    return `https://fake.example/auth?state=${opts.state}&level=${opts.scopeLevel}`;
  }
  async exchangeCode(code: string): Promise<ProviderTokens> {
    return {
      refreshToken: `refresh-${code}`,
      accessToken: `access-${code}`,
      expiresAt: '2026-06-01T09:00:00Z',
      accountEmail: 'owner@example.com',
      scopeLevel: code.startsWith('ev') ? 'events' : 'freebusy',
    };
  }
  async refresh(): Promise<{ accessToken: string; expiresAt: string }> {
    return { accessToken: 'access-refreshed', expiresAt: '2026-06-01T09:00:00Z' };
  }
  async listCalendars(): Promise<ProviderCalendar[]> {
    return this.calendars;
  }
  async freeBusy(): Promise<Interval[]> {
    if (this.failFreeBusy) throw new Error('provider down');
    return this.busy;
  }
  async createEvent(_a: string, calendarId: string, ev: BookingEvent): Promise<{ eventId: string; meetUrl?: string }> {
    this.created.push({ calendarId, ev });
    return { eventId: `evt-${this.created.length}` };
  }
  async moveEvent(_a: string, _c: string, eventId: string, start: string, end: string): Promise<void> {
    this.moved.push({ eventId, start, end });
  }
  async deleteEvent(_a: string, _c: string, eventId: string): Promise<void> {
    this.deleted.push(eventId);
  }
  async revoke(refreshToken: string): Promise<void> {
    this.revoked.push(refreshToken);
  }
}

before(async () => {
  pg = await startPostgres('calendar');
  db = await createPostgresDriver(pg.url);
  await migrate(db);
});
after(async () => { await db?.close(); await pg?.stop(); });

beforeEach(async () => {
  await db.query(`TRUNCATE sign_in_tokens, sessions, invites, bookings, idempotency_keys,
    availability_rules, date_overrides, schedules, owners, calendar_connections,
    connection_calendars RESTART IDENTITY CASCADE`);
  await db.query(`DELETE FROM rate_events`);
  fake = new FakeProvider();
  hub = new CalendarHub({ google: fake }, KEY, () => NOW);
  deps = {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: 'https://booking.test' } as NodeJS.ProcessEnv),
    mail: new RetryingMail(new RecordingMail()),
    now: () => NOW,
    ready: () => true,
    calendars: hub,
  };
});

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string; query: Record<string,string>; ip: string }> = {}) =>
  handle(deps, { method, path, ip: opts.ip ?? '9.9.9.9', form: opts.form, cookie: opts.cookie, query: opts.query });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

async function makeOwnerWithPage(): Promise<{ cookie: string; ownerId: string }> {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-cal')`);
  const signup = await call('POST', '/signup', {
    form: { invite: 'inv-cal', email: 'owner@example.com', display_name: 'Owner', timezone: 'UTC' },
  });
  const cookie = cookieOf(signup as never);
  await call('POST', '/app/schedules', { cookie, form: { title: 'Intro', slug: 'intro', duration_minutes: '30' } });
  const sched = await db.query(`SELECT schedule_id, owner_id FROM schedules WHERE slug = 'intro'`);
  const scheduleId = String(sched.rows[0]!['schedule_id']);
  const ownerId = String(sched.rows[0]!['owner_id']);
  await call('POST', `/app/schedules/${scheduleId}/availability`, {
    cookie, form: { MO_start: '09:00', MO_end: '17:00' },
  });
  return { cookie, ownerId };
}

async function connect(ownerId: string, scope: 'fb' | 'ev' = 'fb'): Promise<string> {
  const tokens = await fake.exchangeCode(scope === 'ev' ? 'ev-code' : 'fb-code');
  return hub.saveConnection(db, ownerId, fake, tokens);
}

// ── 5 · sealing ────────────────────────────────────────────────────────────

test('sealed values round-trip; a tampered row opens to nothing', async () => {
  const key = await importSealKey(KEY);
  const sealed = await seal(key, 'the-refresh-token');
  assert.equal(await open(key, sealed), 'the-refresh-token');
  assert.ok(!sealed.includes('the-refresh-token'));
  const tampered = sealed.slice(0, -4) + 'AAAA';
  assert.equal(await open(key, tampered), undefined);
});

test('the stored row never contains the raw token', async () => {
  const { ownerId } = await makeOwnerWithPage();
  await connect(ownerId);
  const { rows } = await db.query(`SELECT refresh_token FROM calendar_connections`);
  assert.ok(!String(rows[0]!['refresh_token']).includes('refresh-fb-code'));
});

// ── 1 · busy times stop being offered ──────────────────────────────────────

test('a busy interval in the connected calendar removes exactly those slots', async () => {
  const { ownerId } = await makeOwnerWithPage();
  await connect(ownerId);
  fake.busy = [{ start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z' }];

  const page = await call('GET', '/intro');
  assert.equal(page.status, 200);
  assert.ok(!page.body.includes('data-start="2026-06-01T10:00:00Z"'), 'busy slot still offered');
  assert.ok(page.body.includes('data-start="2026-06-01T10:30:00Z"'), 'free slot missing');
});

test('a busy time that appears after the page loaded blocks the booking at commit', async () => {
  const { ownerId } = await makeOwnerWithPage();
  await connect(ownerId);

  fake.busy = [{ start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z' }];
  const r = await call('POST', '/intro/book', {
    form: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z',
            name: 'Ada', email: 'ada@example.com' },
  });
  assert.equal(r.status, 409);
});

// ── 3 · fail closed ────────────────────────────────────────────────────────

test('while the calendar cannot be consulted, no times are offered and none accepted', async () => {
  const { ownerId } = await makeOwnerWithPage();
  await connect(ownerId);
  fake.failFreeBusy = true;

  const page = await call('GET', '/intro');
  assert.equal(page.status, 503);
  assert.ok(!page.body.includes('data-start='));

  const book = await call('POST', '/intro/book', {
    form: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z',
            name: 'Ada', email: 'ada@example.com' },
  });
  assert.equal(book.status, 503);
});

test('a connection in error state refuses until reconnected or removed', async () => {
  const { ownerId } = await makeOwnerWithPage();
  const id = await connect(ownerId);
  await db.query(`UPDATE calendar_connections SET status = 'error' WHERE connection_id = $1`, [id]);
  const page = await call('GET', '/intro');
  assert.equal(page.status, 503);
});

test('deselecting every calendar is a choice, not a blind spot — slots return', async () => {
  const { ownerId } = await makeOwnerWithPage();
  const id = await connect(ownerId);
  await db.query(`UPDATE connection_calendars SET check_conflicts = 0 WHERE connection_id = $1`, [id]);
  fake.failFreeBusy = true; // must not even be asked
  const page = await call('GET', '/intro');
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('data-start='));
});

// ── 2 · write-back, and cancel/move follow ─────────────────────────────────

test('a booking lands in the destination calendar; cancel deletes the event', async () => {
  const { ownerId } = await makeOwnerWithPage();
  await connect(ownerId, 'ev');

  const r = await call('POST', '/intro/book', {
    form: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z',
            name: 'Ada Lovelace', email: 'ada@example.com' },
  });
  assert.equal(r.status, 200);
  assert.equal(fake.created.length, 1);
  assert.equal(fake.created[0]!.calendarId, 'primary');
  assert.ok(fake.created[0]!.ev.title.includes('Ada Lovelace'));

  const b = await db.query(`SELECT token, calendar_event_id FROM bookings WHERE status = 'confirmed'`);
  assert.equal(String(b.rows[0]!['calendar_event_id']), 'evt-1');

  const token = String(b.rows[0]!['token']);
  const cancel = await call('POST', `/b/${token}/cancel`);
  assert.equal(cancel.status, 200);
  assert.deepEqual(fake.deleted, ['evt-1']);
});

test('a reschedule moves the calendar event with it', async () => {
  const { ownerId } = await makeOwnerWithPage();
  await connect(ownerId, 'ev');

  await call('POST', '/intro/book', {
    form: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z',
            name: 'Ada', email: 'ada@example.com' },
  });
  const b = await db.query(`SELECT token FROM bookings WHERE status = 'confirmed'`);
  const token = String(b.rows[0]!['token']);

  const move = await call('POST', `/b/${token}/reschedule`, {
    form: { start: '2026-06-01T11:00:00Z', end: '2026-06-01T11:30:00Z' },
  });
  assert.equal(move.status, 200);
  assert.equal(fake.moved.length, 1);
  assert.equal(fake.moved[0]!.start, '2026-06-01T11:00:00Z');
});

test('a freebusy-only connection never receives events', async () => {
  const { ownerId } = await makeOwnerWithPage();
  await connect(ownerId, 'fb');
  const r = await call('POST', '/intro/book', {
    form: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z',
            name: 'Ada', email: 'ada@example.com' },
  });
  assert.equal(r.status, 200); // the booking succeeds…
  assert.equal(fake.created.length, 0); // …and no event is attempted
});

test('a calendar outage at write-back never invalidates the booking (M3)', async () => {
  const { ownerId } = await makeOwnerWithPage();
  await connect(ownerId, 'ev');
  fake.createEvent = async () => { throw new Error('calendar down'); };
  const r = await call('POST', '/intro/book', {
    form: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z',
            name: 'Ada', email: 'ada@example.com' },
  });
  assert.equal(r.status, 200);
  const b = await db.query(`SELECT count(*)::int AS c FROM bookings WHERE status = 'confirmed'`);
  assert.equal(Number(b.rows[0]!['c']), 1);
});

// ── 4 · disconnect deletes what we hold ────────────────────────────────────

test('disconnecting removes tokens and calendar rows, and revokes remotely', async () => {
  const { cookie, ownerId } = await makeOwnerWithPage();
  const id = await connect(ownerId);

  const r = await call('POST', `/app/calendar/${id}/delete`, { cookie });
  assert.equal(r.status, 303);
  const conns = await db.query(`SELECT count(*)::int AS c FROM calendar_connections`);
  const cals = await db.query(`SELECT count(*)::int AS c FROM connection_calendars`);
  assert.equal(Number(conns.rows[0]!['c']), 0);
  assert.equal(Number(cals.rows[0]!['c']), 0);
  assert.deepEqual(fake.revoked, ['refresh-fb-code']);
});

test("another owner's session cannot delete my connection (I4)", async () => {
  const { ownerId } = await makeOwnerWithPage();
  const id = await connect(ownerId);
  await db.query(`INSERT INTO invites (code) VALUES ('inv-2')`);
  const other = await call('POST', '/signup', {
    form: { invite: 'inv-2', email: 'other@example.com', display_name: 'Other', timezone: 'UTC' },
  });
  const r = await call('POST', `/app/calendar/${id}/delete`, { cookie: cookieOf(other as never) });
  assert.equal(r.status, 404);
  const conns = await db.query(`SELECT count(*)::int AS c FROM calendar_connections`);
  assert.equal(Number(conns.rows[0]!['c']), 1);
});

test('deleting the account deletes calendar credentials with it (D3)', async () => {
  const { cookie, ownerId } = await makeOwnerWithPage();
  await connect(ownerId);
  await call('POST', '/app/delete', { cookie, form: { confirm: 'yes' } });
  const conns = await db.query(`SELECT count(*)::int AS c FROM calendar_connections`);
  assert.equal(Number(conns.rows[0]!['c']), 0);
});

// ── the connect flow over HTTP ─────────────────────────────────────────────

test('connect redirects to the provider; the callback stores the connection', async () => {
  const { cookie } = await makeOwnerWithPage();

  const start = await call('POST', '/app/calendar/google/connect', { cookie });
  assert.equal(start.status, 303);
  const url = new URL(start.headers['location']!);
  const state = url.searchParams.get('state')!;
  assert.ok(state.length > 0);

  const cb = await call('GET', '/oauth/google/callback', {
    query: { code: 'fb-code', state },
  });
  assert.equal(cb.status, 303);
  assert.equal(cb.headers['location'], '/app');

  const conns = await db.query(`SELECT account_email, scope_level FROM calendar_connections`);
  assert.equal(String(conns.rows[0]!['account_email']), 'owner@example.com');
  assert.equal(String(conns.rows[0]!['scope_level']), 'freebusy');

  const dash = await call('GET', '/app', { cookie });
  assert.ok(dash.body.includes('owner@example.com'));
});

test('a forged or stale state is refused and stores nothing', async () => {
  await makeOwnerWithPage();
  const cb = await call('GET', '/oauth/google/callback', {
    query: { code: 'fb-code', state: 'forged-state' },
  });
  assert.equal(cb.status, 400);
  const conns = await db.query(`SELECT count(*)::int AS c FROM calendar_connections`);
  assert.equal(Number(conns.rows[0]!['c']), 0);
});

test('an upgrade keeps the events grant even if a later reconnect is narrower', async () => {
  const { ownerId } = await makeOwnerWithPage();
  await connect(ownerId, 'ev');
  await connect(ownerId, 'fb'); // reconnect with narrower scope
  const conns = await db.query(`SELECT scope_level FROM calendar_connections`);
  assert.equal(String(conns.rows[0]!['scope_level']), 'events');
});
