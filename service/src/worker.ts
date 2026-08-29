/**
 * Cloudflare Workers entry — the whole service inside one Durable Object.
 *
 * Why a Durable Object and not D1: the store's transactions are interactive
 * (SELECT, decide, INSERT under one lock), which D1 does not offer. A
 * SQLite-backed DO gives real transactions on a single connection — exactly
 * the PGlite model the drivers already assume, with the storage persisted.
 *
 * One instance, named 'main', serves every request. That is a deliberate
 * ceiling, not an accident: this service is D1-capped to five owner accounts
 * (config.ts), and one SQLite writer is the concurrency model the SQL dialect
 * seam (sqlite-dialect.ts) depends on.
 *
 * This file is bundled by wrangler and excluded from the Node build; it must
 * not import anything node:-only at module scope.
 */

import { DurableObject } from 'cloudflare:workers';
import { loadConfig } from './config.ts';
import { handle, type AppDeps } from './app.ts';
import { migrate } from './db.ts';
import { bootstrapInvite } from './bootstrap.ts';
import { RecordingMail, RetryingMail, type MailPort } from './mail.ts';
import { GmailMail } from './mail-gmail.ts';
import type { SqlClient, Transactor } from './store.ts';
import { Serialiser } from './driver.ts';
import { bindable, normalizeDbError, translateSql } from './sqlite-dialect.ts';
import { CalendarHub } from './calendars.ts';
import { GoogleCalendarProvider } from './calendar-google.ts';
import { processDueJobs } from './automation.ts';
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

type WorkerEnv = Record<string, string | undefined> & {
  PUMASI: { idFromName(name: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } };
};

export class PumasiService extends DurableObject {
  #deps: AppDeps | undefined;
  #serial = new Serialiser();

  async #init(): Promise<AppDeps> {
    if (this.#deps) return this.#deps;

    const storage = (this.ctx as { storage: { sql: { exec(q: string, ...b: unknown[]): { toArray(): Record<string, unknown>[] } }; transaction<T>(fn: () => Promise<T>): Promise<T> } }).storage;

    const client: SqlClient = {
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

    // Invite-only needs a first invite, or nobody can ever start. The code
    // lands in the logs (`wrangler tail`), not in any response.
    const boot = await bootstrapInvite(client, env['BOOTSTRAP_INVITE']);
    if (boot.reason !== 'owners_exist') console.log(`[invite] bootstrap invite: ${boot.code}`);

    // M1 · Gmail API when configured (GMAIL_SA_KEY secret + GMAIL_IMPERSONATE
    // var); otherwise mail is recorded and discarded, loudly.
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
      console.log(`[mail] Gmail API transport active (as ${impersonate})`);
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
      console.log('[calendar] Google Calendar integration active');
    } else {
      console.warn('[calendar] GOOGLE_OAUTH_CLIENT_ID/SECRET/TOKEN_KEY unset — calendar integration off.');
    }

    this.#deps = {
      sql: client,
      tx,
      config,
      mail,
      now: () => new Date().toISOString().replace('.000Z', 'Z'),
      ready: () => true, // init completes before any request is handled
      calendars,
      // P7 · nudge the alarm so newly enqueued jobs run when due. The DO holds
      // one alarm; the earliest pending job owns it.
      pump: async () => {
        const next = await client.query(
          `SELECT run_at FROM jobs WHERE status = 'pending' ORDER BY run_at LIMIT 1`);
        if (next.rows[0]) {
          const at = Math.max(Date.parse(String(next.rows[0]['run_at'])), Date.now() + 500);
          await (this.ctx as unknown as { storage: { setAlarm(t: number): Promise<void> } })
            .storage.setAlarm(at);
        }
      },
    };
    return this.#deps;
  }

  /** P7 · the alarm drains due jobs and re-arms for the next one. */
  override async alarm(): Promise<void> {
    const deps = await this.#init();
    const next = await processDueJobs(deps.sql, deps.mail, deps.now());
    if (next) {
      const at = Math.max(Date.parse(next), Date.now() + 1000);
      await (this.ctx as unknown as { storage: { setAlarm(t: number): Promise<void> } })
        .storage.setAlarm(at);
    }
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Development-phase escape hatch: wipe this instance's storage. Guarded by
    // a dedicated secret; unset means the route does not exist. Remove before
    // real customer data exists (tracked in the P4 checklist).
    const wipeToken = (this.env as WorkerEnv)['WIPE_TOKEN'];
    if (url.pathname === '/__wipe' && request.method === 'POST') {
      if (!wipeToken || request.headers.get('authorization') !== `Bearer ${wipeToken}`) {
        return new Response('not found', { status: 404 });
      }
      const storage = (this.ctx as unknown as { storage: { deleteAll(): Promise<void> } }).storage;
      await storage.deleteAll();
      this.#deps = undefined;
      return new Response('wiped\n', { status: 200 });
    }

    const deps = await this.#init();

    let form: Record<string, string> | undefined;
    let rawBody: string | undefined;
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH' || request.method === 'DELETE') {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return new Response('request too large', { status: 413 });
      rawBody = raw;
      form = Object.fromEntries(new URLSearchParams(raw));
    }

    const reply = await handle(deps, {
      method: request.method,
      path: url.pathname,
      // Set by Cloudflare on every request; a client cannot forge it here.
      ip: request.headers.get('cf-connecting-ip') ?? 'unknown',
      form,
      cookie: request.headers.get('cookie') ?? undefined,
      authorization: request.headers.get('authorization') ?? undefined,
      rawBody,
      query: Object.fromEntries(url.searchParams),
    });
    return new Response(reply.body, { status: reply.status, headers: reply.headers });
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const id = env.PUMASI.idFromName('main');
    return env.PUMASI.get(id).fetch(request);
  },
};
