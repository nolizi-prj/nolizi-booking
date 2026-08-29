/**
 * Cloudflare Workers entry — sharded: one Durable Object per tenant org.
 *
 * The worker is a ROUTER. It owns no data; it answers only the global pages
 * (home, login, signup, embed.js) and decides which world a request belongs
 * to, using:
 *
 *   - the org tag carried inside public tokens (/b/<tag>.<token>, /s/, /p/,
 *     /auth/, API keys pk_<tag>_…, SCIM tokens scim_<tag>_…),
 *   - the pumasi_org cookie for /app,
 *   - the sealed OAuth state's tag for callbacks,
 *   - the directory DO for everything name-shaped (emails, owner links,
 *     routing-form slugs, SSO domains) and for invites + the global ceiling.
 *
 * Each org DO is the ENTIRE previous single-tenant service, scoped to one
 * company: same schema, same handle(), one SQLite writer per tenant. That is
 * the isolation and the scaling story in one move.
 *
 * Trust model: org DOs are reachable only through their binding, so the
 * X-Org-Tag and X-Trusted-* headers the router attaches cannot be forged by
 * clients — and the router builds forwarded headers from scratch, so a
 * client-sent X-Trusted-* dies here.
 */

import { DurableObject } from 'cloudflare:workers';
import { loadConfig } from './config.ts';
import { handle, type AppDeps, type DirectoryPort } from './app.ts';
import { migrate } from './db.ts';
import { RecordingMail, RetryingMail, type MailPort } from './mail.ts';
import { GmailMail } from './mail-gmail.ts';
import type { SqlClient, Transactor } from './store.ts';
import { Serialiser } from './driver.ts';
import { bindable, normalizeDbError, translateSql } from './sqlite-dialect.ts';
import { CalendarHub } from './calendars.ts';
import { GoogleCalendarProvider } from './calendar-google.ts';
import { processDueJobs } from './automation.ts';
import { Directory, dispatchDirectoryCall, type DirectoryCall } from './directory.ts';
import { googleSsoExchange, googleSsoUrl } from './sso-google.ts';
import { errorPage, homePage, loginPage, signupPage } from './pages.ts';
// Bundled as text via the `rules` entry in wrangler.jsonc.
// @ts-expect-error — .sql imports exist only under wrangler's bundler
import schema001 from '../migrations-sqlite/001_schema.sql';
// @ts-expect-error — .sql imports exist only under wrangler's bundler
import schema002 from '../migrations-sqlite/002_calendar.sql';
// @ts-expect-error — .sql imports exist only under wrangler's bundler
import schema003 from '../migrations-sqlite/003_availability_sets.sql';
// @ts-expect-error — .sql imports exist only under wrangler's bundler
import schema004 from '../migrations-sqlite/004_meetings.sql';
// @ts-expect-error — .sql imports exist only under wrangler's bundler
import schema005 from '../migrations-sqlite/005_profile.sql';
// @ts-expect-error — .sql imports exist only under wrangler's bundler
import schema006 from '../migrations-sqlite/006_teams.sql';
// @ts-expect-error — .sql imports exist only under wrangler's bundler
import schema007 from '../migrations-sqlite/007_routing_polls.sql';
// @ts-expect-error — .sql imports exist only under wrangler's bundler
import schema008 from '../migrations-sqlite/008_automation.sql';
// @ts-expect-error — .sql imports exist only under wrangler's bundler
import schema009 from '../migrations-sqlite/009_enterprise.sql';

/** Mirrors server.ts: a form here is a name, an address and two timestamps. */
const MAX_BODY_BYTES = 64 * 1024;

interface DoStub { fetch(r: Request): Promise<Response> }
interface DoNamespace { idFromName(name: string): unknown; get(id: unknown): DoStub }

type WorkerEnv = Record<string, string | undefined> & {
  PUMASI: DoNamespace;
  DIRECTORY: DoNamespace;
};

type DoStorage = {
  sql: { exec(q: string, ...b: unknown[]): { toArray(): Record<string, unknown>[] } };
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  setAlarm(t: number): Promise<void>;
  deleteAll(): Promise<void>;
};

function sqlClientOver(storage: DoStorage): SqlClient {
  return {
    query: async (text, params) => {
      try {
        return { rows: storage.sql.exec(translateSql(text), ...bindable(params)).toArray() };
      } catch (err) {
        throw normalizeDbError(err);
      }
    },
    exec: async (text) => {
      try {
        storage.sql.exec(text);
      } catch (err) {
        throw normalizeDbError(err);
      }
    },
  };
}

