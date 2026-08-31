/**
 * SPEC-0005 acceptance runner — Zoom connect tells the truth, and the room
 * stops being public. Frozen cases: service/spec/0005/acceptance/cases.json.
 *
 * `cases.json` is the truth; this file is the executable form of it. Two cases
 * (Z-002, Z-005) exist to fail against the tree at `5ca3b91` — for a defect
 * spec the proof is that the test fails *before* (lessons/L-006).
 *
 * The Zoom API is stubbed at `fetch`, so the assertions are about what this
 * service does on the wire rather than about a mock of its own making.
 */

import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { locationText, type Schedule } from '../src/schedules.ts';
import { createZoomMeeting, zoomAuthUrl } from '../src/video-zoom.ts';
import { VideoConnections } from '../src/video.ts';
import { importSealKey, open } from '../src/seal.ts';
import { migrate } from '../src/db.ts';
import { createPgliteDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';
import { integrationsPage } from '../src/pages.ts';
import { CalendarHub } from '../src/calendars.ts';

const KEY = Buffer.alloc(32, 7).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64');
const NOW = '2026-06-01T08:00:00Z';
const PMI = 'https://us02web.zoom.us/j/1112223333';

const baseSched: Schedule = {
  schedule_id: 'sched-1',
  owner_id: 'owner-1',
  slug: 'test-meeting',
  title: 'Strategy Session',
  owner_timezone: 'America/Chicago',
  owner_name: 'Test Host',
  duration_minutes: 30,
  granularity_minutes: 15,
  buffer_before_minutes: 0,
  buffer_after_minutes: 5,
  minimum_notice_minutes: 240,
  maximum_horizon_days: 60,
  max_bookings_per_day: null,
  max_bookings_per_week: null,
  max_bookings_per_month: null,
  max_minutes_per_day: null,
  max_minutes_per_week: null,
  availability_set_id: null,
  description: 'Team call',
  color: '#1a56db',
  location_kind: 'meet',
  location_value: null,
  available_from: null,
  available_until: null,
  scheduling_kind: 'solo',
  recurrence_rule: null,
  require_email_verification: false,
  org_id: null,
};

// ── the Zoom API, stubbed at the transport ─────────────────────────────────

interface ZoomCall { url: string; method: string; authorization?: string; body?: string }

type ZoomMode =
  | 'recording'          // creates happily
  | 'refresh-then-create'// the stored access token is stale; refresh, then create
  | 'refresh-fails'      // the grant is gone
  | 'failing'            // creation returns 400
  | '500'
  | 'throws';

let zoomCalls: ZoomCall[] = [];
let realFetch: typeof globalThis.fetch;

function stubZoom(mode: ZoomMode, mintedUrl = 'https://us02web.zoom.us/j/MINTED'): void {
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    if (!u.includes('zoom.us')) return realFetch(url as never, init as never);
    zoomCalls.push({
      url: u,
      method: init?.method ?? 'GET',
      authorization: (init?.headers as Record<string, string> | undefined)?.['authorization'],
      body: typeof init?.body === 'string' ? init.body : String(init?.body ?? ''),
    });
    if (mode === 'throws') throw new Error('network down');
    if (u.includes('/oauth/token')) {
      if (mode === 'refresh-fails') return new Response('invalid_grant', { status: 400 });
      return Response.json({
        access_token: 'fresh-access', refresh_token: 'rotated-refresh', expires_in: 3600,
      });
    }
    if (u.includes('/users/me/meetings')) {
      if (mode === 'failing') return new Response('bad request', { status: 400 });
      if (mode === '500') return new Response('boom', { status: 500 });
      return Response.json({ id: 987654321, join_url: mintedUrl, start_url: `${mintedUrl}?role=host` });
    }
    return new Response('unexpected', { status: 404 });
  }) as typeof globalThis.fetch;
}

// ── database-backed harness ────────────────────────────────────────────────

let db: Database;
let deps: AppDeps;
let mail: RecordingMail;

interface Env { [k: string]: string | undefined }

