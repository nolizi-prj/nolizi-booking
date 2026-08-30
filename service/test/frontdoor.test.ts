/**
 * P4 — the front door: Google sign-in, settings, the public-signup flag.
 *
 * SSO is exercised through the real callback route with Google's token
 * endpoint stubbed: the claims arrive exactly as the code would see them.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';
import { CalendarHub } from '../src/calendars.ts';

const PORT = 55442;
const KEY = Buffer.alloc(32, 5).toString('base64');
const NOW = '2026-06-01T08:00:00Z';
let pg: EmbeddedPostgres;
let db: Database;
let deps: AppDeps;
let hub: CalendarHub;

before(async () => {
  pg = new EmbeddedPostgres({
    databaseDir: '/tmp/pumasi-pg-frontdoor', user: 'pumasi', password: 'pumasi',
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
    set_overrides, contacts, contact_exclusions, single_use_links, calendar_connections,
    connection_calendars RESTART IDENTITY CASCADE`);
  await db.query(`DELETE FROM rate_events`);
  hub = new CalendarHub({}, KEY, () => NOW);
  deps = {
    sql: db, tx: db,
    config: loadConfig({
      BASE_URL: 'https://booking.test',
      GOOGLE_OAUTH_CLIENT_ID: 'cid', GOOGLE_OAUTH_CLIENT_SECRET: 'csec',
      MS_OAUTH_CLIENT_ID: 'ms-cid', MS_OAUTH_CLIENT_SECRET: 'ms-csec',
      TOKEN_KEY: KEY,
    } as NodeJS.ProcessEnv),
    mail: new RetryingMail(new RecordingMail()),
    now: () => NOW,
    ready: () => true,
    calendars: hub,
  };
});

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string; query: Record<string,string>; ip: string }> = {}) =>
  handle(deps, { method, path, ip: opts.ip ?? '5.5.5.5', form: opts.form, cookie: opts.cookie, query: opts.query });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

/** Google's token endpoint, stubbed to return an id_token for `email`. */
function stubGoogle(email: string, verified = true): () => void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: unknown) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      const payload = Buffer.from(JSON.stringify({ email, email_verified: verified }))
        .toString('base64url');
      return new Response(JSON.stringify({ id_token: `h.${payload}.s` }), { status: 200 });
    }
    return realFetch(url as never, init as never);
  }) as typeof fetch;
  return () => { globalThis.fetch = realFetch; };
}

/** Microsoft token endpoint stub. */
function stubMicrosoft(email: string): () => void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: unknown) => {
    if (String(url).includes('login.microsoftonline.com') && String(url).includes('token')) {
      const payload = Buffer.from(JSON.stringify({ email, preferred_username: email }))
        .toString('base64url');
      return new Response(JSON.stringify({ id_token: `h.${payload}.s` }), { status: 200 });
    }
    return realFetch(url as never, init as never);
  }) as typeof fetch;
  return () => { globalThis.fetch = realFetch; };
}

async function makeOwner(email: string): Promise<string> {
  await db.query(`INSERT INTO invites (code) VALUES ($1)`, [`inv-${email}`]);
  const r = await call('POST', '/signup', {
    form: { invite: `inv-${email}`, email, display_name: 'X', timezone: 'UTC' },
  });
  return cookieOf(r as never);
}

test('login page offers Google and Microsoft when configured', async () => {
  const page = await call('GET', '/login');
  assert.ok(page.body.includes('/auth/google/start'));
  assert.ok(page.body.includes('/auth/microsoft/start'));
});