// ── the directory DO: the only global state ─────────────────────────────────

export class PumasiDirectory extends DurableObject {
  #dir: Directory | undefined;

  async #init(): Promise<Directory> {
    if (this.#dir) return this.#dir;
    const env = this.env as WorkerEnv;
    const storage = this.ctx.storage as unknown as DoStorage;
    const config = loadConfig(env as never);
    const dir = new Directory(sqlClientOver(storage), config.maxOwnerAccounts);
    const boot = await dir.ensure(env['BOOTSTRAP_INVITE']);
    if (boot) console.log(`[directory] bootstrap platform invite: ${boot}`);
    this.#dir = dir;
    return dir;
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/__wipe' && request.method === 'POST') {
      await (this.ctx.storage as unknown as DoStorage).deleteAll();
      this.#dir = undefined;
      return new Response('wiped\n');
    }
    const dir = await this.#init();
    const call = (await request.json()) as DirectoryCall;
    const result = await dispatchDirectoryCall(dir, call);
    return new Response(JSON.stringify({ result: result ?? null }), {
      headers: { 'content-type': 'application/json' },
    });
  }
}

/** The worker-side (and org-DO-side) client for the directory DO. */
function directoryClient(env: WorkerEnv) {
  const stub = env.DIRECTORY.get(env.DIRECTORY.idFromName('main'));
  return async (method: DirectoryCall['method'], ...args: unknown[]): Promise<unknown> => {
    const res = await stub.fetch(new Request('https://directory/call', {
      method: 'POST',
      body: JSON.stringify({ method, args }),
    }));
    if (!res.ok) throw new Error(`directory call failed: ${method} ${res.status}`);
    return ((await res.json()) as { result: unknown }).result;
  };
}

function directoryPort(env: WorkerEnv, tag: string): DirectoryPort {
  const call = directoryClient(env);
  return {
    claimEmail: async (email) => {
      const r = (await call('claimEmailForOrg', email, tag)) as
        | { ok: true } | { ok: false; reason: string };
      return r.ok ? 'ok' : r.reason === 'ceiling' ? 'ceiling' : 'taken';
    },
    registerLink: async (slug, oldSlug) =>
      Boolean(await call('registerLink', tag, slug, oldSlug)),
    registerForm: async (slug) => Boolean(await call('registerForm', tag, slug)),
    releaseForm: async (slug) => void (await call('releaseForm', tag, slug)),
    registerDomain: async (domain) => void (await call('registerDomain', tag, domain)),
    releaseOwner: async (email, linkSlug) =>
      void (await call('releaseOwner', tag, email, linkSlug)),
    mintInvite: async (kind) => String(await call('mintInvite', kind, tag)),
  };
}

// ── the org DO: one company's entire world ──────────────────────────────────

export class PumasiService extends DurableObject {
  #deps: AppDeps | undefined;
  #serial = new Serialiser();
  #tag: string | undefined;