function makeDeps(env: Env = {}): AppDeps {
  mail = new RecordingMail();
  return {
    sql: db, tx: db,
    config: loadConfig({
      BASE_URL: 'https://booking.test', TOKEN_KEY: KEY, ...env,
    } as NodeJS.ProcessEnv),
    mail: new RetryingMail(mail),
    now: () => NOW,
    ready: () => true,
    // The `/oauth/*/callback` route is gated on a hub; every deployment that
    // can run the Zoom connect flow has one.
    calendars: new CalendarHub({}, KEY, () => NOW),
  };
}

const call = (method: string, path: string,
  opts: Partial<{ form: Record<string, string>; cookie: string; query: Record<string, string> }> = {}) =>
  handle(deps, { method, path, ip: '7.7.7.7', form: opts.form, cookie: opts.cookie, query: opts.query });

const cookieOf = (r: { headers: Record<string, string> }) => (r.headers['set-cookie'] ?? '').split(';')[0]!;

/** A signed-up owner with one bookable zoom event type. */
async function ownerWithZoomPage(locationValue: string | null = null) {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-z')`);
  const r = await call('POST', '/signup', {
    form: { invite: 'inv-z', email: 'zoomer@example.com', display_name: 'Zoe', timezone: 'UTC' },
  });
  const cookie = cookieOf(r as never);
  const created = await call('POST', '/app/schedules', {
    cookie, form: { title: 'Intro', slug: 'intro', duration_minutes: '30' },
  });
  const scheduleId = String(created.headers['location']).split('/').pop()!;
  const set = await db.query(`SELECT availability_set_id FROM schedules WHERE schedule_id = $1`, [scheduleId]);
  await call('POST', `/app/availability/${String(set.rows[0]!['availability_set_id'])}/hours`, {
    cookie, form: { MO_start: '09:00', MO_end: '17:00' },
  });
  await db.query(
    `UPDATE schedules SET location_kind = 'zoom', location_value = $2 WHERE schedule_id = $1`,
    [scheduleId, locationValue],
  );
  const ownerId = String((await db.query(
    `SELECT owner_id FROM schedules WHERE schedule_id = $1`, [scheduleId])).rows[0]!['owner_id']);
  return { cookie, scheduleId, ownerId };
}

const bookIntro = (start = '2026-06-01T10:00:00Z') =>
  call('POST', '/intro/book', {
    form: { start, end: start.replace(':00:00Z', ':30:00Z'), name: 'Ada',
            email: 'ada@example.com', booker_tz: 'UTC' },
  });

/** The location line the *booker* was sent — the confirmed audience. */
const bookerLocation = () => mail.sent.find((m) => m.kind === 'confirmed' && m.to === 'ada@example.com')?.location;

/** Put a connection in the database directly, for the cases that start connected. */
async function storeConnection(ownerId: string, over: Partial<{
  refreshToken: string; accessToken: string; expiresIn: number; email: string;
  personalMeetingUrl?: string; displayName: string;
}> = {}): Promise<string> {
  const store = new VideoConnections(KEY, () => NOW);
  return store.save(db, ownerId, {
    accessToken: over.accessToken ?? 'stored-access',
    refreshToken: over.refreshToken ?? 'stored-refresh',
    expiresIn: over.expiresIn ?? 3600,
    email: over.email ?? 'zoomer@zoom.us',
    personalMeetingUrl: 'personalMeetingUrl' in over ? over.personalMeetingUrl : undefined,
    displayName: over.displayName ?? 'Zoe Zoom',
  });
}

before(async () => {
  realFetch = globalThis.fetch;
  db = await createPgliteDriver();
  await migrate(db);
});
after(() => { globalThis.fetch = realFetch; });

beforeEach(async () => {
  for (const t of ['rate_events', 'idempotency_keys', 'booking_answers', 'bookings', 'jobs',
                   'availability_rules', 'set_rules', 'schedules', 'availability_sets',
                   'video_connections', 'calendar_connections', 'sessions', 'invites',
                   'contacts', 'owners']) {
    await db.query(`DELETE FROM ${t}`);
  }
  zoomCalls = [];
  globalThis.fetch = realFetch;
  deps = makeDeps();
});