test('SSO signs an existing owner in (Google & Microsoft)', async () => {
  // Google SSO
  await makeOwner('sso-google@example.com');
  const startG = await call('POST', '/auth/google/start', { form: {} });
  assert.equal(startG.status, 303);
  const stateG = new URL(startG.headers['location']!).searchParams.get('state')!;

  const restoreG = stubGoogle('sso-google@example.com');
  try {
    const cb = await call('GET', '/oauth/google/callback', { query: { code: 'c', state: stateG } });
    assert.equal(cb.status, 303);
    assert.equal(cb.headers['location'], '/app');
  } finally { restoreG(); }

  // Microsoft SSO (Issue #5)
  await makeOwner('sso-ms@example.com');
  const startMs = await call('POST', '/auth/microsoft/start', { form: {} });
  assert.equal(startMs.status, 303);
  const stateMs = new URL(startMs.headers['location']!).searchParams.get('state')!;

  const restoreMs = stubMicrosoft('sso-ms@example.com');
  try {
    const cb = await call('GET', '/oauth/microsoft/callback', { query: { code: 'c', state: stateMs } });
    assert.equal(cb.status, 303);
    assert.equal(cb.headers['location'], '/app');
  } finally { restoreMs(); }
});

test('SSO with a valid invite creates the account and consumes the invite (Microsoft)', async () => {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-ms-new')`);
  const start = await call('POST', '/auth/microsoft/start', {
    form: { invite: 'inv-ms-new', timezone: 'Asia/Seoul' },
  });
  const state = new URL(start.headers['location']!).searchParams.get('state')!;

  const restore = stubMicrosoft('msnew@example.com');
  try {
    const cb = await call('GET', '/oauth/microsoft/callback', { query: { code: 'c', state } });
    assert.equal(cb.status, 303);
  } finally { restore(); }

  const o = await db.query(`SELECT timezone, link_slug FROM owners WHERE email = 'msnew@example.com'`);
  assert.equal(String(o.rows[0]!['timezone']), 'Asia/Seoul');
  assert.equal(String(o.rows[0]!['link_slug']), 'msnew');
  const inv = await db.query(`SELECT consumed_at FROM invites WHERE code = 'inv-ms-new'`);
  assert.ok(inv.rows[0]!['consumed_at'] !== null);
});

test('SSO with a valid invite creates the account and consumes the invite (Google)', async () => {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-sso-new')`);
  const start = await call('POST', '/auth/google/start', {
    form: { invite: 'inv-sso-new', timezone: 'Europe/Berlin' },
  });
  const state = new URL(start.headers['location']!).searchParams.get('state')!;

  const restore = stubGoogle('new@example.com');
  try {
    const cb = await call('GET', '/oauth/google/callback', { query: { code: 'c', state } });
    assert.equal(cb.status, 303);
  } finally { restore(); }

  const o = await db.query(`SELECT timezone, link_slug FROM owners WHERE email = 'new@example.com'`);
  assert.equal(String(o.rows[0]!['timezone']), 'Europe/Berlin');
  assert.equal(String(o.rows[0]!['link_slug']), 'new');
  const inv = await db.query(`SELECT consumed_at FROM invites WHERE code = 'inv-sso-new'`);
  assert.ok(inv.rows[0]!['consumed_at'] !== null);
});

test('SSO for an unknown address without invite is refused while signup is closed', async () => {
  const start = await call('POST', '/auth/google/start', { form: {} });
  const state = new URL(start.headers['location']!).searchParams.get('state')!;
  const restore = stubGoogle('stranger@example.com');
  try {
    const cb = await call('GET', '/oauth/google/callback', { query: { code: 'c', state } });
    assert.equal(cb.status, 403);
  } finally { restore(); }
  const c = await db.query(`SELECT count(*)::int AS c FROM owners`);
  assert.equal(Number(c.rows[0]!['c']), 0);
});

test('an unverified Google email is refused', async () => {
  await makeOwner('v@example.com');
  const start = await call('POST', '/auth/google/start', { form: {} });
  const state = new URL(start.headers['location']!).searchParams.get('state')!;
  const restore = stubGoogle('v@example.com', false);
  try {
    const cb = await call('GET', '/oauth/google/callback', { query: { code: 'c', state } });
    assert.equal(cb.status, 403);
  } finally { restore(); }
});

