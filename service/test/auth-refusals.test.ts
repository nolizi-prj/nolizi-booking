/**
 * SPEC-0009 acceptance runner — a half-configured deployment is told what is
 * missing, at the button, on both builds. Frozen cases:
 * service/spec/0009/acceptance/cases.json.
 *
 * `cases.json` is the truth; this file is the executable form of it. Six cases
 * (R-001..R-005, R-007) exist to fail against the tree at 7c511a4 — for a
 * defect spec the proof is that the test fails *before* (lessons/L-006).
 * R-006 is green on both sides on purpose and names the mutation that reddens it.
 *
 * Both entry points are EXECUTED (S3a): `handle()` from app.ts, and the
 * Workers router's `default.fetch` loaded the way version.test.ts loads it.
 * Parity (S3b, R-005) is asserted string to string, not each build against
 * the table — so a sentence that exists on one build and not the other fails.
 */

import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { OAuthState } from '../src/oauth-state.ts';
import { CalendarHub } from '../src/calendars.ts';
import { migrate } from '../src/db.ts';
import { createPgliteDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';

// src/worker.ts is compiled by tsconfig.worker.json and excluded from the test
// program, so it is reached as a runtime specifier with the hooks that stand
// in for `cloudflare:workers` (test/support/worker-runtime.mjs).
register(new URL('../../test/support/worker-runtime.mjs', import.meta.url).href);
const workerModuleUrl = new URL('../src/worker.js', import.meta.url).href;

const KEY = Buffer.alloc(32, 11).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 13).toString('base64');
const NOW = '2026-06-01T08:00:00Z';
const BASE = 'https://booking.test';

interface Env { [k: string]: string | undefined }

// Distinctive tokens, so "the body contains none of the values" is a real
// assertion (cases.json note). $KEY is base64 of repeated 0x0b: 'CwsLCw...'.
const GID = 'gid-VALUE-7f3a', GSEC = 'gsec-VALUE-9b1c', MID = 'mid-VALUE-2c8e', MSEC = 'msec-VALUE-5d1f';
const NO_KEY: Env = { MS_OAUTH_CLIENT_ID: MID, MS_OAUTH_CLIENT_SECRET: MSEC };
const MS_ID_ONLY: Env = { TOKEN_KEY: KEY, MS_OAUTH_CLIENT_ID: MID };
const MS_ONLY: Env = { TOKEN_KEY: KEY, MS_OAUTH_CLIENT_ID: MID, MS_OAUTH_CLIENT_SECRET: MSEC };
const IDP_ONLY: Env = { TOKEN_KEY: KEY };
const GOOGLE_ID_ONLY: Env = { TOKEN_KEY: KEY, GOOGLE_OAUTH_CLIENT_ID: GID };
const GOOGLE_NO_KEY: Env = { GOOGLE_OAUTH_CLIENT_ID: GID, GOOGLE_OAUTH_CLIENT_SECRET: GSEC };
const GOOGLE_ID_NO_KEY: Env = { GOOGLE_OAUTH_CLIENT_ID: GID };
const GOOGLE_FULL: Env = { TOKEN_KEY: KEY, GOOGLE_OAUTH_CLIENT_ID: GID, GOOGLE_OAUTH_CLIENT_SECRET: GSEC };
const NOTHING: Env = { TOKEN_KEY: KEY };

const SHAPES: Record<string, Env> = { NO_KEY, MS_ID_ONLY, GOOGLE_ID_ONLY, GOOGLE_NO_KEY, GOOGLE_ID_NO_KEY, IDP_ONLY, NOTHING };
const valuesOf = (env: Env) => [...Object.values(env).filter((v): v is string => Boolean(v))];

let db: Database;
let deps: AppDeps;
let realFetch: typeof globalThis.fetch;
let worker: { fetch(request: Request, env: unknown): Promise<Response> };

