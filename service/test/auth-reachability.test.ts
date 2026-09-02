/**
 * SPEC-0007 acceptance runner — two sign-in doors gate on the state seal, not
 * on the calendar hub. Frozen cases: service/spec/0007/acceptance/cases.json.
 *
 * `cases.json` is the truth; this file is the executable form of it. Two cases
 * (A-001, A-002) exist to fail against the tree at `0036c74` — for a defect
 * spec the proof is that the test fails *before* (lessons/L-006).
 *
 * The other four are green on both sides on purpose: they are the claim that
 * nothing else moved. A claim that cannot fail is decoration, so each of them
 * names in `cases.json` the deliberate mutation that turns it red, and the
 * commit records those mutations being run.
 *
 * The deployment under test is the one most of this suite does not build:
 * `calendars: undefined`, which is what `server.ts:114` and `worker.ts:244`
 * produce when GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET is unset.
 * Every hub-less deployment below is one an operator can actually have.
 */

import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { OAuthState } from '../src/oauth-state.ts';
import { CalendarHub } from '../src/calendars.ts';
import { migrate } from '../src/db.ts';
import { createPgliteDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';

const KEY = Buffer.alloc(32, 11).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 13).toString('base64');
const NOW = '2026-06-01T08:00:00Z';

let db: Database;
let deps: AppDeps;
let realFetch: typeof globalThis.fetch;

interface Env { [k: string]: string | undefined }

/** The five deployment shapes named in cases.json. */
const MS_ONLY: Env = { TOKEN_KEY: KEY, MS_OAUTH_CLIENT_ID: 'ms-cid', MS_OAUTH_CLIENT_SECRET: 'ms-csec' };
const IDP_ONLY: Env = { TOKEN_KEY: KEY };
const NO_KEY: Env = { MS_OAUTH_CLIENT_ID: 'ms-cid', MS_OAUTH_CLIENT_SECRET: 'ms-csec' };
const GOOGLE_ID_ONLY: Env = { TOKEN_KEY: KEY, GOOGLE_OAUTH_CLIENT_ID: 'cid' };

/**
 * `hubKey` present means a CalendarHub sealing under THAT key — deliberately
 * not `config.tokenKey`, because a hub may hold a key the environment variable
 * never carried and a state must open under the key that sealed it (S1b).
 */
function makeDeps(env: Env = {}, hubKey?: string): AppDeps {
  return {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: 'https://booking.test', ...env } as NodeJS.ProcessEnv),
    mail: new RetryingMail(new RecordingMail()),
    now: () => NOW,
    ready: () => true,
    ...(hubKey ? { calendars: new CalendarHub({}, hubKey, () => NOW) } : {}),
  };
}

const call = (method: string, path: string,
  opts: Partial<{ form: Record<string, string>; cookie: string; query: Record<string, string> }> = {}) =>
  handle(deps, { method, path, ip: '9.9.9.9', form: opts.form, cookie: opts.cookie, query: opts.query });

const cookieOf = (r: { headers: Record<string, string> }) => (r.headers['set-cookie'] ?? '').split(';')[0]!;

/**
 * The sentence the operator actually reads. `errorPage` wraps it in the same
 * shell as every page, and that shell carries a `/* slots and calendar *\/`
 * CSS comment — asserting over the whole document would be asserting about the
 * stylesheet (spec/0006 S2b).
 */
const errText = (body: string) => body.match(/<p class="err">([^<]*)<\/p>/)?.[1] ?? '';
const stateOf = (r: { headers: Record<string, string> }) =>
  new URL(String(r.headers['location'])).searchParams.get('state')!;