// ── Z-001 · the connection is stored, and `schedules` is not touched ───────

test('Z-001 · connect stores the connection and writes nothing to schedules', async () => {
  const { cookie, scheduleId } = await ownerWithZoomPage(null);
  deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });

  // Zoom's token endpoint and profile, stubbed for the real callback route.
  globalThis.fetch = (async (url: unknown) => {
    const u = String(url);
    if (u.includes('/oauth/token')) {
      return Response.json({ access_token: 'a1', refresh_token: 'r1', expires_in: 3600 });
    }
    if (u.includes('/users/me')) {
      return Response.json({
        email: 'zoomer@zoom.us', personal_meeting_url: PMI, first_name: 'Zoe', last_name: 'Zoom',
      });
    }
    return new Response('no', { status: 404 });
  }) as typeof globalThis.fetch;

  const start = await call('GET', '/app/integrations/zoom/connect', { cookie });
  const state = new URL(String(start.headers['location'])).searchParams.get('state')!;
  const back = await call('GET', '/oauth/zoom/callback', { query: { code: 'c1', state } });
  assert.equal(back.status, 303, 'the callback completes');

  const sched = await db.query(`SELECT location_value FROM schedules WHERE schedule_id = $1`, [scheduleId]);
  assert.equal(sched.rows[0]!['location_value'], null,
    'Z1a — connect must not write the personal meeting URL onto the event type');

  const rows = await db.query(`SELECT * FROM video_connections`);
  assert.equal(rows.rows.length, 1, 'exactly one connection row');
  assert.equal(rows.rows[0]!['account_email'], 'zoomer@zoom.us');
  assert.equal(rows.rows[0]!['fallback_url'], PMI, 'the PMI is kept here, not on the schedule');
  assert.ok(rows.rows[0]!['refresh_token'], 'the credential is what gets stored');
});

test('Z-001 · a connection with no personal meeting room is still stored', async () => {
  const { ownerId } = await ownerWithZoomPage(null);
  const store = new VideoConnections(KEY, () => NOW);
  await store.save(db, ownerId, {
    accessToken: 'a', refreshToken: 'r', expiresIn: 3600, email: 'second@example.com',
  });
  const conn = await store.find(db, ownerId);
  assert.ok(conn, 'Z1e — the credential is the point; the fallback is not');
  assert.equal(conn!.fallbackUrl, undefined);
});

// ── Z-002 · no joinable link reaches an anonymous visitor (FAILS BEFORE) ───

test('Z-002 · the public booking page carries no joinable link', async () => {
  await ownerWithZoomPage(PMI);
  const page = await call('GET', '/intro');
  assert.equal(page.status, 200);
  assert.ok(!page.body.includes('us02web.zoom.us'),
    'Z2a — a stranger must not be shown a room they could join');
  assert.ok(!page.body.includes('1112223333'));
  assert.ok(page.body.includes('Zoom — link arrives with the confirmation'),
    'the page still says where the meeting is');
});

test('Z-002 · every conferencing kind is public-safe, minted or stored', () => {
  const pub = (kind: string, location_value: string | null, meetUrl?: string) =>
    locationText({ ...baseSched, location_kind: kind as Schedule['location_kind'], location_value },
      meetUrl, 'public')!;

  assert.equal(pub('meet', 'https://meet.google.com/abc-defg-hij'),
    'Google Meet — link arrives with the confirmation');
  assert.equal(pub('teams', 'https://teams.microsoft.com/l/meetup-join/xyz'),
    'Microsoft Teams — link arrives with the confirmation');
  assert.equal(pub('google_chat', 'https://chat.google.com/room/AAA'),
    'Google Chat — link arrives with the confirmation');
  assert.equal(pub('zoom', PMI), 'Zoom — link arrives with the confirmation');

  // A freshly minted URL is no more public than a stored one.
  assert.equal(pub('zoom', null, 'https://us02web.zoom.us/j/999'),
    'Zoom — link arrives with the confirmation');
  assert.equal(pub('meet', null, 'https://meet.google.com/mint-ed-now'),
    'Google Meet — link arrives with the confirmation');
});