/**
 * Node deps. GOOGLE_FULL is built WITH a hub under $KEY, because server.ts:113
 * builds one whenever all three are set — a hub-less GOOGLE_FULL is not a
 * deployment an operator can have. `hubKey` overrides the hub's seal key.
 */
function makeDeps(env: Env, hubKey?: string): AppDeps {
  const full = Boolean(env['GOOGLE_OAUTH_CLIENT_ID'] && env['GOOGLE_OAUTH_CLIENT_SECRET'] && env['TOKEN_KEY']);
  const key = hubKey ?? (full ? env['TOKEN_KEY'] : undefined);
  return {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: BASE, ...env } as NodeJS.ProcessEnv),
    mail: new RetryingMail(new RecordingMail()),
    now: () => NOW,
    ready: () => true,
    ...(key ? { calendars: new CalendarHub({}, key, () => NOW) } : {}),
  };
}

interface Answer { status: number; location: string | undefined; body: string; err: string }

const errText = (body: string) => body.match(/<p class="err">([^<]*)<\/p>/)?.[1] ?? '';

async function node(env: Env, method: string, path: string,
  opts: Partial<{ form: Record<string, string>; cookie: string; query: Record<string, string>; hubKey: string }> = {}): Promise<Answer> {
  deps = makeDeps(env, opts.hubKey);
  const r = await handle(deps, { method, path, ip: '9.9.9.9', form: opts.form, cookie: opts.cookie, query: opts.query });
  const body = String(r.body ?? '');
  return { status: r.status, location: r.headers['location'], body, err: errText(body) };
}

/** The Workers router, with the bindings stubbed the way version.test.ts stubs them. */
async function workers(env: Env, method: string, path: string, form?: Record<string, string>): Promise<Answer> {
  const stub = (result: unknown) => ({ fetch: async () => new Response(JSON.stringify({ result }), { status: 200 }) });
  const binding = (result: unknown) => ({ idFromName: () => 'id', get: () => stub(result) });
  const bindings = { DIRECTORY: binding(0), PUMASI: binding(null), BASE_URL: BASE, ...env };
  const init: RequestInit = { method, redirect: 'manual' };
  if (form) {
    init.body = new URLSearchParams(form).toString();
    init.headers = { 'content-type': 'application/x-www-form-urlencoded' };
  }
  const res = await worker.fetch(new Request(`${BASE}${path}`, init), bindings);
  const body = await res.text();
  return { status: res.status, location: res.headers.get('location') ?? undefined, body, err: errText(body) };
}

/** S4b + S1d: a refusal is a 404, sends nobody anywhere, and echoes no value. */
function assertRefusal(a: Answer, sentence: string, env: Env, label: string): void {
  assert.equal(a.status, 404, `${label}: expected 404, got ${a.status} ${a.location ?? ''} "${a.err}"`);
  assert.equal(a.err, sentence, `${label}: sentence`);
  assert.equal(a.location, undefined, `${label}: no Location header`);
  for (const v of valuesOf(env)) assert.ok(!a.body.includes(v), `${label}: the body must not echo a configured value`);
  assert.ok(!a.body.includes('state='), `${label}: no state anywhere in the body`);
}

const stateOf = (a: Answer) => new URL(String(a.location)).searchParams.get('state')!;

async function makeOwner(email: string): Promise<string> {
  await db.query(`INSERT INTO invites (code) VALUES ($1)`, [`inv-${email}`]);
  const r = await handle(deps, { method: 'POST', path: '/signup', ip: '9.9.9.9',
    form: { invite: `inv-${email}`, email, display_name: 'X', timezone: 'UTC' } });
  return (r.headers['set-cookie'] ?? '').split(';')[0]!;
}

