/**
 * SPEC-0006 acceptance runner — the OAuth state is the gate, not the calendar
 * hub. Frozen cases: service/spec/0006/acceptance/cases.json.
 *
 * `cases.json` is the truth; this file is the executable form of it. Two cases
 * (S-002, S-003) exist to fail against the tree at `efce7a4` — for a defect
 * spec the proof is that the test fails *before* (lessons/L-006).
 *
 * The whole point of this suite is the deployment the rest of the tests do not
 * build: `calendars: undefined`, which is what server.ts and worker.ts produce
 * when GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET is unset. Every
 * hub-less case below is a deployment an operator can actually have.
 */

import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OAuthState } from '../src/oauth-state.ts';
import { CalendarHub } from '../src/calendars.ts';
import { importSealKey, seal } from '../src/seal.ts';
import { migrate } from '../src/db.ts';
import { createPgliteDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';

const KEY = Buffer.alloc(32, 7).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64');
const NOW = '2026-06-01T08:00:00Z';
const PMI = 'https://us02web.zoom.us/j/1112223333';

let db: Database;
let deps: AppDeps;
let realFetch: typeof globalThis.fetch;
let outbound: string[] = [];

interface Env { [k: string]: string | undefined }

/**
 * The deployment under test. `hub` defaults to FALSE — a service with no
 * calendar integration configured, which is the population this spec is for.
 */
function makeDeps(env: Env = {}, hub = false): AppDeps {
  return {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: 'https://booking.test', TOKEN_KEY: KEY, ...env } as NodeJS.ProcessEnv),
    mail: new RetryingMail(new RecordingMail()),
    now: () => NOW,
    ready: () => true,
    ...(hub ? { calendars: new CalendarHub({}, String(env['TOKEN_KEY'] ?? KEY), () => NOW) } : {}),
  };
}

const call = (method: string, path: string,
  opts: Partial<{ form: Record<string, string>; cookie: string; query: Record<string, string> }> = {}) =>
  handle(deps, { method, path, ip: '7.7.7.7', form: opts.form, cookie: opts.cookie, query: opts.query });

const cookieOf = (r: { headers: Record<string, string> }) => (r.headers['set-cookie'] ?? '').split(';')[0]!;
/**
 * The sentence the operator actually reads. `errorPage` wraps it in the same
 * shell as every page, and that shell carries a `/* slots and calendar *\/`
 * CSS comment — asserting over the whole document would be asserting about the
 * stylesheet.
 */
const errText = (body: string) => body.match(/<p class="err">([^<]*)<\/p>/)?.[1] ?? '';
const stateOf = (r: { headers: Record<string, string> }) =>
  new URL(String(r.headers['location'])).searchParams.get('state')!;

/** Zoom's token endpoint and profile, stubbed at the transport. */
function stubZoom(): void {
  globalThis.fetch = (async (url: unknown) => {
    const u = String(url);
    outbound.push(u);
    if (u.includes('/oauth/token')) {
      return Response.json({ access_token: 'a1', refresh_token: 'r1', expires_in: 3600 });
    }
    if (u.includes('zoom.us') && u.includes('/users/me')) {
      return Response.json({
        email: 'zoomer@zoom.us', personal_meeting_url: PMI, first_name: 'Zoe', last_name: 'Zoom',
      });
    }
    return new Response('unexpected', { status: 404 });
  }) as typeof globalThis.fetch;
}

/** Records every outbound URL, and answers none of them. */
function stubNothing(): void {
  globalThis.fetch = (async (url: unknown) => {
    outbound.push(String(url));
    return new Response('unexpected', { status: 404 });
  }) as typeof globalThis.fetch;
}

/** A signed-up owner with one bookable zoom event type. */
async function ownerWithZoomPage() {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-s')`);
  const r = await call('POST', '/signup', {
    form: { invite: 'inv-s', email: 'oauth@example.com', display_name: 'Ozy', timezone: 'UTC' },
  });
  const cookie = cookieOf(r as never);
  const created = await call('POST', '/app/schedules', {
    cookie, form: { title: 'Intro', slug: 'intro', duration_minutes: '30' },
  });
  const scheduleId = String(created.headers['location']).split('/').pop()!;
  await db.query(
    `UPDATE schedules SET location_kind = 'zoom', location_value = NULL WHERE schedule_id = $1`,
    [scheduleId]);
  const ownerId = String((await db.query(
    `SELECT owner_id FROM schedules WHERE schedule_id = $1`, [scheduleId])).rows[0]!['owner_id']);
  return { cookie, scheduleId, ownerId };
}

/**
 * Sources, not build output: this file also runs from `.build/test/`, where
 * `../src` is the compiled tree. Walk up to the service root instead.
 */
