/**
 * P8 — enterprise identity: OIDC SSO per organization, SCIM provisioning,
 * domain steering, audit.
 */

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startPostgres, type TestPostgres } from './support/pg.ts';
import { migrate } from '../src/db.ts';
import { createPostgresDriver, type Database } from '../src/driver.ts';
import { handle, type AppDeps } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { RecordingMail, RetryingMail } from '../src/mail.ts';
import { CalendarHub } from '../src/calendars.ts';

const KEY = Buffer.alloc(32, 3).toString('base64');
const NOW = '2026-06-01T08:00:00Z';
let pg: TestPostgres;
let db: Database;
let deps: AppDeps;

before(async () => {
  pg = await startPostgres('enterprise');
  db = await createPostgresDriver(pg.url);
  await migrate(db);
});
after(async () => { await db?.close(); await pg?.stop(); });

beforeEach(async () => {
  await db.query(`TRUNCATE sign_in_tokens, sessions, invites, bookings, idempotency_keys,
    availability_rules, date_overrides, schedules, owners, availability_sets, set_rules,
    set_overrides, orgs, org_members, org_sso, audit_events RESTART IDENTITY CASCADE`);
  await db.query(`DELETE FROM rate_events`);
  deps = {
    sql: db, tx: db,
    config: loadConfig({ BASE_URL: 'https://booking.test' } as NodeJS.ProcessEnv),
    mail: new RetryingMail(new RecordingMail()),
    now: () => NOW,
    ready: () => true,
    calendars: new CalendarHub({}, KEY, () => NOW),
  };
});

const call = (method: string, path: string, opts: Partial<{ form: Record<string,string>; cookie: string; query: Record<string,string>; ip: string; authorization: string; rawBody: string }> = {}) =>
  handle(deps, { method, path, ip: opts.ip ?? '12.1.1.1', form: opts.form, cookie: opts.cookie,
    query: opts.query, authorization: opts.authorization, rawBody: opts.rawBody });

const cookieOf = (r: { headers: Record<string, string> }) =>
  (r.headers['set-cookie'] ?? '').split(';')[0]!;

async function adminWithOrg() {
  await db.query(`INSERT INTO invites (code) VALUES ('inv-p8')`);
  const r = await call('POST', '/signup', {
    form: { invite: 'inv-p8', email: 'boss@corp.example', display_name: 'Boss', timezone: 'UTC' },
  });
  const cookie = cookieOf(r as never);
  await call('POST', '/app/team', { cookie, form: { name: 'Corp' } });
  const org = await db.query(`SELECT org_id FROM orgs`);
  return { cookie, orgId: String(org.rows[0]!['org_id']) };
}

async function configureSso(cookie: string, orgId: string, domain = 'corp.example') {
  const r = await call('POST', `/app/team/${orgId}/sso`, {
    cookie, form: {
      issuer: 'https://idp.corp.example', client_id: 'cid', client_secret: 'sec',
      email_domain: domain,
    },
  });
  assert.equal(r.status, 303);
  const scim = decodeURIComponent(String(r.headers['location']).split('scim=')[1]!);
  return scim;
}

/** Stubs the IdP: discovery + token endpoint minting an id_token for `email`. */
function stubIdp(email: string): () => void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: unknown, init?: unknown) => {
    const u = String(url);
    if (u === 'https://idp.corp.example/.well-known/openid-configuration') {
      return new Response(JSON.stringify({
        authorization_endpoint: 'https://idp.corp.example/authorize',
        token_endpoint: 'https://idp.corp.example/token',
      }), { status: 200 });
    }
    if (u === 'https://idp.corp.example/token') {
      const payload = Buffer.from(JSON.stringify({ email })).toString('base64url');
      return new Response(JSON.stringify({ id_token: `h.${payload}.s` }), { status: 200 });
    }
    return realFetch(url as never, init as never);
  }) as typeof fetch;
  return () => { globalThis.fetch = realFetch; };
}