// ── Z-003 · the non-conferencing kinds are not degraded ───────────────────

test('Z-003 · phone, in-person and custom still show what the owner typed', () => {
  const pub = (kind: string, location_value: string) =>
    locationText({ ...baseSched, location_kind: kind as Schedule['location_kind'], location_value },
      undefined, 'public');
  assert.equal(pub('phone', '+1 555 0100'), 'Phone — +1 555 0100');
  assert.equal(pub('in_person', 'Cafe Nero, 2nd floor'), 'Cafe Nero, 2nd floor');
  assert.equal(pub('custom', 'Ask on arrival'), 'Ask on arrival');
});

// ── Z-004 · credentials are sealed at rest ────────────────────────────────

test('Z-004 · Zoom credentials are sealed, and open only with TOKEN_KEY', async () => {
  const { ownerId } = await ownerWithZoomPage(null);
  await storeConnection(ownerId, {
    refreshToken: 'zoom-refresh-SENTINEL', accessToken: 'zoom-access-SENTINEL',
  });

  const row = (await db.query(`SELECT * FROM video_connections`)).rows[0]!;
  const serialised = JSON.stringify(row);
  assert.ok(!serialised.includes('zoom-refresh-SENTINEL'), 'Z1c — no credential in the clear');
  assert.ok(!serialised.includes('zoom-access-SENTINEL'));

  const opened = await open(await importSealKey(KEY), String(row['refresh_token']));
  assert.equal(opened, 'zoom-refresh-SENTINEL');

  const wrong = await open(await importSealKey(OTHER_KEY), String(row['refresh_token']));
  assert.equal(wrong, undefined, 'never a partial value under the wrong key');
});

// ── Z-005 · a stored link no longer suppresses minting (FAILS BEFORE) ─────

test('Z-005 · a stored fallback link does not suppress per-booking creation', async () => {
  const { ownerId } = await ownerWithZoomPage(PMI);
  deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
  await storeConnection(ownerId);
  stubZoom('recording');

  const r = await bookIntro();
  assert.ok(r.status === 200 && r.body.includes('Booked'), 'the booking is made');

  const creates = zoomCalls.filter((c) => c.url.includes('/users/me/meetings'));
  assert.equal(creates.length, 1, 'Z3a — exactly one meeting is created for the booking');
  assert.equal(creates[0]!.authorization, 'Bearer stored-access',
    'Z3b — created with the owner\'s own stored connection');
  assert.ok(bookerLocation()?.includes('MINTED'), 'the booker gets the per-booking room');
  assert.ok(!bookerLocation()?.includes('1112223333'), 'not the personal meeting room');
});

// ── Z-006 · refresh, rotation, and a dead grant ──────────────────────────

test('Z-006 · an expired token is refreshed and the rotated one is persisted', async () => {
  const { ownerId } = await ownerWithZoomPage(null);
  deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
  // expiresIn 0 → access_expires_at == NOW, which is already inside the slack.
  const connectionId = await storeConnection(ownerId, { refreshToken: 'old-refresh', expiresIn: 0 });
  stubZoom('refresh-then-create');

  await bookIntro();

  const refreshIdx = zoomCalls.findIndex((c) => c.url.includes('/oauth/token'));
  const createIdx = zoomCalls.findIndex((c) => c.url.includes('/users/me/meetings'));
  assert.ok(refreshIdx >= 0 && createIdx > refreshIdx, 'Z3c — refresh happens before the create');
  assert.ok(zoomCalls[refreshIdx]!.body?.includes('grant_type=refresh_token'));

  const row = (await db.query(
    `SELECT refresh_token FROM video_connections WHERE connection_id = $1`, [connectionId])).rows[0]!;
  const stored = await open(await importSealKey(KEY), String(row['refresh_token']));
  assert.equal(stored, 'rotated-refresh',
    'Z3c — Zoom rotates the refresh token; not persisting it locks the owner out');
  assert.ok(bookerLocation()?.includes('MINTED'));
});