function fromServiceRoot(rel: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'migrations')) && existsSync(join(dir, 'src'))) return join(dir, rel);
    dir = dirname(dir);
  }
  throw new Error('service root not found from ' + import.meta.url);
}

/** Seal a payload directly, the way a legitimate authorize step would. */
const sealState = (payload: Record<string, string>, key = KEY) => new OAuthState(key).seal(payload);

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
  outbound = [];
  globalThis.fetch = realFetch;
  deps = makeDeps();
});

// ── S-001 · the facility itself ────────────────────────────────────────────

test('S-001 · OAuthState seals and opens on TOKEN_KEY alone', async () => {
  const st = new OAuthState(KEY);
  const s = await st.seal({ purpose: 'zoom_connect', owner_id: 'owner-1', tag: '' });

  assert.ok(!s.includes('+') && !s.includes('/'), 'S1b — base64url-safe substitution');
  // Sealed, not encoded: the payload must not be readable by decoding alone.
  const decoded = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  assert.ok(!decoded.includes('owner-1'), 'S1a — the payload is sealed, not encoded');

  const before = Date.now();
  const p = (await st.open(s))!;
  assert.ok(p, 'it opens');
  assert.equal(p['purpose'], 'zoom_connect');
  assert.equal(p['owner_id'], 'owner-1');
  const exp = Number(p['exp']);
  assert.ok(exp > before, 'S1b — exp is in the future');
  assert.ok(exp <= before + 15 * 60_000 + 5_000, 'S1b — and at most fifteen minutes out');
});