test('I7 public signup creates the account but issues no session until the address is proven', async () => {
  const recorder = new RecordingMail();
  deps.config = { ...deps.config, publicSignup: true };
  deps.mail = new RetryingMail(recorder);
  const r = await call('POST', '/signup', {
    form: { email: 'open@example.com', display_name: 'Open', timezone: 'UTC' },
  });

  assert.equal(r.status, 200, 'no redirect into the app');
  assert.ok(
    !JSON.stringify(r.headers ?? {}).toLowerCase().includes('set-cookie'),
    'no session cookie is issued to whoever merely typed the address',
  );
  const c = await db.query(`SELECT count(*)::int AS c FROM owners`);
  assert.equal(Number(c.rows[0]!['c']), 1, 'the account is created');

  const signin = recorder.sent.filter((m) => m.kind === 'signin');
  assert.equal(signin.length, 1, 'a single-use sign-in link is mailed');
  assert.equal(signin[0]!.to, 'open@example.com', 'to the claimed address, and nowhere else');
});

test('I8 public signup answers identically for a taken address, so it cannot enumerate accounts', async () => {
  const recorder = new RecordingMail();
  deps.config = { ...deps.config, publicSignup: true };
  deps.mail = new RetryingMail(recorder);
  const form = { email: 'taken@example.com', display_name: 'T', timezone: 'UTC' };

  const first = await call('POST', '/signup', { form });
  const second = await call('POST', '/signup', { form });

  assert.equal(first.status, second.status, 'same status for new and existing');
  assert.equal(first.body, second.body, 'same body — no oracle');
  const c = await db.query(`SELECT count(*)::int AS c FROM owners WHERE email = 'taken@example.com'`);
  assert.equal(Number(c.rows[0]!['c']), 1, 'the second attempt creates nothing');
  assert.equal(
    recorder.sent.filter((m) => m.kind === 'signin').length, 1,
    'and does not mail the existing account holder on demand',
  );
});

test('loadConfig leaves public signup off unless the operator turns it on', async () => {
  assert.equal(loadConfig({} as NodeJS.ProcessEnv).publicSignup, false);
  assert.equal(loadConfig({ PUBLIC_SIGNUP: 'true' } as NodeJS.ProcessEnv).publicSignup, true);
});

test('settings update profile, brand, welcome; the landing page shows them', async () => {
  const cookie = await makeOwner('pat@example.com');
  const save = await call('POST', '/app/settings', {
    cookie, form: {
      display_name: 'Pat Q', timezone: 'UTC', welcome_message: 'Grab a slot!',
      brand_color: '#00aa55', link_slug: 'pat',
    },
  });
  assert.equal(save.status, 303);
  const landing = await call('GET', '/pat');
  assert.ok(landing.body.includes('Pat Q'));
  assert.ok(landing.body.includes('Grab a slot!'));
  assert.ok(landing.body.includes('#00aa55'));
});

test('link rename refuses reserved and taken names', async () => {
  const cookie = await makeOwner('a2@example.com');
  await makeOwner('b2@example.com');
  const reserved = await call('POST', '/app/settings', {
    cookie, form: { display_name: 'A', timezone: 'UTC', welcome_message: '',
      brand_color: '', link_slug: 'app' },
  });
  assert.equal(reserved.status, 400);
  const taken = await call('POST', '/app/settings', {
    cookie, form: { display_name: 'A', timezone: 'UTC', welcome_message: '',
      brand_color: '', link_slug: 'b2' },
  });
  assert.equal(taken.status, 400);
});

