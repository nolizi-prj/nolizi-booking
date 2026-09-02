/**
 * P2 — availability sets, event-type settings, the parity routes.
 *
 * The claims: hours live on a named SET shared by event types; date overrides
 * replace a day (S11) including making it unavailable; a fixed date range
 * clamps the window; locations reach the mails and pages; /owner and
 * /owner/event resolve; holiday import materialises overrides.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startPostgres, type TestPostgres } from './support/pg.ts';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';
import { CalendarHub, type BookingEvent, type CalendarProvider, type CreatedEvent, type ProviderCalendar, type ProviderTokens } from '../src/calendars.ts';
import type { Interval } from '@pumasi/booking-core';

const KEY = Buffer.alloc(32, 9).toString('base64');
const NOW = '2026-06-01T08:00:00Z'; // a Monday
let pg: TestPostgres;
let db: Database;
let deps: AppDeps;
let mail: RecordingMail;
let fake: MeetProvider;

class MeetProvider implements CalendarProvider {
  readonly id = 'google' as const;
  created: BookingEvent[] = [];
  authUrl(): string { return 'https://fake.example/auth'; }
  async exchangeCode(): Promise<ProviderTokens> {
    return { refreshToken: 'r', accessToken: 'a', expiresAt: '2026-06-01T09:00:00Z',
      accountEmail: 'owner@example.com', scopeLevel: 'events' };
  }
  async refresh() { return { accessToken: 'a2', expiresAt: '2026-06-01T09:00:00Z' }; }
  async listCalendars(): Promise<ProviderCalendar[]> {
    return [{ id: 'primary', name: 'Personal', primary: true }];
  }
  async freeBusy(): Promise<Interval[]> { return []; }
  async createEvent(_a: string, _c: string, ev: BookingEvent): Promise<CreatedEvent> {
    this.created.push(ev);
    return { eventId: `evt-${this.created.length}`, meetUrl: ev.conference ? 'https://meet.google.com/fake-code' : undefined };
  }
  async moveEvent(): Promise<void> {}
  async deleteEvent(): Promise<void> {}
  async revoke(): Promise<void> {}
}

before(async () => {
  pg = await startPostgres('parity');
  db = await createPostgresDriver(pg.url);
  await migrate(db);
});
after(async () => { await db?.close(); await pg?.stop(); });

beforeEach(async () => {
  await db.query(`TRUNCATE sign_in_tokens, sessions, invites, bookings, idempotency_keys,
    availability_rules, date_overrides, schedules, owners, calendar_connections,
    connection_calendars, availability_sets, set_rules, set_overrides RESTART IDENTITY CASCADE`);
  await db.query(`DELETE FROM rate_events`);
  mail = new RecordingMail();
  fake = new MeetProvider();
  deps = {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: 'https://booking.test' } as NodeJS.ProcessEnv),
    mail: new RetryingMail(mail),
    now: () => NOW,
    ready: () => true,
    calendars: new CalendarHub({ google: fake }, KEY, () => NOW),
  };
});

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string; query: Record<string,string>; ip: string }> = {}) =>
  handle(deps, { method, path, ip: opts.ip ?? '3.3.3.3', form: opts.form, cookie: opts.cookie, query: opts.query });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

async function makeOwner(email = 'p2@example.com'): Promise<{ cookie: string; ownerId: string }> {
  await db.query(`INSERT INTO invites (code) VALUES ($1)`, [`inv-${email}`]);
  const r = await call('POST', '/signup', {
    form: { invite: `inv-${email}`, email, display_name: 'Pat', timezone: 'UTC' },
  });
  const { rows } = await db.query(`SELECT owner_id FROM owners WHERE email = $1`, [email]);
  return { cookie: cookieOf(r as never), ownerId: String(rows[0]!['owner_id']) };
}

async function makeEvent(cookie: string, slug: string, title = 'Intro'): Promise<string> {
  const r = await call('POST', '/app/schedules', {
    cookie, form: { title, slug, duration_minutes: '30' },
  });
  return String(r.headers['location']).split('/').pop()!;
}

async function setHours(cookie: string, setId: string, days: Record<string, [string, string]>) {
  const form: Record<string, string> = {};
  for (const [d, [a, b]] of Object.entries(days)) { form[`${d}_start`] = a; form[`${d}_end`] = b; }
  return call('POST', `/app/availability/${setId}/hours`, { cookie, form });
}

async function setOf(scheduleId: string): Promise<string> {
  const { rows } = await db.query(
    `SELECT availability_set_id FROM schedules WHERE schedule_id = $1`, [scheduleId]);
  return String(rows[0]!['availability_set_id']);
}

test('an event type is born holding an availability set', async () => {
  const { cookie } = await makeOwner();
  const id = await makeEvent(cookie, 'intro');
  const setId = await setOf(id);
  assert.ok(setId && setId !== 'null');
  const sets = await db.query(`SELECT name FROM availability_sets`);
  assert.equal(sets.rows.length, 1);
});

test('two event types share one set: saving hours moves both pages', async () => {
  const { cookie } = await makeOwner();
  const a = await makeEvent(cookie, 'intro');
  await makeEvent(cookie, 'longer', 'Longer');
  const setId = await setOf(a);
  await setHours(cookie, setId, { MO: ['09:00', '10:00'] });

  const pageA = await call('GET', '/intro');
  const pageB = await call('GET', '/longer');
  assert.ok(pageA.body.includes('data-start="2026-06-01T09:00:00Z"'));
  assert.ok(pageB.body.includes('data-start="2026-06-01T09:00:00Z"'));
  assert.ok(!pageA.body.includes('data-start="2026-06-01T10:00:00Z"'));

  await setHours(cookie, setId, { MO: ['12:00', '13:00'] });
  const pageA2 = await call('GET', '/intro');
  const pageB2 = await call('GET', '/longer');
  assert.ok(!pageA2.body.includes('data-start="2026-06-01T09:00:00Z"'));
  assert.ok(pageB2.body.includes('data-start="2026-06-01T12:00:00Z"'));
});

test('S11 · an override replaces the day; an empty override closes it', async () => {
  const { cookie } = await makeOwner();
  const id = await makeEvent(cookie, 'intro');
  const setId = await setOf(id);
  await setHours(cookie, setId, { MO: ['09:00', '17:00'] });

  // Window override: only 14:00–15:00 that Monday.
  await call('POST', `/app/availability/${setId}/overrides`, {
    cookie, form: { date: '2026-06-01', start: '14:00', end: '15:00' },
  });
  let page = await call('GET', '/intro');
  assert.ok(!page.body.includes('data-start="2026-06-01T09:00:00Z"'));
  assert.ok(page.body.includes('data-start="2026-06-01T14:00:00Z"'));

  // Full-day closure: date present, no windows.
  await call('POST', `/app/availability/${setId}/overrides`, {
    cookie, form: { date: '2026-06-01' },
  });
  page = await call('GET', '/intro');
  assert.ok(!page.body.includes('data-start="2026-06-01T'));
  // Next Monday unaffected.
  assert.ok(page.body.includes('data-start="2026-06-08T09:00:00Z"'));

  // Removal restores the weekly hours.
  await call('POST', `/app/availability/${setId}/overrides`, {
    cookie, form: { remove: '2026-06-01' },
  });
  page = await call('GET', '/intro');
  assert.ok(page.body.includes('data-start="2026-06-01T09:00:00Z"'));

  // Out-of-office ranges are expanded atomically into closed date overrides.
  const range = await call('POST', `/app/availability/${setId}/overrides`, {
    cookie, form: { date: '2026-06-01', through: '2026-06-03' },
  });
  assert.equal(range.status, 303);
  const closed = await db.query(
    `SELECT local_date FROM set_overrides WHERE set_id = $1 ORDER BY local_date`, [setId]);
  assert.deepEqual(closed.rows.map((x) => String(x['local_date']).slice(0, 10)),
    ['2026-06-01', '2026-06-02', '2026-06-03']);
  const tooLong = await call('POST', `/app/availability/${setId}/overrides`, {
    cookie, form: { date: '2026-06-01', through: '2026-10-01' },
  });
  assert.equal(tooLong.status, 400);
});

test('a fixed date range clamps the bookable window at both ends', async () => {
  const { cookie } = await makeOwner();
  const id = await makeEvent(cookie, 'intro');
  const setId = await setOf(id);
  await setHours(cookie, setId, { MO: ['09:00', '17:00'] });

  const save = await call('POST', `/app/event/${id}`, {
    cookie, form: {
      title: 'Intro', duration_minutes: '30', granularity_minutes: '30',
      buffer_before_minutes: '0', buffer_after_minutes: '0',
      minimum_notice_minutes: '0', maximum_horizon_days: '30',
      max_bookings_per_day: '', location_kind: 'custom', location_value: '',
      available_from: '2026-06-08', available_until: '2026-06-08',
    },
  });
  assert.equal(save.status, 303);

  const page = await call('GET', '/intro');
  assert.ok(!page.body.includes('data-start="2026-06-01T'), 'before range still offered');
  assert.ok(page.body.includes('data-start="2026-06-08T09:00:00Z"'), 'in-range day missing');
});

test('settings save changes duration and location, and the page shows them', async () => {
  const { cookie } = await makeOwner();
  const id = await makeEvent(cookie, 'intro');
  const setId = await setOf(id);
  await setHours(cookie, setId, { MO: ['09:00', '17:00'] });

  await call('POST', `/app/event/${id}`, {
    cookie, form: {
      title: 'Coffee chat', duration_minutes: '60', granularity_minutes: '60',
      buffer_before_minutes: '0', buffer_after_minutes: '0',
      minimum_notice_minutes: '0', maximum_horizon_days: '30',
      max_bookings_per_day: '', location_kind: 'in_person',
      location_value: '12 Main St', available_from: '', available_until: '',
    },
  });
  const page = await call('GET', '/intro');
  assert.ok(page.body.includes('Coffee chat'));
  assert.ok(page.body.includes('60 minutes'));
  assert.ok(page.body.includes('12 Main St'));
});

test('a meet event type mints a conference and the mails carry the link', async () => {
  const { cookie, ownerId } = await makeOwner();
  const id = await makeEvent(cookie, 'intro');
  const setId = await setOf(id);
  await setHours(cookie, setId, { MO: ['09:00', '17:00'] });
  await call('POST', `/app/event/${id}`, {
    cookie, form: {
      title: 'Intro', duration_minutes: '30', granularity_minutes: '30',
      buffer_before_minutes: '0', buffer_after_minutes: '0',
      minimum_notice_minutes: '0', maximum_horizon_days: '30',
      max_bookings_per_day: '', location_kind: 'meet', location_value: '',
      available_from: '', available_until: '',
    },
  });
  const hub = deps.calendars!;
  await hub.saveConnection(db, ownerId, fake, await fake.exchangeCode());

  const r = await call('POST', '/intro/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Ada', email: 'ada@example.com' },
  });
  assert.equal(r.status, 200);
  assert.equal(fake.created[0]?.conference, true);
  const confirmed = mail.sent.find((m) => m.kind === 'confirmed' && m.to === 'ada@example.com');
  assert.ok(confirmed?.location?.includes('meet.google.com'), 'meet link missing from mail');
  const b = await db.query(`SELECT meet_url FROM bookings WHERE status = 'confirmed'`);
  assert.ok(String(b.rows[0]!['meet_url']).includes('meet.google.com'));
});

test('/owner lists event types; /owner/event serves the booking page', async () => {
  const { cookie } = await makeOwner('pat@example.com');
  const id = await makeEvent(cookie, 'intro');
  const setId = await setOf(id);
  await setHours(cookie, setId, { MO: ['09:00', '17:00'] });

  const landing = await call('GET', '/pat');
  assert.equal(landing.status, 200);
  assert.ok(landing.body.includes('href="/pat/intro"'));

  const page = await call('GET', '/pat/intro');
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('data-start="2026-06-01T09:00:00Z"'));
});

test('holiday import materialises removable full-day overrides', async () => {
  const { cookie } = await makeOwner();
  const id = await makeEvent(cookie, 'intro');
  const setId = await setOf(id);
  await setHours(cookie, setId, { MO: ['09:00', '17:00'] });

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => {
    if (String(url).includes('date.nager.at')) {
      const year = String(url).includes('/2026/') ? 2026 : 2027;
      return new Response(JSON.stringify([
        { date: `${year}-06-08`, global: true },
        { date: `${year}-01-01`, global: true },   // in the past for 2026
        { date: `${year}-12-25`, global: false },  // regional: skipped
      ]), { status: 200 });
    }
    return realFetch(url as never);
  }) as typeof fetch;
  try {
    const r = await call('POST', `/app/availability/${setId}/holidays`, {
      cookie, form: { country: 'US' },
    });
    assert.equal(r.status, 303);
  } finally {
    globalThis.fetch = realFetch;
  }

  const page = await call('GET', '/intro');
  assert.ok(page.body.includes('data-start="2026-06-01T09:00:00Z"'), 'ordinary Monday kept');
  assert.ok(!page.body.includes('data-start="2026-06-08T'), 'holiday Monday still offered');
  const ov = await db.query(`SELECT local_date FROM set_overrides ORDER BY local_date`);
  assert.deepEqual(ov.rows.map((x) => String(x['local_date']).slice(0, 10)),
    ['2026-06-08', '2027-01-01', '2027-06-08']);
});

test("another owner cannot edit my set or my event type (I4)", async () => {
  const { cookie } = await makeOwner('a@example.com');
  const id = await makeEvent(cookie, 'intro');
  const setId = await setOf(id);
  const other = await makeOwner('b@example.com');

  const hours = await setHours(other.cookie, setId, { MO: ['09:00', '10:00'] });
  assert.equal(hours.status, 404);
  const settings = await call('POST', `/app/event/${id}`, {
    cookie: other.cookie, form: { title: 'Hijacked' },
  });
  assert.equal(settings.status, 404);
});

test('S9b · a weekly booking limit closes the rest of that week, not the next', async () => {
  const { cookie } = await makeOwner();
  const id = await makeEvent(cookie, 'intro');
  const setId = await setOf(id);
  await setHours(cookie, setId, { MO: ['09:00', '17:00'], TU: ['09:00', '17:00'] });

  const save = await call('POST', `/app/event/${id}`, {
    cookie, form: {
      title: 'Intro', duration_minutes: '30', granularity_minutes: '30',
      buffer_before_minutes: '0', buffer_after_minutes: '0',
      minimum_notice_minutes: '0', maximum_horizon_days: '30',
      max_bookings_per_day: '', location_kind: 'custom', location_value: '',
      available_from: '', available_until: '', max_bookings_per_week: '1',
    },
  });
  assert.equal(save.status, 303);

  // Nothing booked yet: the week is open.
  assert.ok((await call('GET', '/intro')).body.includes('data-start="2026-06-01T09:00:00Z"'));

  await call('POST', '/intro/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'Ada', email: 'ada@example.com' } });

  const page = await call('GET', '/intro');
  assert.ok(!page.body.includes('data-start="2026-06-01T10:00:00Z"'), 'same day still offered');
  assert.ok(!page.body.includes('data-start="2026-06-02T'), 'the rest of the week still offered');
  assert.ok(page.body.includes('data-start="2026-06-08T09:00:00Z"'), 'the NEXT week was closed too');
});

test('S9b · a minutes cap refuses the slot that would overrun it', async () => {
  const { cookie } = await makeOwner();
  const id = await makeEvent(cookie, 'intro');
  const setId = await setOf(id);
  await setHours(cookie, setId, { MO: ['09:00', '17:00'] });
  await call('POST', `/app/event/${id}`, {
    cookie, form: {
      title: 'Intro', duration_minutes: '30', granularity_minutes: '30',
      buffer_before_minutes: '0', buffer_after_minutes: '0',
      minimum_notice_minutes: '0', maximum_horizon_days: '30',
      max_bookings_per_day: '', location_kind: 'custom', location_value: '',
      available_from: '', available_until: '', max_minutes_per_day: '60',
    },
  });
  // One 30-minute booking leaves 30 minutes: still offered.
  await call('POST', '/intro/book', {
    form: { start: '2026-06-01T09:00:00Z', end: '2026-06-01T09:30:00Z',
            name: 'A', email: 'a@example.com' } });
  assert.ok((await call('GET', '/intro')).body.includes('data-start="2026-06-01T10:00:00Z"'));
  // A second exhausts the hour: the day closes.
  await call('POST', '/intro/book', {
    form: { start: '2026-06-01T10:00:00Z', end: '2026-06-01T10:30:00Z',
            name: 'B', email: 'b@example.com' } });
  const page = await call('GET', '/intro');
  assert.ok(!page.body.includes('data-start="2026-06-01T'), 'the day should be closed');
});