/** Sealed, not encoded: the payload must not be readable by decoding alone. */
function assertOpaque(state: string, secret: string): void {
  const decoded = Buffer.from(state.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  assert.ok(!decoded.includes(secret), 'S4c — the state is sealed, not encoded');
  assert.ok(!state.includes('+') && !state.includes('/'), 'base64url-safe');
}

function stubMicrosoft(email: string): () => void {
  const saved = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: unknown) => {
    const u = String(url);
    if (u.includes('login.microsoftonline.com') && u.includes('token')) {
      const payload = Buffer.from(JSON.stringify({ email, preferred_username: email }))
        .toString('base64url');
      return new Response(JSON.stringify({ id_token: `h.${payload}.s` }), { status: 200 });
    }
    return saved(url as never, init as never);
  }) as typeof fetch;
  return () => { globalThis.fetch = saved; };
}

/** Discovery + token endpoint for the org's own IdP. */
function stubIdp(email?: string): () => void {
  const saved = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: unknown) => {
    const u = String(url);
    if (u === 'https://idp.corp.example/.well-known/openid-configuration') {
      return new Response(JSON.stringify({
        authorization_endpoint: 'https://idp.corp.example/authorize',
        token_endpoint: 'https://idp.corp.example/token',
      }), { status: 200 });
    }
    if (u === 'https://idp.corp.example/token' && email) {
      const payload = Buffer.from(JSON.stringify({ email })).toString('base64url');
      return new Response(JSON.stringify({ id_token: `h.${payload}.s` }), { status: 200 });
    }
    return saved(url as never, init as never);
  }) as typeof fetch;
  return () => { globalThis.fetch = saved; };
}

async function makeOwner(email: string): Promise<string> {
  await db.query(`INSERT INTO invites (code) VALUES ($1)`, [`inv-${email}`]);
  const r = await call('POST', '/signup', {
    form: { invite: `inv-${email}`, email, display_name: 'X', timezone: 'UTC' },
  });
  return cookieOf(r as never);
}

/**
 * The org is resolved through the membership of the owner who just created it,
 * not by `ORDER BY created_at` — `now()` is frozen in these deps, so two orgs
 * made in one test share a timestamp and the ordering is not a tiebreak. That
 * is the shape L-006 warns about: a lookup that happens to be right until a
 * second row exists.
 */
async function makeOrg(email = 'boss@corp.example'): Promise<{ cookie: string; orgId: string }> {
  const cookie = await makeOwner(email);
  await call('POST', '/app/team', { cookie, form: { name: 'Corp' } });
  const org = await db.query(
    `SELECT m.org_id FROM org_members m JOIN owners o ON o.owner_id = m.owner_id
      WHERE o.email = $1 AND m.role = 'admin'`, [email]);
  assert.ok(org.rows[0], `the org for ${email} must exist`);
  return { cookie, orgId: String(org.rows[0]!['org_id']) };
}

async function configureSso(cookie: string, orgId: string): Promise<void> {
  const r = await call('POST', `/app/team/${orgId}/sso`, {
    cookie, form: {
      issuer: 'https://idp.corp.example', client_id: 'cid', client_secret: 'sec',
      email_domain: 'corp.example',
    },
  });
  assert.equal(r.status, 303, 'the org SSO configuration itself must succeed');
}