test('an org admin configures OIDC SSO and receives the SCIM token once', async () => {
  const { cookie, orgId } = await adminWithOrg();
  const scim = await configureSso(cookie, orgId);
  assert.match(scim, /^scim_/);
  const page = await call('GET', '/app/team', { cookie });
  assert.ok(page.body.includes('idp.corp.example'));
  assert.ok(!page.body.includes(scim), 'the SCIM token must not be shown again');
});

test('a login for a steered domain is sent to the org IdP', async () => {
  const { cookie, orgId } = await adminWithOrg();
  await configureSso(cookie, orgId);
  const r = await call('POST', '/login', { form: { email: 'someone@corp.example' } });
  assert.equal(r.status, 303);
  assert.equal(r.headers['location'], `/login/sso/${orgId}`);
});

test('OIDC signs in and JIT-provisions inside the org; foreign identities are refused', async () => {
  const { cookie, orgId } = await adminWithOrg();
  await configureSso(cookie, orgId);

  const restore = stubIdp('worker@corp.example');
  try {
    const start = await call('GET', `/login/sso/${orgId}`);
    assert.equal(start.status, 303);
    const state = new URL(start.headers['location']!).searchParams.get('state')!;
    const cb = await call('GET', '/oauth/oidc/callback', { query: { code: 'c', state } });
    assert.equal(cb.status, 303);
    const dash = await call('GET', '/app', { cookie: cookieOf(cb as never) });
    assert.equal(dash.status, 200);
  } finally { restore(); }

  const member = await db.query(
    `SELECT o.provisioned_by, m.role FROM owners o
       JOIN org_members m ON m.owner_id = o.owner_id
      WHERE o.email = 'worker@corp.example'`);
  assert.equal(String(member.rows[0]!['provisioned_by']), `sso:${orgId}`);
  assert.equal(String(member.rows[0]!['role']), 'member');

  // An identity outside the claimed domain is refused.
  const restore2 = stubIdp('intruder@elsewhere.example');
  try {
    const start = await call('GET', `/login/sso/${orgId}`);
    const state = new URL(start.headers['location']!).searchParams.get('state')!;
    const cb = await call('GET', '/oauth/oidc/callback', { query: { code: 'c', state } });
    assert.equal(cb.status, 403);
  } finally { restore2(); }
});

test('SCIM lists, provisions and deprovisions; a bad token gets 401', async () => {
  const { cookie, orgId } = await adminWithOrg();
  const scim = await configureSso(cookie, orgId);

  const bad = await call('GET', '/scim/v2/Users', { authorization: 'Bearer scim_wrong' });
  assert.equal(bad.status, 401);

  const made = await call('POST', '/scim/v2/Users', {
    authorization: `Bearer ${scim}`,
    rawBody: JSON.stringify({ userName: 'new.hire@corp.example', displayName: 'New Hire' }),
  });
  assert.equal(made.status, 201);
  const id = (JSON.parse(made.body) as { id: string }).id;

  const listed = await call('GET', '/scim/v2/Users', { authorization: `Bearer ${scim}` });
  assert.ok(listed.body.includes('new.hire@corp.example'));

  const gone = await call('DELETE', `/scim/v2/Users/${id}`, { authorization: `Bearer ${scim}` });
  assert.equal(gone.status, 204);
  const owners = await db.query(
    `SELECT count(*)::int AS c FROM owners WHERE email = 'new.hire@corp.example'`);
  assert.equal(Number(owners.rows[0]!['c']), 0, 'a SCIM-created account outlives deprovisioning');
});

test('the audit page shows provisioning and SSO events to the org admin', async () => {
  const { cookie, orgId } = await adminWithOrg();
  const scim = await configureSso(cookie, orgId);
  await call('POST', '/scim/v2/Users', {
    authorization: `Bearer ${scim}`,
    rawBody: JSON.stringify({ userName: 'aud.it@corp.example' }),
  });
  const page = await call('GET', '/app/audit', { cookie });
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('sso configured'));
  assert.ok(page.body.includes('member provisioned'));
});