/** Resolved through the creating owner's membership, not `ORDER BY created_at` (SPEC-0007 amendment 1). */
async function makeOrgWithSso(email = 'boss@corp.example'): Promise<{ orgId: string; values: string[] }> {
  const cookie = await makeOwner(email);
  await handle(deps, { method: 'POST', path: '/app/team', ip: '9.9.9.9', cookie, form: { name: 'Corp' } });
  const org = await db.query(
    `SELECT m.org_id FROM org_members m JOIN owners o ON o.owner_id = m.owner_id
      WHERE o.email = $1 AND m.role = 'admin'`, [email]);
  const orgId = String(org.rows[0]!['org_id']);
  const values = ['idp-cid-VALUE-41aa', 'idp-sec-VALUE-52bb'];
  const r = await handle(deps, { method: 'POST', path: `/app/team/${orgId}/sso`, ip: '9.9.9.9', cookie,
    form: { issuer: 'https://idp.corp.example', client_id: values[0]!, client_secret: values[1]!, email_domain: 'corp.example' } });
  assert.equal(r.status, 303, 'the org SSO configuration itself must succeed');
  return { orgId, values };
}

before(async () => {
  realFetch = globalThis.fetch;
  db = await createPgliteDriver();
  await migrate(db);
  worker = (await import(workerModuleUrl)).default as typeof worker;
});
after(() => { globalThis.fetch = realFetch; });

beforeEach(async () => {
  for (const t of ['rate_events', 'idempotency_keys', 'booking_answers', 'bookings', 'jobs',
                   'audit_events', 'org_sso', 'org_members', 'orgs',
                   'availability_rules', 'set_rules', 'schedules', 'availability_sets',
                   'video_connections', 'calendar_connections', 'sessions', 'invites',
                   'contacts', 'owners']) {
    await db.query(`DELETE FROM ${t}`);
  }
  globalThis.fetch = realFetch;
  deps = makeDeps(MS_ONLY);
});

// ── R-001 · Node: Microsoft and org SSO name TOKEN_KEY. RED before ─────────

test('R-001 · Node: a forgotten TOKEN_KEY is named at the Microsoft and org-SSO doors', async () => {
  const r1 = await node(NO_KEY, 'POST', '/auth/microsoft/start', { form: {} });
  assertRefusal(r1, 'Microsoft sign-in cannot start on this deployment: TOKEN_KEY is not configured.', NO_KEY, 'r1');

  deps = makeDeps(NO_KEY);
  const { orgId, values } = await makeOrgWithSso();
  const r2 = await node(NO_KEY, 'GET', `/login/sso/${orgId}`);
  assertRefusal(r2, 'SSO cannot start on this deployment: TOKEN_KEY is not configured.', NO_KEY, 'r2');
  for (const v of values) assert.ok(!r2.body.includes(v), 'r2: none of the org’s SSO values');

  const r3 = await node(NO_KEY, 'GET', '/login/sso/main');
  assertRefusal(r3, 'SSO cannot start on this deployment: TOKEN_KEY is not configured.', NO_KEY,
    'r3 — the deployment check stays above the org lookup (SPEC-0007 S3b)');
});

// ── R-002 · Node: Google names the secret, the key, or both. RED before ────

test('R-002 · Node: Google names the missing secret and/or key, secret first', async () => {
  const g1 = await node(GOOGLE_ID_ONLY, 'POST', '/auth/google/start', { form: {} });
  assertRefusal(g1, 'Google sign-in cannot start on this deployment: GOOGLE_OAUTH_CLIENT_SECRET is not configured.', GOOGLE_ID_ONLY, 'g1');
  const g2 = await node(GOOGLE_NO_KEY, 'POST', '/auth/google/start', { form: {} });
  assertRefusal(g2, 'Google sign-in cannot start on this deployment: TOKEN_KEY is not configured.', GOOGLE_NO_KEY, 'g2');
  const g3 = await node(GOOGLE_ID_NO_KEY, 'POST', '/auth/google/start', { form: {} });
  assertRefusal(g3, 'Google sign-in cannot start on this deployment: GOOGLE_OAUTH_CLIENT_SECRET and TOKEN_KEY are not configured.', GOOGLE_ID_NO_KEY, 'g3');
  for (const a of [g1, g2, g3]) assert.ok(!a.body.includes(KEY), 'no key value in any body');
});

