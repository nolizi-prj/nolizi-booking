/**
 * Cloudflare Workers entry — sharded: one Durable Object per tenant org.
 *
 * The worker is a ROUTER. It owns no data; it answers only the global pages
 * (home, login, signup, embed.js) and decides which world a request belongs
 * to, using:
 *
 *   - the org tag carried inside public tokens (/b/<tag>.<token>, /s/, /p/, /v/,
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
import { loadConfig, RATE_LIMITS, signInRefusal } from './config.ts';
import { handle, type AppDeps, type DirectoryPort } from './app.ts';
import { migrate } from './db.ts';
import { RecordingMail, RetryingMail, type MailPort } from './mail.ts';
import { GmailMail } from './mail-gmail.ts';
import type { SqlClient, Transactor } from './store.ts';
import { Serialiser } from './driver.ts';
import { bindable, normalizeDbError, splitSqlStatements, translateSql } from './sqlite-dialect.ts';
import { CalendarHub } from './calendars.ts';
import { OAuthState } from './oauth-state.ts';
import { GoogleCalendarProvider } from './calendar-google.ts';
import { MicrosoftCalendarProvider } from './calendar-microsoft.ts';
import { Directory, dispatchDirectoryCall, type DirectoryCall } from './directory.ts';
import { googleSsoExchange, googleSsoUrl } from './sso-google.ts';
import { microsoftSsoExchange, microsoftSsoUrl } from './sso-microsoft.ts';
import { errorPage, FAVICON_SVG, homePage, legalPage, loginPage, signupPage } from './pages.ts';
import { submitFeedback, type FeedbackPayload } from './feedback.ts';
import { LEGAL_DOCS } from './legal.ts';
import { VERSION } from './version.ts';
import { processDueJobs } from './automation.ts';
// Bundled as text via the `rules` entry in wrangler.jsonc; typed by
// types/sql-modules.d.ts, which tsconfig.worker.json includes.
import schema001 from '../migrations-sqlite/001_schema.sql';
import schema002 from '../migrations-sqlite/002_calendar.sql';
import schema003 from '../migrations-sqlite/003_availability_sets.sql';
import schema004 from '../migrations-sqlite/004_meetings.sql';
import schema005 from '../migrations-sqlite/005_profile.sql';
import schema006 from '../migrations-sqlite/006_teams.sql';
import schema007 from '../migrations-sqlite/007_routing_polls.sql';
import schema008 from '../migrations-sqlite/008_automation.sql';
import schema009 from '../migrations-sqlite/009_enterprise.sql';
import schema010 from '../migrations-sqlite/010_limits.sql';
import schema011 from '../migrations-sqlite/011_recurrence.sql';
import schema012 from '../migrations-sqlite/012_blocked_sources.sql';
import schema013 from '../migrations-sqlite/013_email_verification.sql';
import schema014 from '../migrations-sqlite/014_custom_questions.sql';
import schema015 from '../migrations-sqlite/015_branding.sql';
import schema016 from '../migrations-sqlite/016_video_connections.sql';
import schema017 from '../migrations-sqlite/017_no_show_workflows.sql';

/** 5MB ceiling to support in-app feedback screenshots and diagnostic bundles. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

interface DoStub { fetch(r: Request): Promise<Response> }
interface DoNamespace { idFromName(name: string): unknown; get(id: unknown): DoStub }

/**
 * The env as this file uses it: a string bag, because most of what it reads —
 * GMAIL_SA_KEY, BOOTSTRAP_INVITE, GIT_COMMIT and everything loadConfig() takes
 * — arrives through `wrangler secret put` and so never appears in
 * wrangler.jsonc. `wrangler types` only sees wrangler.jsonc, so the generated
 * `Env` carries the three plaintext vars and the two bindings and nothing
 * else; the widening cast at each use site says that in one place rather than
 * pretending the two views are the same shape.
 */
type WorkerEnv = Record<string, string | undefined> & {
  PUMASI: DoNamespace;
  DIRECTORY: DoNamespace;
};