  async #init(): Promise<AppDeps> {
    if (this.#deps) return this.#deps;

    const storage = this.ctx.storage as unknown as DoStorage;
    const client = sqlClientOver(storage);
    const tx: Transactor = {
      transaction: (fn) => this.#serial.run(() => storage.transaction(() => fn(client))),
    };

    const env = this.env as WorkerEnv;
    const config = loadConfig(env as never);

    // Atomic per run: a migration file that fails midway must leave nothing
    // behind, or its retry meets its own half-applied DDL and the instance
    // wedges — which happened once, in production, with 003.
    const applied = await storage.transaction(() =>
      migrate(client, {
        files: [
          { name: '001_schema.sql', sql: schema001 as string },
          { name: '002_calendar.sql', sql: schema002 as string },
          { name: '003_availability_sets.sql', sql: schema003 as string },
          { name: '004_meetings.sql', sql: schema004 as string },
          { name: '005_profile.sql', sql: schema005 as string },
          { name: '006_teams.sql', sql: schema006 as string },
          { name: '007_routing_polls.sql', sql: schema007 as string },
          { name: '008_automation.sql', sql: schema008 as string },
          { name: '009_enterprise.sql', sql: schema009 as string },
        ],
      }),
    );
    if (applied.length > 0) console.log(`[db] migrations applied: ${applied.join(', ')}`);

    // The DO cannot read its own name; the router sends the tag on every
    // request and it is persisted so alarms know it too.
    await client.exec(`CREATE TABLE IF NOT EXISTS org_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    if (!this.#tag) {
      const meta = await client.query(`SELECT v FROM org_meta WHERE k = 'tag'`);
      if (meta.rows[0]) this.#tag = String(meta.rows[0]['v']);
    }

    // M1 · Gmail API when configured; otherwise mail is recorded, loudly.
    let inner: MailPort;
    const saKey = env['GMAIL_SA_KEY'];
    const impersonate = env['GMAIL_IMPERSONATE'];
    if (saKey && impersonate) {
      inner = new GmailMail({
        saKeyJson: saKey,
        impersonate,
        from: config.mailFrom,
        baseUrl: config.baseUrl,
      });
    } else {
      inner = new RecordingMail();
      console.warn('[mail] GMAIL_SA_KEY/GMAIL_IMPERSONATE unset — messages are recorded in memory and discarded.');
    }
    const mail = new RetryingMail(inner);

    // SPEC-0003 · calendar integration only when fully configured.
    let calendars: CalendarHub | undefined;
    if (config.googleClientId && config.googleClientSecret && config.tokenKey) {
      calendars = new CalendarHub(
        { google: new GoogleCalendarProvider(config.googleClientId, config.googleClientSecret) },
        config.tokenKey,
      );
    } else {
      console.warn('[calendar] GOOGLE_OAUTH_CLIENT_ID/SECRET/TOKEN_KEY unset — calendar integration off.');
    }

    const self = this;
    this.#deps = {
      sql: client,
      tx,
      config,
      mail,
      now: () => new Date().toISOString().replace('.000Z', 'Z'),
      ready: () => true, // init completes before any request is handled
      calendars,
      get orgTag() {
        return self.#tag;
      },
      directory: this.#tag ? directoryPort(env, this.#tag) : undefined,
      // P7 · nudge the alarm so newly enqueued jobs run when due. The DO holds
      // one alarm; the earliest pending job owns it.
      pump: async () => {
        const next = await client.query(
          `SELECT run_at FROM jobs WHERE status = 'pending' ORDER BY run_at LIMIT 1`);
        if (next.rows[0]) {
          const at = Math.max(Date.parse(String(next.rows[0]['run_at'])), Date.now() + 500);
          await storage.setAlarm(at);
        }
      },
    };
    return this.#deps;
  }

  async #adoptTag(tag: string | undefined): Promise<void> {
    if (!tag || this.#tag === tag) return;
    const storage = this.ctx.storage as unknown as DoStorage;
    const client = sqlClientOver(storage);
    await client.exec(`CREATE TABLE IF NOT EXISTS org_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
    await client.query(
      `INSERT INTO org_meta (k, v) VALUES ('tag', $1)
       ON CONFLICT (k) DO UPDATE SET v = $1`, [tag]);
    this.#tag = tag;
    // deps captured an undefined directory before the first tagged request.
    if (this.#deps && !this.#deps.directory) {
      this.#deps.directory = directoryPort(this.env as WorkerEnv, tag);
    }
  }

  /** P7 · the alarm drains due jobs and re-arms for the next one. */
  override async alarm(): Promise<void> {
    const deps = await this.#init();
    const next = await processDueJobs(deps.sql, deps.mail, deps.now());
    if (next) {
      await (this.ctx.storage as unknown as DoStorage)
        .setAlarm(Math.max(Date.parse(next), Date.now() + 1000));
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Development-phase escape hatch (router-authenticated): wipe this org.
    if (url.pathname === '/__wipe' && request.method === 'POST') {
      await (this.ctx.storage as unknown as DoStorage).deleteAll();
      this.#deps = undefined;
      this.#tag = undefined;
      return new Response('wiped\n');
    }

    await this.#adoptTag(request.headers.get('x-org-tag') ?? undefined);
    const deps = await this.#init();

    let form: Record<string, string> | undefined;
    let rawBody: string | undefined;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return new Response('request too large', { status: 413 });
      rawBody = raw;
      form = Object.fromEntries(new URLSearchParams(raw));
    }

    const t = (name: string) => request.headers.get(name) ?? undefined;
    const trusted =
      t('x-trusted-signup-email') || t('x-trusted-sso-email')
        ? {
            signupEmail: t('x-trusted-signup-email'),
            displayName: t('x-trusted-name'),
            timezone: t('x-trusted-tz'),
            newOrg: t('x-trusted-new-org') === '1',
            ssoEmail: t('x-trusted-sso-email'),
          }
        : undefined;

    const reply = await handle(deps, {
      method: request.method,
      path: url.pathname,
      ip: t('x-real-ip') ?? 'unknown',
      form,
      cookie: t('cookie'),
      authorization: t('authorization'),
      rawBody,
      query: Object.fromEntries(url.searchParams),
      trusted,
    });
    return new Response(reply.body, { status: reply.status, headers: reply.headers });
  }
}

// ── the router ──────────────────────────────────────────────────────────────

const htmlResponse = (status: number, body: string): Response =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });

/** `<tag>.<token>` → both halves, or undefined when the shape is wrong. */
function splitTagged(value: string): { tag: string; rest: string } | undefined {
  const dot = value.indexOf('.');
  if (dot <= 0 || dot === value.length - 1) return undefined;
  return { tag: value.slice(0, dot), rest: value.slice(dot + 1) };
}

/** `pk_<tag>_<secret>` / `scim_<tag>_<secret>` → the tag. */
function tagFromBearer(auth: string | null): string | undefined {
  const raw = (auth ?? '').replace(/^Bearer\s+/i, '').trim();
  const m = raw.match(/^(?:pk|scim)_([a-z0-9]+)_/);
  return m ? m[1] : undefined;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const seg = url.pathname.split('/').filter(Boolean);
    const config = loadConfig(env as never);
    const dir = directoryClient(env);
    const orgStub = (tag: string): DoStub =>
      env.PUMASI.get(env.PUMASI.idFromName(`org:${tag}`));

    /** Read the body once; every later forward reuses this string. */
    let rawBody: string | undefined;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
      rawBody = await request.text();
      if (rawBody.length > MAX_BODY_BYTES) {
        return new Response('request too large', { status: 413 });
      }
    }
    const form = rawBody ? Object.fromEntries(new URLSearchParams(rawBody)) : {};

    const forward = async (
      tag: string,
      opts: { path?: string; trusted?: Record<string, string>; orgCookie?: boolean } = {},
    ): Promise<Response> => {
      const target = new URL(url);
      if (opts.path) target.pathname = opts.path;
      // Headers built from scratch: client-sent X-Trusted-*/X-Org-Tag die here.
      const headers = new Headers();
      headers.set('x-org-tag', tag);
      headers.set('x-real-ip', request.headers.get('cf-connecting-ip') ?? 'unknown');
      const cookie = request.headers.get('cookie');
      if (cookie) headers.set('cookie', cookie);
      const auth = request.headers.get('authorization');
      if (auth) headers.set('authorization', auth);
      for (const [k, v] of Object.entries(opts.trusted ?? {})) headers.set(k, v);
      const res = await orgStub(tag).fetch(new Request(target.toString(), {
        method: request.method,
        headers,
        body: rawBody,
        // fetch defaults to redirect:'follow', which would silently chase the
        // org DO's 303s (and drop their Set-Cookie) — pass them through raw.
        redirect: 'manual',
      }));
      if (!opts.orgCookie) return res;
      // The routing cookie rides beside the session cookie.
      const out = new Response(res.body, res);
      out.headers.append('set-cookie',
        `pumasi_org=${tag}; Path=/; Secure; SameSite=Lax; Max-Age=${config.sessionTtlHours * 3600}`);
      return out;
    };

    const hub = config.tokenKey ? new CalendarHub({}, config.tokenKey) : undefined;
    const ssoEnabled = Boolean(config.googleClientId);

    // ── global, data-free surfaces ─────────────────────────────────────────
    if (url.pathname === '/healthz') {
      return Response.json({ status: 'ok', commit: env['GIT_COMMIT'] ?? 'unknown', sharded: true });
    }
    if (url.pathname === '/readyz') {
      const owners = await dir('ownerCount');
      return Response.json({ status: 'ready', owners });
    }
    if (url.pathname === '/' && request.method === 'GET') {
      return htmlResponse(200, homePage());
    }
    if (url.pathname === '/login' && request.method === 'GET') {
      return htmlResponse(200, loginPage(undefined, undefined, ssoEnabled));
    }
    if (url.pathname === '/signup' && request.method === 'GET') {
      return htmlResponse(200, signupPage(url.searchParams.get('invite') ?? '', undefined,
        { sso: ssoEnabled, publicSignup: config.publicSignup }));
    }
    if (url.pathname === '/embed.js' && request.method === 'GET') {
      const js = `(function(){var s=document.currentScript;var p=s.getAttribute('data-pumasi');if(!p)return;
var f=document.createElement('iframe');f.src=${JSON.stringify(config.baseUrl)}+p;
f.style.cssText='width:100%;height:'+(s.getAttribute('data-height')||'720')+'px;border:0;border-radius:8px';
f.loading='lazy';f.title='Book a time';s.parentNode.insertBefore(f,s);})();`;
      return new Response(js, {
        headers: { 'content-type': 'application/javascript; charset=utf-8',
                   'cache-control': 'public, max-age=3600' },
      });
    }

    // ── development wipe (router level): org by tag, or the directory ──────
    if (url.pathname === '/__wipe' && request.method === 'POST') {
      const wipeToken = env['WIPE_TOKEN'];
      if (!wipeToken || request.headers.get('authorization') !== `Bearer ${wipeToken}`) {
        return new Response('not found', { status: 404 });
      }
      const target = url.searchParams.get('target') ?? 'directory';
      const stub = target === 'directory'
        ? env.DIRECTORY.get(env.DIRECTORY.idFromName('main'))
        : orgStub(target);
      return stub.fetch(new Request(`${url.origin}/__wipe`, { method: 'POST' }));
    }

    // ── sign-in and sign-up, orchestrated with the directory ───────────────
    if (url.pathname === '/login' && request.method === 'POST') {
      const email = (form['email'] ?? '').trim().toLowerCase();
      const domain = email.slice(email.indexOf('@') + 1);
      const steered = await dir('lookup', 'domain', domain);
      if (steered) {
        return Response.redirect(`${config.baseUrl}/login/sso/${String(steered)}`, 303);
      }
      const tag = await dir('lookup', 'email', email);
      if (!tag) {
        // The same answer as success: whether an address has an account is
        // not something an unauthenticated caller gets to learn.
        return htmlResponse(200, loginPage(true));
      }
      return forward(String(tag));
    }

    if (url.pathname === '/signup' && request.method === 'POST') {
      const email = (form['email'] ?? '').trim();
      const claim = (await dir('claimSignup', (form['invite'] ?? '').trim(), email)) as
        | { ok: true; tag: string; newOrg: boolean }
        | { ok: false; reason: string };
      if (!claim.ok) {
        const message =
          claim.reason === 'ceiling'
            ? 'This service has reached its account limit and is not taking more.'
            : claim.reason === 'already_registered'
              ? 'That address already has an account. Sign in instead.'
              : 'That invite is not valid or has already been used.';
        return htmlResponse(400, signupPage((form['invite'] ?? '').trim(), message,
          { sso: ssoEnabled, publicSignup: config.publicSignup }));
      }
      return forward(claim.tag, {
        orgCookie: true,
        trusted: {
          'x-trusted-signup-email': email,
          'x-trusted-name': (form['display_name'] ?? '').trim(),
          'x-trusted-tz': (form['timezone'] ?? 'UTC').trim(),
          'x-trusted-new-org': claim.newOrg ? '1' : '0',
        },
      });
    }

    // "Continue with Google": the router seals the state and runs the
    // exchange; the directory decides which world the identity belongs to.
    if (url.pathname === '/auth/google/start' && request.method === 'POST') {
      if (!hub || !config.googleClientId) {
        return htmlResponse(404, errorPage(404, 'Google sign-in is not configured.'));
      }
      const state = await hub.sealState({
        purpose: 'sso',
        invite: (form['invite'] ?? '').trim(),
        timezone: (form['timezone'] ?? '').trim(),
      });
      return Response.redirect(googleSsoUrl({
        clientId: config.googleClientId,
        redirectUri: `${config.baseUrl}/oauth/google/callback`,
        state,
      }), 303);
    }

    if (seg[0] === 'oauth' && seg[2] === 'callback' && request.method === 'GET') {
      if (!hub) return htmlResponse(404, errorPage(404, 'Not configured.'));
      const state = await hub.openState(url.searchParams.get('state') ?? '');
      const code = url.searchParams.get('code');
      if (!state || !code) {
        return htmlResponse(400, errorPage(400, 'This attempt is stale or invalid. Start again.'));
      }
      if (state['purpose'] === 'sso') {
        if (!config.googleClientId || !config.googleClientSecret) {
          return htmlResponse(404, errorPage(404, 'Google sign-in is not configured.'));
        }
        let email: string;
        try {
          const who = await googleSsoExchange({
            clientId: config.googleClientId,
            clientSecret: config.googleClientSecret,
            code,
            redirectUri: `${config.baseUrl}/oauth/google/callback`,
          });
          if (!who.emailVerified) {
            return htmlResponse(403, errorPage(403, 'That Google account has no verified email.'));
          }
          email = who.email;
        } catch {
          return htmlResponse(502, errorPage(502, 'Google did not complete the sign-in. Try again.'));
        }
        const existing = await dir('lookup', 'email', email);
        if (existing) {
          return forward(String(existing), {
            path: '/internal/sso-login',
            orgCookie: true,
            trusted: { 'x-trusted-sso-email': email },
          });
        }
        if (state['invite']) {
          const claim = (await dir('claimSignup', state['invite'], email)) as
            | { ok: true; tag: string; newOrg: boolean }
            | { ok: false; reason: string };
          if (!claim.ok) {
            return htmlResponse(400, errorPage(400,
              'That invite is not valid, already used, or every seat is taken.'));
          }
          return forward(claim.tag, {
            path: '/signup',
            orgCookie: true,
            trusted: {
              'x-trusted-signup-email': email,
              'x-trusted-name': email.split('@')[0] ?? 'user',
              'x-trusted-tz': state['timezone'] || 'UTC',
              'x-trusted-new-org': claim.newOrg ? '1' : '0',
            },
          });
        }
        return htmlResponse(403, errorPage(403,
          'No account for that address. Accounts are invite-only while this service is small.'));
      }
      // Calendar connects and org-IdP callbacks carry their org in the state.
      if (state['tag']) {
        return forward(state['tag'], { orgCookie: state['purpose'] === 'oidc' });
      }
      return htmlResponse(400, errorPage(400, 'This attempt is stale or invalid. Start again.'));
    }

    // Internal sso-login must never be reachable from outside.
    if (seg[0] === 'internal') return htmlResponse(404, errorPage(404, 'Nothing here.'));

    // ── org SSO public entry: /login/sso/<tag> ─────────────────────────────
    if (seg[0] === 'login' && seg[1] === 'sso' && seg[2]) {
      return forward(seg[2], { path: '/login/sso/main' });
    }

    // ── tagged public tokens ───────────────────────────────────────────────
    if (['b', 's', 'p', 'auth'].includes(seg[0] ?? '') && seg[1]) {
      const split = splitTagged(seg[1]!);
      if (!split) return htmlResponse(404, errorPage(404, 'This link is not valid.'));
      const rest = seg.slice(2).join('/');
      return forward(split.tag, {
        path: `/${seg[0]}/${split.rest}${rest ? `/${rest}` : ''}`,
        orgCookie: seg[0] === 'auth',
      });
    }

    // ── bearer-keyed machine surfaces ──────────────────────────────────────
    if ((seg[0] === 'api' || seg[0] === 'scim') && seg[1]) {
      const tag = tagFromBearer(request.headers.get('authorization'));
      if (!tag) return Response.json({ error: 'missing or malformed bearer token' }, { status: 401 });
      return forward(tag);
    }

    // ── the signed-in app: routed by the org cookie ────────────────────────
    if (seg[0] === 'app' || seg[0] === 'logout') {
      const cookie = request.headers.get('cookie') ?? '';
      const m = cookie.match(/(?:^|;\s*)pumasi_org=([a-z0-9]+)/);
      if (!m) return Response.redirect(`${config.baseUrl}/login`, 303);
      return forward(m[1]!);
    }

    // ── routing forms: /r/<slug> resolves through the directory ────────────
    if (seg[0] === 'r' && seg[1]) {
      const tag = await dir('lookup', 'form', seg[1]!);
      if (!tag) return htmlResponse(404, errorPage(404, 'No such page.'));
      return forward(String(tag));
    }

    // ── owner pages: /<link>[/<event>[/book]] via the directory ────────────
    if (seg[0]) {
      const tag = await dir('lookup', 'link', seg[0]!);
      if (!tag) return htmlResponse(404, errorPage(404, 'No such page.'));
      return forward(String(tag));
    }

    return htmlResponse(404, errorPage(404, 'Nothing here.'));
  },
};