// ── R-003 · Workers: refused at the button, not at Google. RED before ──────

test('R-003 · Workers: the router refuses at the button and names the variable', async () => {
  const form = { invite: '', timezone: 'UTC' };
  const w1 = await workers(GOOGLE_ID_ONLY, 'POST', '/auth/google/start', form);
  assertRefusal(w1, 'Google sign-in cannot start on this deployment: GOOGLE_OAUTH_CLIENT_SECRET is not configured.', GOOGLE_ID_ONLY, 'w1');
  assert.ok(!w1.body.includes('accounts.google.com'), 'w1: nobody is sent to Google');
  const w2 = await workers(NO_KEY, 'POST', '/auth/microsoft/start', form);
  assertRefusal(w2, 'Microsoft sign-in cannot start on this deployment: TOKEN_KEY is not configured.', NO_KEY, 'w2');
  const w3 = await workers(GOOGLE_ID_NO_KEY, 'POST', '/auth/google/start', form);
  assertRefusal(w3, 'Google sign-in cannot start on this deployment: GOOGLE_OAUTH_CLIENT_SECRET and TOKEN_KEY are not configured.', GOOGLE_ID_NO_KEY, 'w3');
});

// ── R-004 · Workers callback names TOKEN_KEY, in app.ts's sentence. RED before

test('R-004 · Workers: a callback with no TOKEN_KEY says so, in the Node path’s sentence', async () => {
  const c1 = await workers(GOOGLE_NO_KEY, 'GET', '/oauth/google/callback?code=c&state=anything');
  assert.equal(c1.status, 404);
  assert.equal(c1.err, 'This deployment cannot complete an OAuth connection: TOKEN_KEY is not configured.');
  const c2 = await node(GOOGLE_NO_KEY, 'GET', '/oauth/google/callback', { query: { code: 'c', state: 'anything' } });
  assert.equal(c2.status, 404);
  assert.equal(c2.err, c1.err, 'S2e — byte-identical to app.ts:1083');
});

// ── R-005 · parity, by execution. RED before ───────────────────────────────

test('R-005 · both builds answer every half-configured shape identically', async () => {
  const form = { invite: '', timezone: 'UTC' };
  let namedKey = 0, namedSecret = 0;
  for (const [name, env] of Object.entries(SHAPES)) {
    for (const door of ['google', 'microsoft']) {
      const path = `/auth/${door}/start`;
      const n = await node(env, 'POST', path, { form });
      const w = await workers(env, 'POST', path, form);
      assert.equal(w.status, n.status, `${name} ${path}: status — Node ${n.status} "${n.err}", Workers ${w.status} "${w.err}"`);
      if (n.status === 404) {
        assert.equal(w.err, n.err, `${name} ${path}: the sentence differs between builds`);
        if (n.err.includes('TOKEN_KEY')) namedKey++;
        if (n.err.includes('_CLIENT_SECRET')) namedSecret++;
      }
    }
  }
  assert.ok(namedKey > 0 && namedSecret > 0, 'parity must not be satisfied vacuously');
});

// ── R-006 · nothing else moves. Green on both sides on purpose ─────────────