test('the dashboard shows the getting-started checklist until complete', async () => {
  const cookie = await makeOwner('fresh@example.com');
  const dash = await call('GET', '/app', { cookie });
  assert.ok(dash.body.includes('Getting started'));
  await call('POST', '/app/schedules', {
    cookie, form: { title: 'Intro', slug: 'fintro', duration_minutes: '30' },
  });
  const sched = await db.query(`SELECT availability_set_id FROM schedules WHERE slug = 'fintro'`);
  await call('POST', `/app/availability/${String(sched.rows[0]!['availability_set_id'])}/hours`, {
    cookie, form: { MO_start: '09:00', MO_end: '17:00' },
  });
  // Calendar still unconnected — checklist remains, with two items done.
  const dash2 = await call('GET', '/app', { cookie });
  assert.ok(dash2.body.includes('Getting started'));
  assert.ok(dash2.body.includes('✓ Set your weekly hours'));
});

test('Issue #3 · favicon is served with svg content-type and linked in page shell', async () => {
  const ico = await call('GET', '/favicon.ico');
  assert.equal(ico.status, 200);
  assert.equal(ico.headers['content-type'], 'image/svg+xml');
  assert.ok(ico.body.includes('<svg'));

  const svg = await call('GET', '/favicon.svg');
  assert.equal(svg.status, 200);
  assert.equal(svg.headers['content-type'], 'image/svg+xml');

  const home = await call('GET', '/');
  assert.ok(home.body.includes('rel="icon"'));
  assert.ok(home.body.includes('/favicon.ico'));
});

test('Issue #6 · home page renders hero, feature cards, how it works, and CTA', async () => {
  // Test with publicSignup = false (invite-only)
  deps.config = { ...deps.config, publicSignup: false };
  const closedHome = await call('GET', '/');
  assert.equal(closedHome.status, 200);
  assert.ok(closedHome.body.includes('Pumasi Booking'));
  assert.ok(closedHome.body.includes('Live Calendar Truth'));
  assert.ok(closedHome.body.toLowerCase().includes('zero double-booking'));
  assert.ok(closedHome.body.includes('Pure Engine Separability') || closedHome.body.includes('Pure Engine'));
  assert.ok(closedHome.body.includes('How it works'));
  assert.ok(closedHome.body.includes('/login'));

  // Test with publicSignup = true
  deps.config = { ...deps.config, publicSignup: true };
  const openHome = await call('GET', '/');
  assert.equal(openHome.status, 200);
  assert.ok(openHome.body.includes('Create your booking page'));
  assert.ok(openHome.body.includes('/signup'));
  assert.ok(openHome.body.includes('/privacy'));
  assert.ok(openHome.body.includes('/terms'));
});

test('Issue #4 · video chat options (Meet, Teams, Zoom) in editor and location text', async () => {
  const cookie = await makeOwner('video@example.com');
  const create = await call('POST', '/app/schedules', {
    cookie, form: { title: 'Teams Sync', slug: 'teams-sync', duration_minutes: '30' },
  });
  const schedRes = await db.query(`SELECT schedule_id FROM schedules WHERE slug = 'teams-sync'`);
  const scheduleId = String(schedRes.rows[0]!['schedule_id']);

  // Edit event with location_kind = teams
  await call('POST', `/app/event/${scheduleId}`, {
    cookie,
    form: {
      title: 'Teams Sync',
      duration_minutes: '30',
      location_kind: 'teams',
    },
  });

  const editor = await call('GET', `/app/event/${scheduleId}`, { cookie });
  assert.ok(editor.body.includes('Microsoft Teams (auto-generated)'));
  assert.ok(editor.body.includes('Zoom (meeting / link)'));
  assert.ok(editor.body.includes('Google Meet (auto-generated)'));

  // Edit event with location_kind = zoom
  await call('POST', `/app/event/${scheduleId}`, {
    cookie,
    form: {
      title: 'Zoom Catchup',
      duration_minutes: '30',
      location_kind: 'zoom',
      location_value: 'https://zoom.us/j/123456789',
    },
  });

  const editor2 = await call('GET', `/app/event/${scheduleId}`, { cookie });
  assert.ok(editor2.body.includes('https://zoom.us/j/123456789'));
});