test('Z-006 · a failed refresh marks the connection and never fails the booking', async () => {
  const { ownerId } = await ownerWithZoomPage(null);
  deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
  const connectionId = await storeConnection(ownerId, { expiresIn: 0 });
  stubZoom('refresh-fails');

  const r = await bookIntro();
  assert.ok(r.status === 200 && r.body.includes('Booked'), 'Z3e — the booking stands');

  const row = (await db.query(
    `SELECT status, error_reason FROM video_connections WHERE connection_id = $1`,
    [connectionId])).rows[0]!;
  assert.equal(row['status'], 'error');
  assert.ok(String(row['error_reason']).length > 0, 'the reason is recorded, so the card can say so');
});

// ── Z-007 · the fallback chain, in order, confirmed audience only ─────────

test('Z-007 · the fallback chain runs in the order the spec states', async () => {
  // 2 · the stored connection.
  {
    const { ownerId } = await ownerWithZoomPage(null);
    deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
    await storeConnection(ownerId);
    stubZoom('recording');
    await bookIntro();
    assert.ok(bookerLocation()?.includes('MINTED'), 'step 2 — the connection mints the room');
  }
  await beforeEachReset();

  // 3 · Server-to-Server, with no stored connection.
  {
    await ownerWithZoomPage(null);
    deps = makeDeps({ ZOOM_ACCOUNT_ID: 'acc', ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
    stubZoom('recording', 'https://us02web.zoom.us/j/S2S');
    await bookIntro();
    assert.ok(bookerLocation()?.includes('S2S'), 'step 3 — Server-to-Server mints it instead');
  }
  await beforeEachReset();

  // 4 · a link the owner typed, when minting fails.
  {
    const { ownerId } = await ownerWithZoomPage('https://us02web.zoom.us/j/typed');
    deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
    await storeConnection(ownerId, { personalMeetingUrl: PMI });
    stubZoom('failing');
    await bookIntro();
    assert.ok(bookerLocation()?.includes('/j/typed'), 'step 4 — the owner-typed link wins over the PMI');
  }
  await beforeEachReset();

  // 5 · the personal meeting room, last.
  {
    const { ownerId } = await ownerWithZoomPage(null);
    deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
    await storeConnection(ownerId, { personalMeetingUrl: PMI });
    stubZoom('failing');
    await bookIntro();
    assert.ok(bookerLocation()?.includes('1112223333'), 'step 5 — the personal room, disclosed on the card');
  }
  await beforeEachReset();

  // 6 · nothing at all.
  {
    await ownerWithZoomPage(null);
    deps = makeDeps();
    await bookIntro();
    assert.equal(bookerLocation(), 'Zoom — link arrives with the confirmation',
      'step 6 — the same line the public page shows');
  }
});

test('Z-007 · the calendar-minted URL outranks every Zoom step', () => {
  // Step 1 is the `meetUrl` the calendar write-back returned; the booking path
  // only enters the Zoom chain when there is none (`!meetUrl`).
  assert.equal(
    locationText({ ...baseSched, location_kind: 'zoom', location_value: PMI },
      'https://us02web.zoom.us/j/CALENDAR', 'confirmed'),
    'https://us02web.zoom.us/j/CALENDAR',
  );
});

// ── Z-008 · Zoom failing never fails a booking ───────────────────────────

test('Z-008 · a booking survives Zoom throwing, and 500ing', async () => {
  for (const mode of ['throws', '500'] as const) {
    await beforeEachReset();
    const { ownerId } = await ownerWithZoomPage(null);
    deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
    await storeConnection(ownerId);
    stubZoom(mode);

    const r = await bookIntro();
    assert.ok(r.status === 200 && r.body.includes('Booked'),
      `Z3e — the booking stands when Zoom ${mode}`);
    const rows = await db.query(`SELECT booking_id FROM bookings`);
    assert.equal(rows.rows.length, 1, 'the booking is committed');
    assert.ok(mail.sent.some((m) => m.kind === 'confirmed' && m.to === 'ada@example.com'),
      'the booker is still confirmed');
    assert.ok(mail.sent.some((m) => m.kind === 'confirmed' && m.to === 'zoomer@example.com'),
      'the host is still told');
  }
});

test('Z-008 · the owner token reaches only the token and meeting-creation endpoints', async () => {
  const { ownerId } = await ownerWithZoomPage(null);
  deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
  await storeConnection(ownerId);
  stubZoom('recording');
  await bookIntro();

  for (const c of zoomCalls) {
    assert.ok(
      c.url.includes('/oauth/token') || c.url.includes('/users/me/meetings'),
      `Z3f — unexpected Zoom endpoint contacted: ${c.url}`,
    );
  }
});

// ── Z-009 · the card says what it does ───────────────────────────────────

test('Z-009 · connected-state comes from the connection, not from a stamped link', async () => {
  const { cookie, ownerId } = await ownerWithZoomPage(PMI);

  // A stamped location_value is not a connection.
  const notConnected = await call('GET', '/app/integrations', { cookie });
  assert.ok(notConnected.body.includes('Not Connected'),
    'Z4b — a leftover location_value must not read as connected');

  await storeConnection(ownerId, { displayName: 'Zoe Zoom' });
  const connected = await call('GET', '/app/integrations', { cookie });
  assert.ok(connected.body.includes('Connected ✓'), 'Z4b — the stored row is what "connected" means');
  assert.ok(connected.body.includes('Zoe Zoom'), 'Z4c — checkable, not asserted');
});

test('Z-009 · Server-to-Server credentials alone read as connected', async () => {
  const { cookie } = await ownerWithZoomPage(null);
  deps = makeDeps({ ZOOM_ACCOUNT_ID: 'acc', ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
  const r = await call('GET', '/app/integrations', { cookie });
  assert.ok(r.body.includes('Connected ✓'));
});

test('Z-009 · the card copy states the fallback order and the never-public rule', () => {
  const html = integrationsPage({
    googleConnected: false, msConnected: false,
    zoomConnected: true, zoomAccount: 'zoomer@zoom.us', zoomStatus: 'active',
    baseUrl: 'https://booking.test',
  });
  assert.ok(/fall back/i.test(html), 'Z4a — it says what happens when Zoom cannot be reached');
  assert.ok(/personal meeting room/i.test(html), 'Z4a — and names the last resort');
  assert.ok(/never shows it before someone books|never shown on your public booking page/i.test(html),
    'Z4a/Z4d — and that the link is not public before a booking');
  assert.ok(/only when a per-booking room cannot be created/i.test(html),
    'Z4d — the static field says what it is for');
});

// ── Z-010 · disconnect, deletion, migrations ─────────────────────────────

test('Z-010 · disconnect removes the credential and the stamped link', async () => {
  const { cookie, ownerId, scheduleId } = await ownerWithZoomPage(PMI);
  await storeConnection(ownerId);

  await call('POST', '/app/integrations/zoom/disconnect', { cookie });

  const conns = await db.query(`SELECT 1 FROM video_connections WHERE owner_id = $1`, [ownerId]);
  assert.equal(conns.rows.length, 0, 'Z5a — verified by absence');
  const sched = await db.query(`SELECT location_value FROM schedules WHERE schedule_id = $1`, [scheduleId]);
  assert.equal(sched.rows[0]!['location_value'], null,
    'the only route by which an old stamp leaves the database');
});

test('Z-010 · deleting the account deletes the Zoom connection with it', async () => {
  const { cookie, ownerId } = await ownerWithZoomPage(null);
  await storeConnection(ownerId);

  await call('POST', '/app/delete', { cookie, form: { confirm: 'yes' } });

  const conns = await db.query(`SELECT 1 FROM video_connections WHERE owner_id = $1`, [ownerId]);
  assert.equal(conns.rows.length, 0,
    'Z5c — a third party\'s credential must not outlive the person who granted it');
});

test('Z-010 · the migration exists on both dialects and is registered for Workers', () => {
  const pg = readFileSync(fromServiceRoot('migrations/020_video_connections.sql'), 'utf8');
  const lite = readFileSync(fromServiceRoot('migrations-sqlite/016_video_connections.sql'), 'utf8');
  for (const sql of [pg, lite]) {
    assert.ok(/CREATE TABLE IF NOT EXISTS video_connections/.test(sql), 'Z6a — re-runnable');
    assert.ok(/refresh_token\s+TEXT NOT NULL/.test(sql));
    assert.ok(/fallback_url/.test(sql));
  }
  const worker = readFileSync(fromServiceRoot('src/worker.ts'), 'utf8');
  assert.ok(worker.includes("016_video_connections.sql"),
    'Z6b — a migration the Workers deployment cannot see does not exist there (L-009)');
});

/**
 * Sources, not build output: this file also runs from `.build/test/`, where
 * `../migrations` does not exist. Walk up to the service root instead.
 */
function fromServiceRoot(rel: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'migrations')) && existsSync(join(dir, 'src'))) return join(dir, rel);
    dir = dirname(dir);
  }
  throw new Error('service root not found from ' + import.meta.url);
}