test('S-001 · OAuthState touches no database and no network (S1d)', async () => {
  stubNothing();
  const st = new OAuthState(KEY);
  await st.open(await st.seal({ purpose: 'zoom_connect', owner_id: 'owner-1' }));
  assert.deepEqual(outbound, [], 'no request is made to seal or open a state');
  const src = readFileSync(fromServiceRoot('src/oauth-state.ts'), 'utf8');
  assert.ok(!/\bfetch\s*\(|SqlClient|sql\./.test(src),
    'S1d — the module imports no transport and no store');
});

// ── S-002 · the hub-less callback completes (FAILS BEFORE) ────────────────

test('S-002 · a Zoom connect completes on a deployment with no calendar hub', async () => {
  const { cookie, scheduleId, ownerId } = await ownerWithZoomPage();
  deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
  assert.equal(deps.calendars, undefined, 'the deployment under test has no calendar hub');
  stubZoom();

  const start = await call('GET', '/app/integrations/zoom/connect', { cookie });
  assert.equal(start.status, 303);
  assert.equal(new URL(String(start.headers['location'])).host, 'zoom.us');

  const back = await call('GET', '/oauth/zoom/callback', { query: { code: 'c1', state: stateOf(start) } });
  assert.equal(back.status, 303,
    'S2a — NOT 404; before the fix this answered "Calendar integration is not configured."');
  assert.equal(back.headers['location'], '/app/integrations');

  const rows = await db.query(`SELECT * FROM video_connections WHERE owner_id = $1`, [ownerId]);
  assert.equal(rows.rows.length, 1, 'the connection is stored');
  assert.ok(rows.rows[0]!['refresh_token'], 'with the credential that was the point of it');

  const sched = await db.query(`SELECT location_value FROM schedules WHERE schedule_id = $1`, [scheduleId]);
  assert.equal(sched.rows[0]!['location_value'], null, 'SPEC-0005 Z1a still holds here');
});

test('S-002 · with no TOKEN_KEY the callback names TOKEN_KEY, not calendars', async () => {
  deps = makeDeps({ TOKEN_KEY: undefined, ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
  const r = await call('GET', '/oauth/zoom/callback', { query: { code: 'c1', state: 'anything' } });
  assert.equal(r.status, 404);
  assert.ok(errText(r.body).includes('TOKEN_KEY'), 'S2b — it names what is missing');
  assert.ok(!/calendar/i.test(errText(r.body)), 'S2b — and does not blame calendars');
});

test('S-002 · an unopenable state is stale (400), not unconfigured (404)', async () => {
  deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
  const r = await call('GET', '/oauth/zoom/callback', { query: { code: 'c1', state: 'not-a-sealed-state' } });
  assert.equal(r.status, 400, 'S2c');
});

// ── S-003 · no unsigned state is ever built (FAILS BEFORE) ────────────────

test('S-003 · every Zoom connect entry point emits a sealed state', async () => {
  const { cookie, ownerId } = await ownerWithZoomPage();
  deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });

  const entries: [string, () => Promise<{ status: number; headers: Record<string, string>; body: string }>][] = [
    ['GET /oauth/zoom/authorize', () => call('GET', '/oauth/zoom/authorize', { cookie })],
    ['GET /app/integrations/zoom/connect', () => call('GET', '/app/integrations/zoom/connect', { cookie })],
    ['POST /app/integrations/zoom', () =>
      call('POST', '/app/integrations/zoom', { cookie, form: { zoom_client_id: 'zcid' } })],
  ];

  for (const [name, run] of entries) {
    const r = await run();
    assert.equal(r.status, 303, `${name} redirects`);
    assert.equal(new URL(String(r.headers['location'])).host, 'zoom.us', `${name} goes to Zoom`);
    const state = stateOf(r);

    // The exact shape the deleted fallback produced must not be what we emit.
    const decoded = Buffer.from(state.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    assert.ok(!decoded.includes('owner_id'), `${name} — S3a: no readable owner_id in the state`);
    assert.ok(!decoded.includes(ownerId), `${name} — S3a: no readable owner id at all`);

    const p = await new OAuthState(KEY).open(state);
    assert.ok(p, `${name} — the state opens under TOKEN_KEY`);
    assert.equal(p!['owner_id'], ownerId, `${name} — and names the signed-in owner`);
    assert.equal(p!['purpose'], 'zoom_connect', `${name} — with the right purpose`);
  }
});

test('S-003 · the unsigned fallback is gone from the source', () => {
  const src = readFileSync(fromServiceRoot('src/app.ts'), 'utf8');
  // S3a as amended: the construction, not the word. `newToken` uses base64url
  // legitimately and predates this spec.
  assert.ok(!src.includes('Buffer.from(JSON.stringify('),
    'S3a — no hand-built state construction survives in app.ts');
});

test('S-003 · with no TOKEN_KEY the connect refuses at the start', async () => {
  const { cookie } = await ownerWithZoomPage();
  deps = makeDeps({ TOKEN_KEY: undefined, ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' });
  stubNothing();
  const r = await call('GET', '/oauth/zoom/authorize', { cookie });
  assert.ok(r.status >= 500, `S3b — refused, not redirected (got ${r.status})`);
  assert.ok(r.body.includes('TOKEN_KEY'), 'S3b — with the reason');
  assert.ok(!String(r.headers['location'] ?? '').includes('zoom.us'), 'S3b — and no trip to Zoom');
});

test('S-003 · with no ZOOM_CLIENT_ID the connect still steers to the card', async () => {
  const { cookie } = await ownerWithZoomPage();
  deps = makeDeps({ ZOOM_CLIENT_ID: undefined });
  const r = await call('GET', '/oauth/zoom/authorize', { cookie });
  assert.equal(r.status, 303, 'S3c — unchanged');
  assert.equal(r.headers['location'], '/app/integrations?zoom_needed=1');
});

// ── S-004 · the calendar 404 survives, and nothing else opens up ──────────

test('S-004 · a calendar callback without a hub answers exactly what it did', async () => {
  deps = makeDeps();
  const state = await sealState({ owner_id: 'owner-1', level: 'freebusy', tag: '' });
  const r = await call('GET', '/oauth/google/callback', { query: { code: 'c1', state } });
  assert.equal(r.status, 404, 'S2d');
  assert.ok(r.body.includes('Calendar integration is not configured.'),
    'S2d — byte-identical to the message it gave before the gate moved');
});

test('S-004 · no other flow gains reachability', async () => {
  stubNothing();

  deps = makeDeps();
  const sso = await call('GET', '/oauth/google/callback',
    { query: { code: 'c1', state: await sealState({ purpose: 'sso' }) } });
  assert.equal(sso.status, 404, 'S2e — no Google credentials');
  assert.ok(sso.body.includes('Google sign-in is not configured.'));

  const ms = await call('GET', '/oauth/microsoft/callback',
    { query: { code: 'c1', state: await sealState({ purpose: 'sso_ms' }) } });
  assert.equal(ms.status, 404, 'S2e — no Microsoft credentials');
  assert.ok(ms.body.includes('Microsoft sign-in is not configured.'));

  const oidc = await call('GET', '/oauth/oidc/callback',
    { query: { code: 'c1', state: await sealState({ purpose: 'oidc', org: 'no-such-org' }) } });
  assert.equal(oidc.status, 404, 'S2e — no such org');
  assert.ok(oidc.body.includes('This organization has no SSO configured.'));

  assert.deepEqual(outbound, [],
    'S2e — an unconfigured provider is never contacted; the guard runs before the exchange');

  deps = makeDeps({ ZOOM_CLIENT_ID: undefined });
  const zoom = await call('GET', '/oauth/zoom/callback', {
    query: { code: 'c1', state: await sealState({ purpose: 'zoom_connect', owner_id: 'owner-1', tag: '' }) },
  });
  assert.equal(zoom.status, 400, 'S2e — the zoom branch keeps its own credential guard');
  assert.ok(zoom.body.includes('Zoom credentials are not configured.'));
});

// ── S-005 · one format, and every forgery opens as undefined ──────────────

test('S-005 · hub and OAuthState round-trip each other', async () => {
  const hub = new CalendarHub({}, KEY, () => NOW);
  const st = new OAuthState(KEY);

  const a = await hub.sealState({ purpose: 'zoom_connect', owner_id: 'owner-1' });
  assert.equal((await st.open(a))!['owner_id'], 'owner-1', 'S4b — hub seals, OAuthState opens');

  const b = await st.seal({ purpose: 'zoom_connect', owner_id: 'owner-2' });
  assert.equal((await hub.openState(b))!['owner_id'], 'owner-2', 'S4b — and the other way');
});

test('S-005 · every forged, foreign, tampered or stale state opens as undefined', async () => {
  const st = new OAuthState(KEY);
  const good = await st.seal({ purpose: 'zoom_connect', owner_id: 'owner-1' });

  // D-c · the exact string the deleted fallback produced. This is the one that
  // must never become acceptable now that the 404 no longer hides it.
  const forged = Buffer.from(JSON.stringify(
    { purpose: 'zoom_connect', owner_id: 'attacker', tag: '' })).toString('base64url');
  assert.equal(await st.open(forged), undefined, 'S4c — an unsigned state is not a state');

  assert.equal(await new OAuthState(OTHER_KEY).open(good), undefined,
    'S4c — another deployment\'s key does not open ours');

  const tampered = good.slice(0, -2) + (good.endsWith('AA') ? 'BB' : 'AA');
  assert.equal(await st.open(tampered), undefined, 'S4c — a tampered seal opens as nothing');

  const key = await importSealKey(KEY);
  const expired = (await seal(key, JSON.stringify(
    { purpose: 'zoom_connect', owner_id: 'owner-1', exp: Date.now() - 60_000 })))
    .replace(/\+/g, '-').replace(/\//g, '_');
  assert.equal(await st.open(expired), undefined, 'S4c — an expired state is not a state');

  const noExp = (await seal(key, JSON.stringify({ purpose: 'zoom_connect', owner_id: 'owner-1' })))
    .replace(/\+/g, '-').replace(/\//g, '_');
  assert.equal(await st.open(noExp), undefined, 'S4c — an unexpiring state is not a state');

  const notJson = (await seal(key, 'plain text, validly sealed'))
    .replace(/\+/g, '-').replace(/\//g, '_');
  assert.equal(await st.open(notJson), undefined, 'S4c — a malformed payload is not a state');
});

// ── S-006 · a deployment WITH a hub is unchanged ──────────────────────────

test('S-006 · with a calendar hub the Zoom connect behaves exactly as before', async () => {
  const { cookie, ownerId } = await ownerWithZoomPage();
  deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' }, true);
  assert.ok(deps.calendars, 'this deployment has a hub');
  stubZoom();

  const start = await call('GET', '/oauth/zoom/authorize', { cookie });
  assert.equal(start.status, 303);
  const back = await call('GET', '/oauth/zoom/callback', { query: { code: 'c1', state: stateOf(start) } });
  assert.equal(back.status, 303, 'S4a');
  assert.equal(back.headers['location'], '/app/integrations');

  const rows = await db.query(`SELECT * FROM video_connections WHERE owner_id = $1`, [ownerId]);
  assert.equal(rows.rows.length, 1, 'S4a — the same row SPEC-0005 Z-001 asserts');
  assert.equal(rows.rows[0]!['account_email'], 'zoomer@zoom.us');
  assert.equal(rows.rows[0]!['fallback_url'], PMI);
});

test('S-006 · a state sealed by a hub still opens on the callback path', async () => {
  const { cookie } = await ownerWithZoomPage();
  deps = makeDeps({ ZOOM_CLIENT_ID: 'zcid', ZOOM_CLIENT_SECRET: 'zsec' }, true);
  stubZoom();
  const ownerId = String((await db.query(
    `SELECT owner_id FROM owners WHERE email = 'oauth@example.com'`)).rows[0]!['owner_id']);
  const legacy = await deps.calendars!.sealState({
    purpose: 'zoom_connect', owner_id: ownerId, tag: '',
  });
  // S1b · a state sealed by the code as it was written before this change is
  // still a valid state after it. A rollout is not a broken deployment.
  const back = await call('GET', '/oauth/zoom/callback', { query: { code: 'c1', state: legacy } });
  assert.equal(back.status, 303);
  void cookie;
});
