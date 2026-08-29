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
      GOOGLE_OAUTH_CLIENT_ID: 'cid', GOOGLE_OAUTH_CLIENT_SECRET: 'csec', TOKEN_KEY: KEY,
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

async function makeOwner(email: string): Promise<string> {
  await db.query(`INSERT INTO invites (code) VALUES ($1)`, [`inv-${email}`]);
  const r = await call('POST', '/signup', {
    form: { invite: `inv-${email}`, email, display_name: 'X', timezone: 'UTC' },
  });
  return cookieOf(r as never);
}

test('login page offers Google when configured', async () => {
  const page = await call('GET', '/login');
  assert.ok(page.body.includes('/auth/google/start'));
});

test('SSO signs an existing owner in', async () => {
  await makeOwner('sso@example.com');
  const start = await call('POST', '/auth/google/start', { form: {} });
  assert.equal(start.status, 303);
  const state = new URL(start.headers['location']!).searchParams.get('state')!;

  const restore = stubGoogle('sso@example.com');
  try {
    const cb = await call('GET', '/oauth/google/callback', { query: { code: 'c', state } });
    assert.equal(cb.status, 303);
    assert.equal(cb.headers['location'], '/app');
    const dash = await call('GET', '/app', { cookie: cookieOf(cb as never) });
    assert.equal(dash.status, 200);
  } finally { restore(); }
});

test('SSO with a valid invite creates the account and consumes the invite', async () => {
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

test('with the public-signup flag open, no invite is needed (code path only — D-105 keeps it closed in config)', async () => {
  deps.config = { ...deps.config, publicSignup: true };
  const r = await call('POST', '/signup', {
    form: { email: 'open@example.com', display_name: 'Open', timezone: 'UTC' },
  });
  assert.equal(r.status, 303);
  const c = await db.query(`SELECT count(*)::int AS c FROM owners`);
  assert.equal(Number(c.rows[0]!['c']), 1);
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