// ── SPEC-0002 surface kept alive ─────────────────────────────────────────

test('locationText renders the confirmed audience for every provider', () => {
  assert.equal(
    locationText({ ...baseSched, location_kind: 'meet' }, 'https://meet.google.com/abc-defg-hij'),
    'https://meet.google.com/abc-defg-hij',
  );
  assert.equal(
    locationText({ ...baseSched, location_kind: 'meet' }),
    'Google Meet — link arrives with the confirmation',
  );
  assert.equal(
    locationText({ ...baseSched, location_kind: 'teams' }, 'https://teams.microsoft.com/l/meetup-join/xyz'),
    'https://teams.microsoft.com/l/meetup-join/xyz',
  );
  assert.equal(
    locationText({ ...baseSched, location_kind: 'zoom', location_value: PMI }),
    `Zoom — ${PMI}`,
  );
  assert.equal(
    // Z3d · minted outranks stored, which is the whole point of minting.
    locationText({ ...baseSched, location_kind: 'zoom', location_value: PMI },
      'https://us02web.zoom.us/j/9876543210'),
    'https://us02web.zoom.us/j/9876543210',
  );
  assert.equal(
    locationText({ ...baseSched, location_kind: 'google_chat', location_value: 'https://chat.google.com/room/AAA' }),
    'Google Chat Space — https://chat.google.com/room/AAA',
  );
});