type DoStorage = {
  sql: { exec(q: string, ...b: unknown[]): { toArray(): Record<string, unknown>[] } };
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  setAlarm(t: number): Promise<void>;
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
        const stmts = splitSqlStatements(text);
        for (const s of stmts) {
          storage.sql.exec(translateSql(s));
        }
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
    const env = this.env as unknown as WorkerEnv;
    const storage = this.ctx.storage as unknown as DoStorage;
    const config = loadConfig(env as never);
    const dir = new Directory(sqlClientOver(storage), config.maxOwnerAccounts);
    const boot = await dir.ensure(env['BOOTSTRAP_INVITE']);
    if (boot) console.log(`[directory] bootstrap platform invite: ${boot}`);
    this.#dir = dir;
    return dir;
  }

  override async fetch(request: Request): Promise<Response> {
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

    const env = this.env as unknown as WorkerEnv;
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
          { name: '010_limits.sql', sql: schema010 as string },
          { name: '011_recurrence.sql', sql: schema011 as string },
          { name: '012_blocked_sources.sql', sql: schema012 as string },
          { name: '013_email_verification.sql', sql: schema013 as string },
          { name: '014_custom_questions.sql', sql: schema014 as string },
          { name: '015_branding.sql', sql: schema015 as string },
          { name: '016_video_connections.sql', sql: schema016 as string },
          { name: '017_no_show_workflows.sql', sql: schema017 as string },
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
        {
          google: new GoogleCalendarProvider(config.googleClientId, config.googleClientSecret),
          ...(config.msClientId && config.msClientSecret
            ? { microsoft: new MicrosoftCalendarProvider(config.msClientId, config.msClientSecret) }
            : {}),
        },
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
      this.#deps.directory = directoryPort(this.env as unknown as WorkerEnv, tag);
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
            verifyEmail: t('x-trusted-verify-email') === '1',
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
    try {
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
      opts: { path?: string; trusted?: Record<string, string>; orgCookie?: boolean; method?: string } = {},
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
      const method = opts.method ?? request.method;
      const res = await orgStub(tag).fetch(new Request(target.toString(), {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : rawBody,
        // fetch defaults to redirect:'follow', which would silently chase the
        // org DO's 303s (and drop their Set-Cookie) — pass them through raw.
        redirect: 'manual',
      }));
      if (!opts.orgCookie) return res;
      // The routing cookie rides beside the session cookie.
      // Create a fresh Headers object so append is always mutable on all runtimes.
      const resHeaders = new Headers(res.headers);
      resHeaders.append(
        'set-cookie',
        `pumasi_org=${tag}; Path=/; Secure; SameSite=Lax; Max-Age=${config.sessionTtlHours * 3600}`,
      );
      return new Response(res.status === 204 || res.status === 304 ? null : res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
      });
    };

    // SPEC-0006 S4d · the router only ever needed to seal and open an OAuth
    // state — it held a provider-less CalendarHub to do it, which is what
    // named the thing wrongly in the first place. Same condition, same wire
    // format, one implementation (S1c); the router's responses do not move.
    const states = config.tokenKey ? new OAuthState(config.tokenKey) : undefined;
    const ssoEnabled = { google: Boolean(config.googleClientId), microsoft: Boolean(config.msClientId) };

    // ── global, data-free surfaces ─────────────────────────────────────────
    // L-009 · the same three answers the Node entry gives at app.ts, from the
    // same generated constant. A version that appears on one entry point and
    // not the other is the defect class this product has already paid for.
    if (url.pathname === '/healthz') {
      return Response.json({
        status: 'ok', version: VERSION, commit: env['GIT_COMMIT'] ?? 'unknown', sharded: true,
      });
    }
    if (url.pathname === '/version') {
      return Response.json({ version: VERSION, commit: env['GIT_COMMIT'] ?? 'unknown' });
    }
    if (url.pathname === '/readyz') {
      const owners = await dir('ownerCount');
      // O4 · report the versions actually in use. This surface reported none
      // at all; it now reports the two it can honestly know. `tzdata` stays
      // off: the Node entry reads it from `process.versions.tz`, which the
      // Workers runtime does not have, and echoing core's PINNED_TZDATA here
      // would report an intention as a measurement.
      return Response.json({ status: 'ready', version: VERSION, commit: env['GIT_COMMIT'] ?? 'unknown', owners });
    }
    // Issue #3 · favicon
    const isGetOrHead = request.method === 'GET' || request.method === 'HEAD';
    if ((url.pathname === '/favicon.ico' || url.pathname === '/favicon.svg') && isGetOrHead) {
      return new Response(FAVICON_SVG, {
        status: 200,
        headers: {
          'content-type': 'image/svg+xml',
          'cache-control': 'public, max-age=86400',
        },
      });
    }
    if (url.pathname === '/' && isGetOrHead) {
      return htmlResponse(200, homePage(config.publicSignup));
    }
    if (url.pathname === '/login' && isGetOrHead) {
      return htmlResponse(200, loginPage(undefined, undefined, ssoEnabled));
    }
    if (url.pathname === '/signup' && isGetOrHead) {
      return htmlResponse(200, signupPage(url.searchParams.get('invite') ?? '', undefined,
        { sso: ssoEnabled, publicSignup: config.publicSignup }));
    }
    // D-105 · the privacy pack is global and data-free: the router serves it
    // without touching any tenant.
    if (isGetOrHead) {
      const doc = LEGAL_DOCS.find((d) => url.pathname === `/${d.slug}`);
      if (doc) return htmlResponse(200, legalPage(doc));
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

    if (url.pathname === '/api/feedback' && request.method === 'POST') {
      try {
        const payload = JSON.parse(rawBody ?? '{}') as FeedbackPayload;
        const result = await submitFeedback(payload, {
          githubToken: config.githubFeedbackToken,
          repo: config.githubFeedbackRepo,
        });
        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 400,
          headers: { 'content-type': 'application/json' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        });
      }
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
      const invite = (form['invite'] ?? '').trim();
      // I7 · THE GATE IS HERE, not in app.ts. The shard only ever sees a signup
      // that this router already authorised, so anything that decides who may
      // create an account has to be decided on this line.
      const isPublic = !invite && config.publicSignup;

      if (isPublic) {
        const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
        if (await dir('overSignupLimit', ip, RATE_LIMITS.signups_per_ip_per_hour, 3600)) {
          return htmlResponse(429, errorPage(429, 'Too many sign-up attempts. Try again later.'));
        }
      }

      const claim = (await (isPublic
        ? dir('claimSignupPublic', email)
        : dir('claimSignup', invite, email))) as
        | { ok: true; tag: string; newOrg: boolean }
        | { ok: false; reason: string };

      if (!claim.ok) {
        // I8 · On the public path the ONLY distinguishable refusal is the
        // ceiling, which is a fact about the deployment. 'already_registered'
        // must look exactly like success, or this endpoint answers "does this
        // person have an account here?" to anyone who asks. The invite path
        // keeps its specific messages: holding a valid invite is authorisation.
        if (isPublic) {
          if (claim.reason === 'ceiling') {
            return htmlResponse(400, signupPage('',
              'This service has reached its account limit and is not taking more.',
              { sso: ssoEnabled, publicSignup: config.publicSignup }));
          }
          return htmlResponse(200, loginPage(true));
        }
        const message =
          claim.reason === 'ceiling'
            ? 'This service has reached its account limit and is not taking more.'
            : claim.reason === 'already_registered'
              ? 'That address already has an account. Sign in instead.'
              : 'That invite is not valid or has already been used.';
        return htmlResponse(400, signupPage(invite, message,
          { sso: ssoEnabled, publicSignup: config.publicSignup }));
      }
      const trusted = {
        'x-trusted-signup-email': email,
        'x-trusted-name': (form['display_name'] ?? '').trim(),
        'x-trusted-tz': (form['timezone'] ?? 'UTC').trim(),
        'x-trusted-new-org': claim.newOrg ? '1' : '0',
      };
      if (isPublic) {
        // I8 · The shard creates the account and mails the sign-in link (I7),
        // but the ROUTER authors the response — the same htmlResponse() as the
        // already_registered branch above, so created and taken cannot differ
        // in status, body, or headers. The org cookie is deliberately absent:
        // it was the oracle a cross-family review caught (reviews/, grok) —
        // the bodies matched while Set-Cookie: pumasi_org distinguished them
        // and leaked the org tag. The sign-in link is tagged, and
        // /auth/<tag>.<token> sets the cookie at redemption, so nothing needs
        // it before the mailbox is proven.
        const res = await forward(claim.tag, {
          trusted: { ...trusted, 'x-trusted-verify-email': '1' },
        });
        if (res.status >= 500) return res; // a genuine failure stays visible
        return htmlResponse(200, loginPage(true));
      }
      return forward(claim.tag, { orgCookie: true, trusted });
    }

    // "Continue with Google": the router seals the state and runs the
    // exchange; the directory decides which world the identity belongs to.
    if (url.pathname === '/auth/google/start' && request.method === 'POST') {
      // SPEC-0009 S2b · this door opened on the client id alone and sent a
      // deployment with no secret to Google, to be refused on the way back.
      // The guard and its sentence are the Node path's, from one place (S1a).
      const refusal = signInRefusal(config, 'google', Boolean(states));
      if (refusal !== undefined) return htmlResponse(404, errorPage(404, refusal));
      const state = await states!.seal({
        purpose: 'sso',
        invite: (form['invite'] ?? '').trim(),
        timezone: (form['timezone'] ?? '').trim(),
      });
      return Response.redirect(googleSsoUrl({
        clientId: config.googleClientId!,
        redirectUri: `${config.baseUrl}/oauth/google/callback`,
        state,
      }), 303);
    }

    // "Continue with Microsoft": the router seals the state and runs the
    // exchange; the directory decides which world the identity belongs to.
    if (url.pathname === '/auth/microsoft/start' && request.method === 'POST') {
      // SPEC-0009 S2c · same helper, same sentence as app.ts.
      const refusal = signInRefusal(config, 'microsoft', Boolean(states));
      if (refusal !== undefined) return htmlResponse(404, errorPage(404, refusal));
      const state = await states!.seal({
        purpose: 'sso_ms',
        invite: (form['invite'] ?? '').trim(),
        timezone: (form['timezone'] ?? '').trim(),
      });
      return Response.redirect(microsoftSsoUrl({
        clientId: config.msClientId!,
        redirectUri: `${config.baseUrl}/oauth/microsoft/callback`,
        state,
      }), 303);
    }

    if (seg[0] === 'oauth' && seg[2] === 'callback' && request.method === 'GET') {
      // SPEC-0009 S2e · app.ts's sentence for the same condition, verbatim.
      if (!states) {
        return htmlResponse(404, errorPage(404,
          'This deployment cannot complete an OAuth connection: TOKEN_KEY is not configured.'));
      }
      const state = await states.open(url.searchParams.get('state') ?? '');
      const code = url.searchParams.get('code');
      if (!state || !code) {
        return htmlResponse(400, errorPage(400, 'This attempt is stale or invalid. Start again.'));
      }
      if (state['purpose'] === 'sso') {
        // SPEC-0009 S2g · the callback's own refusal names what is missing too.
        const refusal = signInRefusal(config, 'google', true);
        if (refusal !== undefined) return htmlResponse(404, errorPage(404, refusal));
        let email: string;
        try {
          const who = await googleSsoExchange({
            clientId: config.googleClientId!,
            clientSecret: config.googleClientSecret!,
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
            trusted: {
              'x-trusted-sso-email': email,
              'x-trusted-name': email.split('@')[0] ?? 'user',
              'x-trusted-tz': state['timezone'] || 'UTC',
            },
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
            method: 'POST',
            orgCookie: true,
            trusted: {
              'x-trusted-signup-email': email,
              'x-trusted-name': email.split('@')[0] ?? 'user',
              'x-trusted-tz': state['timezone'] || 'UTC',
              'x-trusted-new-org': claim.newOrg ? '1' : '0',
            },
          });
        }
        if (config.publicSignup) {
          // I2 · Public sign-up applies to the Google path too — the signup
          // page shows the button, so refusing here would strand exactly the
          // people it invited. Google asserted email_verified, so I7's mailbox
          // proof is already met and the session may begin now. A taken
          // address cannot reach here: the lookup above signs it in instead.
          // I9 · The ceiling is on SIGN-UPS, not on mail — this path sends
          // none, and it is limited anyway (grok, second review).
          const ssoIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
          if (await dir('overSignupLimit', ssoIp, RATE_LIMITS.signups_per_ip_per_hour, 3600)) {
            return htmlResponse(429, errorPage(429, 'Too many sign-up attempts. Try again later.'));
          }
          const claim = (await dir('claimSignupPublic', email)) as
            | { ok: true; tag: string; newOrg: boolean }
            | { ok: false; reason: string };
          if (!claim.ok) {
            // The ceiling is the one distinguishable refusal (I8): a fact
            // about the deployment, not about any person.
            return htmlResponse(400, errorPage(400,
              'This service has reached its account limit and is not taking more.'));
          }
          return forward(claim.tag, {
            path: '/signup',
            method: 'POST',
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
      if (state['purpose'] === 'sso_ms' || (seg[1] === 'microsoft' && state['purpose'] === 'sso')) {
        const refusal = signInRefusal(config, 'microsoft', true);
        if (refusal !== undefined) return htmlResponse(404, errorPage(404, refusal));
        let email: string;
        try {
          const who = await microsoftSsoExchange({
            clientId: config.msClientId!,
            clientSecret: config.msClientSecret!,
            code,
            redirectUri: `${config.baseUrl}/oauth/microsoft/callback`,
          });
          if (!who.emailVerified) {
            return htmlResponse(403, errorPage(403, 'That Microsoft account has no verified email.'));
          }
          email = who.email;
        } catch {
          return htmlResponse(502, errorPage(502, 'Microsoft did not complete the sign-in. Try again.'));
        }
        const existing = await dir('lookup', 'email', email);
        if (existing) {
          return forward(String(existing), {
            path: '/internal/sso-login',
            orgCookie: true,
            trusted: {
              'x-trusted-sso-email': email,
              'x-trusted-name': email.split('@')[0] ?? 'user',
              'x-trusted-tz': state['timezone'] || 'UTC',
            },
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
            method: 'POST',
            orgCookie: true,
            trusted: {
              'x-trusted-signup-email': email,
              'x-trusted-name': email.split('@')[0] ?? 'user',
              'x-trusted-tz': state['timezone'] || 'UTC',
              'x-trusted-new-org': claim.newOrg ? '1' : '0',
            },
          });
        }
        if (config.publicSignup) {
          const ssoIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
          if (await dir('overSignupLimit', ssoIp, RATE_LIMITS.signups_per_ip_per_hour, 3600)) {
            return htmlResponse(429, errorPage(429, 'Too many sign-up attempts. Try again later.'));
          }
          const claim = (await dir('claimSignupPublic', email)) as
            | { ok: true; tag: string; newOrg: boolean }
            | { ok: false; reason: string };
          if (!claim.ok) {
            return htmlResponse(400, errorPage(400,
              'This service has reached its account limit and is not taking more.'));
          }
          return forward(claim.tag, {
            path: '/signup',
            method: 'POST',
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
    if (['b', 's', 'p', 'v', 'auth'].includes(seg[0] ?? '') && seg[1]) {
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
    if (seg[0] === 'app' || seg[0] === 'logout' || (seg[0] === 'oauth' && seg[2] === 'authorize')) {
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
    } catch (err) {
      console.error(`[worker] top-level error: ${(err as Error).stack ?? (err as Error).message}`);
      return htmlResponse(500, errorPage(500, 'An unexpected error occurred. Please try again.'));
    }
  },
};