test('R-006 · fully configured doors redirect, no-id doors say "not configured", calendar routes unchanged', async () => {
  // f1 · GOOGLE_FULL: Node (with the hub server.ts would build) and Workers.
  const form = { invite: '', timezone: 'UTC' };
  for (const a of [await node(GOOGLE_FULL, 'POST', '/auth/google/start', { form }),
                   await workers(GOOGLE_FULL, 'POST', '/auth/google/start', form)]) {
    assert.equal(a.status, 303, `f1: ${a.err}`);
    assert.equal(new URL(String(a.location)).host, 'accounts.google.com');
    const p = await new OAuthState(KEY).open(stateOf(a));
    assert.equal(p?.['purpose'], 'sso', 'f1: sealed under $KEY with purpose sso');
  }
  // f2 · the hub's own sealer still seals (SPEC-0007 S1b).
  const f2 = await node(GOOGLE_FULL, 'POST', '/auth/google/start', { form, hubKey: OTHER_KEY });
  assert.equal(f2.status, 303);
  assert.ok(await new OAuthState(OTHER_KEY).open(stateOf(f2)), 'f2: opens under the hub key');
  assert.equal(await new OAuthState(KEY).open(stateOf(f2)), undefined, 'f2: not under config.tokenKey');
  // f3 · MS_ONLY on both builds.
  for (const a of [await node(MS_ONLY, 'POST', '/auth/microsoft/start', { form }),
                   await workers(MS_ONLY, 'POST', '/auth/microsoft/start', form)]) {
    assert.equal(a.status, 303, `f3: ${a.err}`);
    const u = new URL(String(a.location));
    assert.equal(u.host, 'login.microsoftonline.com');
    const scope = u.searchParams.get('scope') ?? '';
    for (const s of ['openid', 'email', 'profile']) assert.ok(scope.includes(s), `f3: scope keeps ${s}`);
    assert.ok(!scope.includes('Calendars'), 'f3: no scope is enlarged');
  }
  // n1 · NOTHING: the unchanged sentence for a door with no client id (S1e).
  for (const [door, label] of [['google', 'Google'], ['microsoft', 'Microsoft']] as const) {
    for (const a of [await node(NOTHING, 'POST', `/auth/${door}/start`, { form }),
                     await workers(NOTHING, 'POST', `/auth/${door}/start`, form)]) {
      assertRefusal(a, `${label} sign-in is not configured.`, NOTHING, `n1 ${door}`);
    }
  }
  // b1 · a button is drawn on the client id alone (S4d).
  const bg = await node(GOOGLE_ID_ONLY, 'GET', '/login');
  assert.ok(bg.body.includes('action="/auth/google/start"'), 'b1: Google button on the id alone');
  const bm = await node(MS_ID_ONLY, 'GET', '/login');
  assert.ok(bm.body.includes('action="/auth/microsoft/start"'), 'b1: Microsoft button on the id alone');
  // c1, c2 · calendar routes, exactly as SPEC-0007 A-004 froze them.
  deps = makeDeps(MS_ONLY);
  const cookie = await makeOwner('cal@example.com');
  const c1 = await node(MS_ONLY, 'POST', '/app/calendar/google/connect', { cookie, form: {} });
  assert.equal(c1.status, 200, 'c1: calendar connect is not reachable without a calendar hub');
  assert.ok(c1.body.includes('Your schedules'));
  assert.equal(c1.location, undefined);
  assert.ok(!c1.body.includes('accounts.google.com'));
  const calState = await new OAuthState(KEY).seal({ owner_id: 'o1', level: 'freebusy', tag: '' });
  const c2 = await node(MS_ONLY, 'GET', '/oauth/google/callback', { query: { code: 'c', state: calState } });
  assert.equal(c2.status, 404);
  assert.equal(c2.err, 'Calendar integration is not configured.', 'c2: SPEC-0006 S2d untouched');
});

// ── R-007 · Microsoft id without secret, both builds. RED before ───────────

test('R-007 · a Microsoft id without its secret is refused at the button on both builds', async () => {
  const form = { invite: '', timezone: 'UTC' };
  for (const a of [await node(MS_ID_ONLY, 'POST', '/auth/microsoft/start', { form }),
                   await workers(MS_ID_ONLY, 'POST', '/auth/microsoft/start', form)]) {
    assertRefusal(a, 'Microsoft sign-in cannot start on this deployment: MS_OAUTH_CLIENT_SECRET is not configured.', MS_ID_ONLY, 'm1');
    assert.ok(!a.body.includes('login.microsoftonline.com'));
  }
});