test('createZoomMeeting handles missing credentials gracefully without throwing', async () => {
  const res = await createZoomMeeting({
    topic: 'Test Meeting', startTime: '2026-09-01T15:00:00Z',
    durationMinutes: 30, timezone: 'America/Chicago',
  }, {});
  assert.equal(res, null);
});

test('zoomAuthUrl produces valid Zoom OAuth URL with state and redirectUri', () => {
  const url = zoomAuthUrl({
    clientId: 'zoom-client-123',
    redirectUri: 'https://booking.pumasi.ai/oauth/zoom/callback',
    state: 'test-state-abc',
  });
  assert.ok(url.startsWith('https://zoom.us/oauth/authorize?'));
  assert.ok(url.includes('client_id=zoom-client-123'));
  assert.ok(url.includes('redirect_uri=https%3A%2F%2Fbooking.pumasi.ai%2Foauth%2Fzoom%2Fcallback'));
  assert.ok(url.includes('state=test-state-abc'));
});

/** The Z-007 chain walks five deployments in one test; each needs a clean slate. */
async function beforeEachReset(): Promise<void> {
  for (const t of ['rate_events', 'idempotency_keys', 'booking_answers', 'bookings', 'jobs',
                   'availability_rules', 'set_rules', 'schedules', 'availability_sets',
                   'video_connections', 'calendar_connections', 'sessions', 'invites',
                   'contacts', 'owners']) {
    await db.query(`DELETE FROM ${t}`);
  }
  zoomCalls = [];
  globalThis.fetch = realFetch;
  deps = makeDeps();
}