before(async () => {
  realFetch = globalThis.fetch;
  db = await createPgliteDriver();
  await migrate(db);
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

// ── A-001 · Microsoft sign-in, no Google Calendar. RED before the fix ──────

test('A-001 · Microsoft sign-in completes on a deployment with no Google Calendar', async () => {
  deps = makeDeps(MS_ONLY);

  const start = await call('POST', '/auth/microsoft/start', { form: {} });
  assert.equal(start.status, 303,
    `S2a — expected a redirect to Microsoft, got ${start.status} "${errText(start.body)}"`);

  const loc = new URL(String(start.headers['location']));
  assert.equal(loc.host, 'login.microsoftonline.com', 'S2d — same microsoftSsoUrl as today');
  const scope = loc.searchParams.get('scope') ?? '';
  for (const s of ['openid', 'email', 'profile']) assert.ok(scope.includes(s), `scope keeps ${s}`);
  assert.ok(!scope.includes('Calendars'), 'S2d — no scope is enlarged');

  const state = stateOf(start as never);
  assert.ok(state, 'a state travels');
  assertOpaque(state, 'sso_ms');
  const p = await new OAuthState(KEY).open(state);
  assert.ok(p, 'S4c — sealed under the deployment’s own TOKEN_KEY');
  assert.equal(p!['purpose'], 'sso_ms');
  assert.equal(await new OAuthState(OTHER_KEY).open(state), undefined,
    'S4c — and under no other key');

  await makeOwner('ms-user@example.com');
  const restore = stubMicrosoft('ms-user@example.com');
  try {
    const cb = await call('GET', '/oauth/microsoft/callback', { query: { code: 'c', state } });
    assert.equal(cb.status, 303, `the round trip completes, got "${errText(cb.body)}"`);
    assert.equal(cb.headers['location'], '/app');
    const dash = await call('GET', '/app', { cookie: cookieOf(cb as never) });
    assert.equal(dash.status, 200, 'the session it issues actually signs the person in');
  } finally { restore(); }
});

// ── A-002 · per-org OIDC SSO, no Google Calendar. RED before the fix ───────

test('A-002 · org OIDC SSO completes on a deployment with no Google Calendar', async () => {
  deps = makeDeps(IDP_ONLY);
  const { cookie, orgId } = await makeOrg();
  await configureSso(cookie, orgId);

  const steer = await call('POST', '/login', { form: { email: 'worker@corp.example' } });
  assert.equal(steer.status, 303);
  assert.equal(steer.headers['location'], `/login/sso/${orgId}`,
    'domain steering is unchanged and points at the route under test');

  const restore = stubIdp('worker@corp.example');
  try {
    const start = await call('GET', `/login/sso/${orgId}`);
    assert.equal(start.status, 303,
      `S3a — expected a redirect to the IdP, got ${start.status} "${errText(start.body)}"`);
    assert.ok(String(start.headers['location']).startsWith('https://idp.corp.example/authorize'),
      'S3d — discovery and redirect unchanged');

    const state = stateOf(start as never);
    assertOpaque(state, orgId);
    const p = await new OAuthState(KEY).open(state);
    assert.ok(p, 'S4c — sealed under the deployment’s own TOKEN_KEY');
    assert.equal(p!['purpose'], 'oidc');
    assert.equal(p!['org'], orgId);
    assert.equal(await new OAuthState(OTHER_KEY).open(state), undefined);

    const cb = await call('GET', '/oauth/oidc/callback', { query: { code: 'c', state } });
    assert.equal(cb.status, 303, `the round trip completes, got "${errText(cb.body)}"`);
    const dash = await call('GET', '/app', { cookie: cookieOf(cb as never) });
    assert.equal(dash.status, 200);

    const member = await db.query(
      `SELECT provisioned_by FROM owners WHERE email = 'worker@corp.example'`);
    assert.equal(String(member.rows[0]!['provisioned_by']), `sso:${orgId}`,
      'JIT provisioning inside the org still happens');

    // The Workers build forwards /login/sso/<tag> into the Durable Object as
    // '/login/sso/main' (worker.ts:805) — the alias is the deployed path (S4e).
    const alias = await call('GET', '/login/sso/main');
    assert.equal(alias.status, 303,
      `S4e — the tenant alias the Workers router forwards must work too, got "${errText(alias.body)}"`);
  } finally { restore(); }
});

// ── A-003 · each door still refuses on its own missing configuration ───────

test('A-003 · the doors keep their own credential checks', async () => {
  // TOKEN_KEY alone does not open the Microsoft door.
  deps = makeDeps(IDP_ONLY);
  const r1 = await call('POST', '/auth/microsoft/start', { form: {} });
  assert.equal(r1.status, 404);
  assert.equal(errText(r1.body), 'Microsoft sign-in is not configured.');

  // An org id that does not exist, and the 'main' alias with no orgs at all.
  deps = makeDeps(MS_ONLY);
  const r2 = await call('GET', '/login/sso/no-such-org');
  assert.equal(r2.status, 404);
  assert.equal(errText(r2.body), 'This organization has no SSO configured.');

  const r3 = await call('GET', '/login/sso/main');
  assert.equal(r3.status, 404);
  assert.equal(errText(r3.body), 'This organization has no SSO configured.');

  // An org that exists but has configured no SSO.
  const { orgId } = await makeOrg();
  const r4 = await call('GET', `/login/sso/${orgId}`);
  assert.equal(r4.status, 404);
  assert.equal(errText(r4.body), 'This organization has no SSO configured.');

  // No TOKEN_KEY: nothing can be sealed, so neither door opens — and since
  // Amendment 2 (SPEC-0009 S1b/S2c) the answer names the key; both builds
  // take the sentence from one signInRefusal().
  deps = makeDeps(NO_KEY);
  const r5 = await call('POST', '/auth/microsoft/start', { form: {} });
  assert.equal(r5.status, 404);
  assert.equal(errText(r5.body), 'Microsoft sign-in cannot start on this deployment: TOKEN_KEY is not configured.');

  // ...even with the organisation's SSO fully configured: the deployment check
  // stays above the org lookup and keeps its wording (S3b, S3c).
  const org2 = await makeOrg('boss2@corp.example');
  await configureSso(org2.cookie, org2.orgId);
  const restore = stubIdp();
  try {
    const r6 = await call('GET', `/login/sso/${org2.orgId}`);
    assert.equal(r6.status, 404);
    assert.equal(errText(r6.body), 'SSO cannot start on this deployment: TOKEN_KEY is not configured.');
    assert.equal(r6.headers['location'], undefined,
      'with no seal key nothing unsigned is produced as a fallback');
  } finally { restore(); }
});

// ── A-004 · nothing outside this spec’s two doors moves ────────────────────

test('A-004 · Google sign-in, calendar connect and the calendar callback are unchanged', async () => {
  // A client id with no secret is not a configured Google sign-in — and since
  // Amendment 2 (SPEC-0009 S1b) the refusal names the secret.
  deps = makeDeps(GOOGLE_ID_ONLY);
  const g1 = await call('POST', '/auth/google/start', { form: {} });
  assert.equal(g1.status, 404);
  assert.equal(errText(g1.body), 'Google sign-in cannot start on this deployment: GOOGLE_OAUTH_CLIENT_SECRET is not configured.');

  deps = makeDeps(MS_ONLY);
  const g2 = await call('POST', '/auth/google/start', { form: {} });
  assert.equal(g2.status, 404);
  assert.equal(errText(g2.body), 'Google sign-in is not configured.');

  // With a hub it still works, unchanged.
  deps = makeDeps({ ...MS_ONLY, GOOGLE_OAUTH_CLIENT_ID: 'cid', GOOGLE_OAUTH_CLIENT_SECRET: 'csec' }, OTHER_KEY);
  const g3 = await call('POST', '/auth/google/start', { form: {} });
  assert.equal(g3.status, 303);
  assert.ok(String(g3.headers['location']).includes('accounts.google.com'));

  // Calendar connect stays gated on the calendar hub.
  deps = makeDeps(MS_ONLY);
  const cookie = await makeOwner('cal@example.com');
  const c1 = await call('POST', '/app/calendar/google/connect', { cookie, form: {} });
  // The route's own condition carries `&& deps.calendars` (app.ts:2661), so on a
  // hub-less deployment it does not match and the request falls through to the
  // /app view. That 200 is today's answer, verified against 0036c74 rather than
  // assumed; what matters is that no calendar connect starts.
  assert.equal(c1.status, 200, 'calendar connect is not reachable without a calendar hub');
  assert.ok(c1.body.includes('Your schedules'), 'it falls through to the owner’s own dashboard');
  assert.equal(c1.headers['location'], undefined);
  assert.ok(!c1.body.includes('accounts.google.com'),
    'no Google authorize URL is offered anywhere in the answer');

  // spec/0006 S2d's calendar 404 keeps its message and its placement.
  const calState = await new OAuthState(KEY).seal({ owner_id: 'o1', level: 'freebusy', tag: '' });
  const c2 = await call('GET', '/oauth/google/callback', { query: { code: 'c', state: calState } });
  assert.equal(c2.status, 404);
  assert.equal(errText(c2.body), 'Calendar integration is not configured.');
});

// ── A-005 · a deployment WITH a hub is unchanged, including a foreign key ──

test('A-005 · the hub’s own sealer seals when a hub exists', async () => {
  deps = makeDeps(MS_ONLY, OTHER_KEY);

  const start = await call('POST', '/auth/microsoft/start', { form: {} });
  assert.equal(start.status, 303);
  const state = stateOf(start as never);

  const hub = deps.calendars!;
  const viaHub = await hub.openState(state);
  assert.ok(viaHub, 'S1b — the hub that will open it is the one that sealed it');
  assert.equal(viaHub!['purpose'], 'sso_ms');
  assert.equal(await new OAuthState(KEY).open(state), undefined,
    'S1b — config.tokenKey did NOT seal it');

  await makeOwner('hub-ms@example.com');
  const restore = stubMicrosoft('hub-ms@example.com');
  try {
    const cb = await call('GET', '/oauth/microsoft/callback', { query: { code: 'c', state } });
    assert.equal(cb.status, 303, 'the state opens on the way back');
    assert.equal(cb.headers['location'], '/app');
  } finally { restore(); }

  // The same, for org SSO.
  const { cookie, orgId } = await makeOrg();
  await configureSso(cookie, orgId);
  const restore2 = stubIdp('worker@corp.example');
  try {
    const s = await call('GET', `/login/sso/${orgId}`);
    assert.equal(s.status, 303);
    const st = stateOf(s as never);
    assert.ok(await hub.openState(st), 'S1b — sealed by the hub here too');
    const cb = await call('GET', '/oauth/oidc/callback', { query: { code: 'c', state: st } });
    assert.equal(cb.status, 303);
  } finally { restore2(); }
});

// ── A-006 · both builds answer a half-configured door from ONE implementation ──
// (Amendment 2: until v1.2.0 this case froze SPEC-0007's own diff — S4d.)

test('A-006 · neither build carries its own copy of a refusal sentence (S4d, as amended)', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  // Sources, not build output: this file also runs from `.build/test/`.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6 && !(existsSync(join(dir, 'migrations')) && existsSync(join(dir, 'src'))); i++) {
    dir = dirname(dir);
  }
  const worker = readFileSync(join(dir, 'src/worker.ts'), 'utf8');
  const appSrc = readFileSync(join(dir, 'src/app.ts'), 'utf8');

  for (const [name, src] of [['worker.ts', worker], ['app.ts', appSrc]] as const) {
    assert.match(src, /import \{[^}]*\bsignInRefusal\b[^}]*\} from '\.\/config\.ts'/,
      `S4d as amended — ${name} takes its refusal from config.ts`);
    assert.ok(!src.includes("sign-in is not configured.'"),
      `S4d as amended — ${name} carries no literal 'not configured' sentence of its own`);
    assert.ok(!src.includes('cannot start on this deployment'),
      `S4d as amended — ${name} carries no literal 'cannot start' sentence of its own`);
  }
  assert.ok(!/const\s+hub\b/.test(worker),
    'S4d — the router holds no CalendarHub for state; spec/0006 removed it');
  assert.ok(worker.includes("forward(seg[2], { path: '/login/sso/main' })"),
    'S4e — org SSO is forwarded into the Durable Object, not reimplemented at the router');

  const app = readFileSync(join(dir, 'src/app.ts'), 'utf8');
  assert.ok(!app.includes('Buffer.from(JSON.stringify('),
    'S4c — spec/0006 S3a: no state is hand-built anywhere in app.ts');
});
