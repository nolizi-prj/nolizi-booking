/**
 * SPEC-0002 §3 — the HTTP surfaces.
 *
 * Routing and I/O only. Every availability question goes to the engine and
 * every exclusivity question goes to the database; neither is decided here.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { PostgresBookingStore, type SqlClient, type Transactor } from './store.ts';
import {
  availableSlots, findScheduleById, findScheduleByOwnerSlug, findScheduleBySlug, hostSlots,
  intersectSlots, loadHosts, loadQuestions, locationText, unionSlots, type EventHost, type Schedule,
} from './schedules.ts';
import {
  analyticsPage, availabilityEditor, bookingPage, confirmedPage, contactsPage, errorPage,
  eventTypeEditor,
  FAVICON_SVG,
  legalPage,
  apiKeysPage, auditPage, homePage, loginPage, managePage, meetingsPage, messagePage, ownerHome,
  ownerLanding, pollDetailPage, pollsPage, pollVotePage, routeFormPage, routingPage, settingsPage,
  signupPage, webhooksPage, workflowsPage,
  teamPage,
  snippetPage,
  integrationsPage,
  type ScheduleSummary,
} from './pages.ts';
import {
  clearedCookie, consumeSignInToken, createOwnerDirect, createSession, destroySession,
  issueSignInToken, ownerForSession, readCookie, redeemInvite, RESERVED_SLUGS, sessionCookie,
} from './identity.ts';
import { googleSsoExchange, googleSsoUrl } from './sso-google.ts';
import { microsoftSsoExchange, microsoftSsoUrl } from './sso-microsoft.ts';
import { discoverOidc, oidcAuthUrl, oidcExchange } from './sso-oidc.ts';
import { RATE_LIMITS, sealRefusal, signInRefusal, type Config } from './config.ts';
import type { CalendarHub } from './calendars.ts';
import { OAuthState } from './oauth-state.ts';
import { icsFor } from './ics.ts';
import { LEGAL_DOCS } from './legal.ts';
import { validateLogo } from './branding.ts';
import { describeRecurrence, expandRecurrence, isValidRecurrence } from './recurrence.ts';
import { cancelPendingJobs, fireTrigger, type BookingCtx } from './automation.ts';
import { submitFeedback, type FeedbackPayload } from './feedback.ts';
import { VERSION } from './version.ts';
import { createZoomMeeting, createZoomUserMeeting, zoomAuthUrl, zoomExchangeCode } from './video-zoom.ts';
import { VideoConnections } from './video.ts';
import type { MailPort } from './mail.ts';
import type { Interval, Slot } from '@pumasi/booking-core';

export interface Reply {
  status: number;
  headers: Record<string, string>;
  body: string;
}

const html = (status: number, body: string): Reply => ({
  status,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  body,
});
const json = (status: number, body: unknown): Reply => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

/** L1 · At least 128 bits from a CSPRNG. Not a booking id, not a sequence. */
export const newToken = (): string => randomBytes(32).toString('base64url');

/**
 * Sharding · claim the owner's link slug in the global directory, renaming
 * locally with a numeric suffix until the directory accepts one.
 */
async function registerOwnerLink(deps: AppDeps, sql: SqlClient, ownerId: string): Promise<void> {
  if (!deps.directory) return;
  const row = await sql.query(`SELECT link_slug FROM owners WHERE owner_id = $1`, [ownerId]);
  const base = row.rows[0]?.['link_slug'] ? String(row.rows[0]['link_slug']) : 'user';
  let slug = base;
  for (let i = 2; i < 30; i++) {
    if (await deps.directory.registerLink(slug)) {
      if (slug !== base) {
        await sql.query(`UPDATE owners SET link_slug = $2 WHERE owner_id = $1`, [ownerId, slug]);
      }
      return;
    }
    slug = `${base}-${i}`;
  }
}

/** P8 · one line in the ledger. Never throws; an audit line is not worth a 500. */
async function audit(
  sql: SqlClient,
  e: { ownerId?: string; orgId?: string; actor: string; action: string; detail?: string },
): Promise<void> {
  try {
    await sql.query(
      `INSERT INTO audit_events (owner_id, org_id, actor, action, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [e.ownerId ?? null, e.orgId ?? null, e.actor, e.action, e.detail ?? null]);
  } catch (err) {
    console.warn(`[audit] write failed: ${(err as Error).message}`);
  }
}

/** P7 · API keys are stored as digests; the raw key exists only in transit. */
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** SPEC-0003 · thrown when a connected calendar cannot be consulted. */
export class CalendarBlindError extends Error {}

export interface AppDeps {
  sql: SqlClient;
  /** Supplies a connection per transaction (driver.ts). */
  tx: Transactor;
  config: Config;
  mail: MailPort;
  /** Injected so tests control it and the service never reads an ambient clock. */
  now: () => string;
  ready: () => boolean;
  /** SPEC-0003 · absent means no calendar integration is configured. */
  calendars?: CalendarHub;
  /** P7 · nudges the host's job runner after new jobs are enqueued. */
  pump?: () => Promise<void>;
  /** Sharding · this deployment's org tag; absent = single-tenant host. */
  orgTag?: string;
  /** Sharding · the global directory; absent = single-tenant host. */
  directory?: DirectoryPort;
}

/** Sharding · what an org's world needs from the global directory. */
export interface DirectoryPort {
  /** SSO JIT: claim an email for this org. */
  claimEmail(email: string): Promise<'ok' | 'taken' | 'ceiling'>;
  registerLink(slug: string, oldSlug?: string): Promise<boolean>;
  registerForm(slug: string): Promise<boolean>;
  releaseForm(slug: string): Promise<void>;
  registerDomain(domain: string | null): Promise<void>;
  releaseOwner(email: string, linkSlug?: string): Promise<void>;
  mintInvite(kind: 'platform' | 'org'): Promise<string>;
}

/**
 * SPEC-0005 · the stored video connections, keyed by the deployment's
 * `TOKEN_KEY`.
 *
 * Built here from `config` rather than wired through `AppDeps`: TOKEN_KEY is
 * already the single source of the seal key, and a second wiring path is a
 * second thing to drift apart from the first (L-007). Absent TOKEN_KEY there is
 * nowhere safe to put a credential, so there is no store — the connect flow
 * refuses rather than writing a token in the clear.
 */
function videoConnections(config: Config, now: () => string): VideoConnections | undefined {
  return config.tokenKey ? new VideoConnections(config.tokenKey, now) : undefined;
}

/**
 * SPEC-0006 S2a · the OAuth state, built from `config` for the same reason
 * `videoConnections` is: TOKEN_KEY is already the single source of the seal
 * key, and a second wiring path through `AppDeps` is a second thing to drift
 * (L-007).
 *
 * This — not `deps.calendars` — is what an OAuth callback needs before it can
 * decide anything, because the state is what says which flow is arriving and
 * whose it is. Gating the callback on a calendar hub meant a deployment with a
 * Zoom app and no Google Calendar could start a connection it could never
 * finish (SPEC-0006 §0 D-a).
 */
function oauthState(config: Config): OAuthState | undefined {
  return config.tokenKey ? new OAuthState(config.tokenKey) : undefined;
}

/**
 * SPEC-0006 S3c · the one way this service starts a Zoom connect.
 *
 * Three call sites used to hold byte-identical copies of this redirect, each
 * with its own `hub ? sealState(...) : <unsigned base64url>` fallback. Three
 * copies of a security check is how one of them gets fixed and the others do
 * not; the unsigned branch is gone from all of them because there is only one
 * of them now.
 */
async function startZoomConnect(
  deps: AppDeps,
  config: Config,
  ownerId: string,
): Promise<Reply> {
  if (!config.zoomClientId) {
    return { status: 303, headers: { location: '/app/integrations?zoom_needed=1' }, body: '' };
  }
  const states = deps.calendars?.state ?? oauthState(config);
  if (!states) {
    // S3b · the same refusal SPEC-0005 Z1c already gives after the round trip,
    // given before it instead. With no TOKEN_KEY there is nowhere safe to put
    // the credential and no way to authenticate the state that fetches it.
    console.warn('[zoom] connect refused at start: TOKEN_KEY is not configured');
    return html(500, errorPage(500,
      'This deployment cannot start a Zoom connection: TOKEN_KEY is not configured.'));
  }
  const state = await states.seal({
    purpose: 'zoom_connect',
    owner_id: ownerId,
    tag: deps.orgTag ?? '',
  });
  return {
    status: 303,
    headers: {
      location: zoomAuthUrl({
        clientId: config.zoomClientId,
        redirectUri: `${config.baseUrl}/oauth/zoom/callback`,
        state,
      }),
    },
    body: '',
  };
}

/**
 * How long a booking-confirmation link lives. Long enough to walk to another
 * device for the mail, short enough that a link left in an inbox is not a
 * standing right to book. The time is not held during it, so a longer window
 * would only widen the gap between confirming and finding the slot gone.
 */
const VERIFY_TTL_MINUTES = 30;

/**
 * How much of one answer is kept. Generous for a sentence, far short of making
 * a booking form a place to store arbitrary text about a third party.
 */
const MAX_ANSWER_CHARS = 2000;

/** Sharding · public tokens carry the org tag so the router needs no lookup. */
const tagged = (deps: AppDeps, token: string): string =>
  deps.orgTag ? `${deps.orgTag}.${token}` : token;

/** I6 · Per-IP and per-schedule limits, counted in the database. */
async function overLimit(
  sql: SqlClient,
  bucket: string,
  limit: number,
  windowSeconds: number,
  nowIso: string,
): Promise<boolean> {
  const cutoff = Temporal.Instant.from(nowIso).subtract({ seconds: windowSeconds }).toString();
  await sql.query(`DELETE FROM rate_events WHERE seen_at < $1`, [
    Temporal.Instant.from(nowIso).subtract({ hours: 2 }).toString(),
  ]);
  const { rows } = await sql.query(
    `SELECT count(*)::int AS c FROM rate_events WHERE bucket = $1 AND seen_at >= $2`,
    [bucket, cutoff],
  );
  if (Number(rows[0]?.['c'] ?? 0) >= limit) return true;
  await sql.query(`INSERT INTO rate_events (bucket, seen_at) VALUES ($1, $2)`, [bucket, nowIso]);
  return false;
}

/**
 * The engine's `BookingStore` is synchronous because the engine is a pure
 * contract; this store is async. Rather than fabricate a store that always
 * answers "ok" — which would make the engine call decorative while reading as
 * though it decided something — the two decisions the engine actually owns are
 * applied directly and named:
 *
 *   B3/B7 · revalidation against the commit-time clock, below.
 *   B1/B5.1 · replay reports the booking's state now, below.
 *
 * Everything else — exclusivity, atomicity — is the database's, enforced by
 * constraints rather than by any check in this file.
 *
 * An earlier version of this file passed a fabricated store to the engine and
 * carried a comment saying "the engine decides; the store enforces". The engine
 * decided nothing: the fabricated store always returned ok and the real insert
 * used a different booking id. Adversarial review caught the comment being
 * false, which is worse than the code being wrong.
 */
function noticeExpired(startIso: string, nowIso: string, noticeMinutes: number): boolean {
  return (
    Temporal.Instant.compare(
      Temporal.Instant.from(startIso),
      Temporal.Instant.from(nowIso).add({ minutes: noticeMinutes }),
    ) < 0
  );
}

export async function handle(
  deps: AppDeps,
  req: {
    method: string;
    path: string;
    ip: string;
    form?: Record<string, string>;
    cookie?: string;
    query?: Record<string, string>;
    authorization?: string;
    rawBody?: string;
    /** Set ONLY by the worker router after a directory claim — never by users. */
    trusted?: { signupEmail?: string; displayName?: string; timezone?: string; verifyEmail?: boolean;
      newOrg?: boolean; ssoEmail?: string };
  },
): Promise<Reply> {
  try {
    return await handleRoutes(deps, req);
  } catch (err) {
    // SPEC-0003 · fail closed: while a connected calendar cannot be consulted,
    // no path may offer or accept a time. Refusing beats double-booking.
    if (err instanceof CalendarBlindError) {
      return html(503, errorPage(503,
        'This page cannot offer times right now: a connected calendar cannot be reached. Try again shortly.'));
    }
    throw err;
  }
}

async function handleRoutes(
  deps: AppDeps,
  req: {
    method: string;
    path: string;
    ip: string;
    form?: Record<string, string>;
    cookie?: string;
    query?: Record<string, string>;
    authorization?: string;
    rawBody?: string;
    /** Set ONLY by the worker router after a directory claim — never by users. */
    trusted?: { signupEmail?: string; displayName?: string; timezone?: string; verifyEmail?: boolean;
      newOrg?: boolean; ssoEmail?: string };
  },
): Promise<Reply> {
  const { sql, config, mail } = deps;
  const now = deps.now();
  const parts = req.path.split('/').filter(Boolean);
  const secure = config.baseUrl.startsWith('https://');
  const sessionId = readCookie(req.cookie, 'pumasi_session');

  // O3 · health means the process is up; readiness means it can actually serve.
  if (req.path === '/healthz') return json(200, { status: 'ok', version: VERSION, commit: config.commit });
  // PR-1 · the version, findable without reading source and without a database.
  // `commit` travels with it because the two answer different questions: the
  // version says which release this is, the commit says which build of it —
  // and `commit` is 'unknown' until a deploy sets GIT_COMMIT (Q-012).
  if (req.path === '/version') return json(200, { version: VERSION, commit: config.commit });
  if (req.path === '/readyz') {
    if (!deps.ready()) return json(503, { status: 'not_ready', reason: 'migrations incomplete' });
    try {
      await sql.query('SELECT 1');
    } catch {
      return json(503, { status: 'not_ready', reason: 'database unreachable' });
    }
    // O4 · report the versions actually in use.
    return json(200, {
      status: 'ready',
      version: VERSION,
      commit: config.commit,
      tzdata: (process.versions as { tz?: string }).tz ?? 'unknown',
    });
  }

  // Issue #3 · favicon
  if (req.method === 'GET' && (req.path === '/favicon.ico' || req.path === '/favicon.svg')) {
    return {
      status: 200,
      headers: {
        'content-type': 'image/svg+xml',
        'cache-control': 'public, max-age=86400',
      },
      body: FAVICON_SVG,
    };
  }

  // ── the public API, v1 (P7) ──────────────────────────────────────────────
  // Bearer key auth; form-encoded writes; JSON out. The API calls the same
  // paths the pages do, so F1/B3 hold identically.
  if (parts[0] === 'api' && parts[1] === 'v1') {
    const raw = (req.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!raw) return json(401, { error: 'missing bearer token' });
    const digest = await sha256Hex(raw);
    const keyRow = await sql.query(
      `SELECT owner_id FROM api_keys WHERE key_hash = $1`, [digest]);
    if (!keyRow.rows[0]) return json(401, { error: 'invalid token' });
    const apiOwner = String(keyRow.rows[0]['owner_id']);

    if (req.method === 'GET' && parts[2] === 'event-types') {
      const { rows } = await sql.query(
        `SELECT schedule_id, slug, title, duration_minutes, scheduling_kind
           FROM schedules WHERE owner_id = $1 ORDER BY slug`, [apiOwner]);
      return json(200, { event_types: rows });
    }

    if (req.method === 'GET' && parts[2] === 'slots') {
      const slug = (req.query?.['event_type'] ?? '').trim();
      const schedule = await findScheduleBySlug(sql, slug);
      if (!schedule || schedule.owner_id !== apiOwner) {
        return json(404, { error: 'no such event type' });
      }
      const r = await slotsFor(deps, schedule, now);
      return json(200, { slots: r.slots });
    }

    if (req.method === 'GET' && parts[2] === 'bookings') {
      const { rows } = await sql.query(
        `SELECT b.booking_id, b.starts_at, b.ends_at, b.status, b.booker_name, b.booker_email,
                s.slug AS event_type
           FROM bookings b LEFT JOIN schedules s ON s.schedule_id = b.schedule_id
          WHERE b.owner_id = $1 AND b.starts_at > $2 AND b.status = 'confirmed'
          ORDER BY b.starts_at LIMIT 100`,
        [apiOwner, now]);
      return json(200, { bookings: rows });
    }

    if (req.method === 'POST' && parts[2] === 'bookings' && !parts[3]) {
      const f = req.form ?? {};
      const schedule = await findScheduleBySlug(sql, (f['event_type'] ?? '').trim());
      if (!schedule || schedule.owner_id !== apiOwner) {
        return json(404, { error: 'no such event type' });
      }
      const reply = await bookHandler(deps, schedule, req, now);
      if (reply.status !== 200 || !reply.body.includes('confirmed')) {
        return json(reply.status === 200 ? 409 : reply.status,
          { error: 'not booked', status: reply.status });
      }
      const made = await sql.query(
        `SELECT booking_id, starts_at, ends_at FROM bookings
          WHERE owner_id = $1 AND status = 'confirmed' AND starts_at = $2
          ORDER BY id DESC LIMIT 1`,
        [apiOwner, f['start'] ?? '']);
      return json(201, { booking: made.rows[0] ?? null });
    }

    if (req.method === 'POST' && parts[2] === 'bookings' && parts[3] && parts[4] === 'cancel') {
      const found = await sql.query(
        `SELECT booking_id, starts_at, status, group_id FROM bookings
          WHERE booking_id = $1 AND owner_id = $2 ORDER BY id DESC LIMIT 1`,
        [parts[3], apiOwner]);
      const b = found.rows[0];
      if (!b) return json(404, { error: 'no such booking' });
      if (String(b['status']) === 'confirmed') {
        const store = new PostgresBookingStore(sql, apiOwner, deps.tx);
        const actx = await automationCtx(sql, String(b['booking_id']));
        if (actx) {
          await fireTrigger(sql, 'booking_cancelled', actx, actx.ownerEmail, actx.ownerTz, now);
          await cancelPendingJobs(sql, String(b['booking_id']), now);
          await deps.pump?.();
        }
        const gid = b['group_id'] === null ? undefined : String(b['group_id']);
        const ids = gid
          ? await store.cancelGroup(gid, `api-cancel:${gid}`)
          : (await store.cancel(String(b['booking_id']), `api-cancel:${String(b['booking_id'])}`),
             [String(b['booking_id'])]);
        for (const id of ids) await deps.calendars?.onCancelled(sql, id);
        const booker = await bookerFor(sql, String(b['booking_id']));
        if (booker?.email) {
          await mail.send({ kind: 'cancelled', to: booker.email,
            bookingId: String(b['booking_id']),
            start: new Date(String(b['starts_at'])).toISOString().replace('.000Z', 'Z'),
            timezone: booker.timezone });
        }
      }
      return json(200, { cancelled: true });
    }

    return json(404, { error: 'no such endpoint' });
  }

  // ── SCIM v2 (P8): the org's IdP provisions and deprovisions members ──────
  if (parts[0] === 'scim' && parts[1] === 'v2') {
    const scimJson = (status: number, body: unknown): Reply => ({
      status,
      headers: { 'content-type': 'application/scim+json; charset=utf-8', 'cache-control': 'no-store' },
      body: JSON.stringify(body),
    });
    const raw = (req.authorization ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!raw) return scimJson(401, { detail: 'missing bearer token' });
    const orgQ = await sql.query(
      `SELECT org_id FROM org_sso WHERE scim_token_hash = $1`, [await sha256Hex(raw)]);
    if (!orgQ.rows[0]) return scimJson(401, { detail: 'invalid token' });
    const scimOrg = String(orgQ.rows[0]['org_id']);
    const userShape = (id: string, email: string, name: string) => ({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
      id, userName: email, displayName: name, active: true,
    });

    if (req.method === 'GET' && parts[2] === 'Users' && !parts[3]) {
      const { rows } = await sql.query(
        `SELECT o.owner_id, o.email, o.display_name FROM org_members m
           JOIN owners o ON o.owner_id = m.owner_id WHERE m.org_id = $1`, [scimOrg]);
      return scimJson(200, {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
        totalResults: rows.length,
        Resources: rows.map((r) =>
          userShape(String(r['owner_id']), String(r['email']), String(r['display_name']))),
      });
    }

    if (req.method === 'POST' && parts[2] === 'Users') {
      let body: { userName?: string; displayName?: string; name?: { formatted?: string } };
      try {
        body = JSON.parse(req.rawBody ?? '{}');
      } catch {
        return scimJson(400, { detail: 'invalid JSON' });
      }
      const email = (body.userName ?? '').trim();
      if (!email.includes('@')) return scimJson(400, { detail: 'userName must be an email' });
      const display = body.displayName ?? body.name?.formatted ?? email.split('@')[0]!;
      const existing = await sql.query(
        `SELECT owner_id FROM owners WHERE lower(email) = lower($1)`, [email]);
      let memberId = existing.rows[0] ? String(existing.rows[0]['owner_id']) : undefined;
      if (!memberId) {
        if (deps.directory) {
          const claim = await deps.directory.claimEmail(email);
          if (claim !== 'ok') return scimJson(409, { detail: claim });
        }
        const made = await createOwnerDirect(sql, deps.tx,
          { email, displayName: display, timezone: 'UTC' },
          deps.directory ? Number.MAX_SAFE_INTEGER : config.maxOwnerAccounts);
        if (!made.ok) return scimJson(409, { detail: made.reason });
        memberId = made.owner.owner_id;
        await registerOwnerLink(deps, sql, memberId);
        await sql.query(`UPDATE owners SET provisioned_by = $2 WHERE owner_id = $1`,
          [memberId, `scim:${scimOrg}`]);
      }
      await sql.query(
        `INSERT INTO org_members (org_id, owner_id, role) VALUES ($1, $2, 'member')
         ON CONFLICT (org_id, owner_id) DO NOTHING`, [scimOrg, memberId]);
      await audit(sql, { ownerId: memberId, orgId: scimOrg, actor: 'scim',
        action: 'member_provisioned', detail: email });
      return scimJson(201, userShape(memberId, email, display));
    }

    if ((req.method === 'DELETE' || req.method === 'PATCH') && parts[2] === 'Users' && parts[3]) {
      // PATCH is honoured only as deactivation; anything else is a no-op 200.
      if (req.method === 'PATCH' && !(req.rawBody ?? '').includes('"active":false')) {
        const who = await sql.query(
          `SELECT email, display_name FROM owners WHERE owner_id = $1`, [parts[3]]);
        return who.rows[0]
          ? scimJson(200, userShape(parts[3], String(who.rows[0]['email']),
              String(who.rows[0]['display_name'])))
          : scimJson(404, { detail: 'not found' });
      }
      const member = await sql.query(
        `SELECT m.owner_id, o.provisioned_by FROM org_members m
           JOIN owners o ON o.owner_id = m.owner_id
          WHERE m.org_id = $1 AND m.owner_id = $2`, [scimOrg, parts[3]]);
      if (!member.rows[0]) return scimJson(404, { detail: 'not found' });
      await sql.query(`DELETE FROM org_members WHERE org_id = $1 AND owner_id = $2`,
        [scimOrg, parts[3]]);
      await sql.query(`DELETE FROM sessions WHERE owner_id = $1`, [parts[3]]);
      // An account this org's IdP created, this org's IdP may remove (D3).
      if (String(member.rows[0]['provisioned_by'] ?? '') === `scim:${scimOrg}`) {
        const gone = await sql.query(
          `SELECT email, link_slug FROM owners WHERE owner_id = $1`, [parts[3]]);
        await deps.tx.transaction(async (tx) => {
          // D3 · same rule as the account path: answers go by their bookings.
          await tx.query(
            `DELETE FROM booking_answers WHERE booking_id IN
               (SELECT booking_id FROM bookings WHERE owner_id = $1)`, [parts[3]]);
          await tx.query(`DELETE FROM bookings WHERE owner_id = $1`, [parts[3]]);
          await tx.query(`DELETE FROM event_hosts WHERE owner_id = $1`, [parts[3]]);
          await tx.query(`DELETE FROM owners WHERE owner_id = $1`, [parts[3]]);
        });
        if (gone.rows[0]) {
          await deps.directory?.releaseOwner(String(gone.rows[0]['email']),
            gone.rows[0]['link_slug'] === null ? undefined : String(gone.rows[0]['link_slug']));
        }
      }
      await audit(sql, { ownerId: parts[3], orgId: scimOrg, actor: 'scim',
        action: 'member_deprovisioned' });
      return { status: 204, headers: { 'cache-control': 'no-store' }, body: '' };
    }

    return scimJson(404, { detail: 'no such endpoint' });
  }

  // ── manage a booking by bearer token (L1, L2) ────────────────────────────
  if (parts[0] === 'b' && parts[1]) {
    const token = parts[1];
    if (await overLimit(sql, `mgmt:${req.ip}`, RATE_LIMITS.management_lookups_per_ip_per_minute, 60, now)) {
      return html(429, errorPage(429, 'Too many requests. Try again shortly.'));
    }
    // L3 · a management link expires at the booking's end plus a grace period.
    // Enforced in the lookup, so no later branch can forget it, and expressed
    // as "not found" so an expired link is indistinguishable from a wrong one.
    const graceCutoff = Temporal.Instant.from(now).subtract({ hours: 24 * L3_GRACE_DAYS }).toString();
    const { rows } = await sql.query(
      `SELECT b.booking_id, b.starts_at, b.ends_at, b.status, b.schedule_id, b.owner_id,
              b.group_id, s.title
         FROM bookings b LEFT JOIN schedules s ON s.schedule_id = b.schedule_id
        WHERE b.token = $1 AND b.ends_at > $2 AND b.status = 'confirmed'
        ORDER BY (b.status='confirmed') DESC, b.id DESC LIMIT 1`,
      [token, graceCutoff],
    );
    const r = rows[0];
    // L2 · reveals nothing about any other booking, including whether one exists.
    if (!r) return html(404, errorPage(404, 'This link is not valid.'));
    // Sharding · pages and mails speak the PUBLIC (tagged) token; the database
    // speaks the raw one.
    const publicToken = tagged(deps, token);

    const bookingId = String(r['booking_id']);
    const startIso = new Date(String(r['starts_at'])).toISOString().replace('.000Z', 'Z');
    const title = String(r['title'] ?? 'Booking');

    const status = String(r['status']);
    const scheduleId = r['schedule_id'] === null ? undefined : String(r['schedule_id']);
    // P5 · a collective meeting occupies several hosts; its rows share a group.
    const groupId = r['group_id'] === null ? undefined : String(r['group_id']);

    /** L4 · other times this booking could move to. The engine decides them. */
    const moveOptions = async (): Promise<Slot[]> => {
      if (groupId) return []; // a group meeting is cancelled and rebooked, not moved
      if (status !== 'confirmed' || !scheduleId) return [];
      const s = await findScheduleById(sql, scheduleId);
      if (!s) return [];
      const computed = await slotsFor(deps, s, now);
      return computed.slots.slice(0, 24);
    };

    if (req.method === 'GET') {
      return html(200, managePage({ title, start: startIso, token: publicToken, status, slots: await moveOptions() }));
    }

    // L4 · reschedule. Atomic in the store (B6, P2a); a losing move returns
    // conflict and leaves the booking confirmed and unmoved.
    if (req.method === 'POST' && parts[2] === 'reschedule') {
      if (status !== 'confirmed') {
        return html(409, errorPage(409, 'This booking is no longer active.'));
      }
      if (groupId) {
        return html(409, errorPage(409,
          'This meeting has several hosts: cancel it and book a new time instead of moving it.'));
      }
      const newStart = req.form?.['start'];
      const newEnd = req.form?.['end'];
      if (!newStart || !newEnd) {
        return html(400, managePage({ title, start: startIso, token: publicToken, status,
          slots: await moveOptions(), error: 'Pick a time to move to.' }));
      }
      // F1 · the same rule as booking. A token holder may move the meeting, but
      // only to a time the engine offers.
      const options = await moveOptions();
      if (!offeredSlot(options, newStart, newEnd)) {
        return html(409, managePage({ title, start: startIso, token: publicToken, status,
          slots: options, error: 'That time is not available. Here are the times that are.' }));
      }
      const store = new PostgresBookingStore(sql, String(r['owner_id']), deps.tx);
      const moved = await store.move(bookingId, newStart, newEnd, `move:${token}:${newStart}`);
      if (!moved.ok) {
        return html(409, managePage({ title, start: startIso, token: publicToken, status,
          slots: await moveOptions(), error: 'Someone just took that time. Here are the rest.' }));
      }
      // SPEC-0003 · the owner's calendar follows the move (never fatal, M3).
      await deps.calendars?.onMoved(sql, bookingId, newStart, newEnd);
      // P7 · reminders re-anchor to the new time; the rescheduled trigger fires.
      await cancelPendingJobs(sql, bookingId, now);
      {
        const actx = await automationCtx(sql, bookingId);
        if (actx) {
          await fireTrigger(sql, 'booking_rescheduled', actx, actx.ownerEmail, actx.ownerTz, now);
          await deps.pump?.();
        }
      }
      // M5 · both parties learn the meeting moved.
      const owner = await ownerForBooking(sql, bookingId);
      const booker = await bookerFor(sql, bookingId);
      if (booker?.email) {
        await mail.send({ kind: 'rescheduled', to: booker.email, bookingId,
          start: newStart, token: publicToken, timezone: booker.timezone });
      }
      if (owner) {
        await mail.send({ kind: 'rescheduled', to: owner.email, bookingId,
          start: newStart, timezone: owner.timezone });
      }
      return html(200, managePage({ title, start: newStart, token: publicToken, status: 'confirmed',
        slots: await moveOptions() }));
    }
    if (req.method === 'POST' && parts[2] === 'cancel') {
      const store = new PostgresBookingStore(sql, 'unused', deps.tx);
      const existing = await store.findById(bookingId);
      // B5 · cancelling is idempotent and total; re-cancelling is `cancelled`.
      if (existing?.status === 'confirmed') {
        // P7 · automations first, while the row still answers questions.
        const actx = await automationCtx(sql, bookingId);
        if (actx) {
          await fireTrigger(sql, 'booking_cancelled', actx, actx.ownerEmail, actx.ownerTz, now);
          await cancelPendingJobs(sql, bookingId, now);
          await deps.pump?.();
        }
        // P5 · a group cancels as one: every host's row, every host's calendar,
        // every host's inbox.
        const cancelledIds = groupId
          ? await store.cancelGroup(groupId, `cancel:${token}`)
          : (await store.cancel(bookingId, `cancel:${token}`), [bookingId]);
        for (const id of cancelledIds) {
          // SPEC-0003 · the owner's calendar follows the cancellation.
          await deps.calendars?.onCancelled(sql, id);
          const ownerRow = await ownerForBooking(sql, id);
          if (ownerRow) {
            await mail.send({
              kind: 'cancelled', to: ownerRow.email, bookingId: id,
              start: startIso, timezone: ownerRow.timezone,
            });
          }
        }
      }
      return html(200, managePage({ title, start: startIso, token: publicToken, status: 'cancelled' }));
    }
    // D8 · a bearer link may cancel, but deleting personal data needs a
    // confirmation from that same link — a forwarded email must not destroy a
    // record in one click.
    if (req.method === 'POST' && parts[2] === 'delete') {
      if (req.form?.['confirm'] !== 'yes') {
        return html(400, errorPage(400, 'Deletion needs the confirmation box ticked.'));
      }
      // D7 · "deleted" must reach everything derived from this booking, or the
      // sentence below is false. The booking's identity fields, the contact
      // the booking created, and any queued mail still carrying the name and
      // address all go in one transaction. Sent mail cannot be recalled and
      // the privacy notice says so rather than implying otherwise.
      const bookerRow = await sql.query(
        `SELECT booker_email, owner_id, group_id FROM bookings WHERE booking_id = $1 ORDER BY id DESC LIMIT 1`,
        [bookingId],
      );
      const goneEmail = bookerRow.rows[0]?.['booker_email'];
      const goneOwner = bookerRow.rows[0]?.['owner_id'];
      // D3 · The management token rides the FIRST row of a series, but a
      // recurring booking is a dozen rows and each carries the booker's name,
      // address and answers. Deletion follows the group, or it reaches one
      // occurrence and quietly keeps eleven — a cross-family review (grok)
      // caught exactly that.
      const groupId = bookerRow.rows[0]?.['group_id'] ?? null;
      const groupIds = groupId
        ? (await sql.query(`SELECT booking_id FROM bookings WHERE group_id = $1`, [groupId]))
            .rows.map((r) => String(r['booking_id']))
        : [bookingId];
      await deps.tx.transaction(async (tx) => {
        for (const b of groupIds) {
          await tx.query(
            `UPDATE bookings SET status='cancelled', booker_name=NULL, booker_email=NULL, booker_tz=NULL,
                    owner_note=NULL
              WHERE booking_id = $1`,
            [b],
          );
          // Queued workflow mail and webhook payloads embed the booker's details.
          await tx.query(`DELETE FROM jobs WHERE booking_id = $1`, [b]);
          // Answers to custom questions are the most sensitive thing a booking
          // holds — free text the booker wrote. A deletion that reached the name
          // but not the answer would make the promise on this page false.
          await tx.query(`DELETE FROM booking_answers WHERE booking_id = $1`, [b]);
        }
        if (goneEmail && goneOwner) {
          await tx.query(`DELETE FROM contacts WHERE owner_id = $1 AND email = $2`,
            [goneOwner, String(goneEmail).toLowerCase()]);
        }
      });
      for (const b of groupIds) await deps.calendars?.onCancelled(sql, b);
      return html(200, errorPage(200, 'Your booking is cancelled and your details are deleted.'));
    }
    return html(405, errorPage(405, 'Method not allowed.'));
  }

  // ── in-app feedback & bug reporting ───────────────────────────────────────
  if (parts[0] === 'api' && parts[1] === 'feedback' && req.method === 'POST') {
    try {
      const payload = JSON.parse(req.rawBody ?? '{}') as FeedbackPayload;
      const result = await submitFeedback(payload, {
        githubToken: config.githubFeedbackToken,
        repo: config.githubFeedbackRepo,
      });
      return {
        status: result.ok ? 200 : 400,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(result),
      };
    } catch (err) {
      return {
        status: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: false, error: (err as Error).message }),
      };
    }
  }

  // ── owner surfaces (I1–I4) ───────────────────────────────────────────────
  // ── internal SSO landing (sharding): the worker verified the identity and
  // the directory said this org owns the email; we only start the session. ──
  if (parts[0] === 'internal' && parts[1] === 'sso-login' && req.trusted?.ssoEmail) {
    const found = await sql.query(
      `SELECT owner_id FROM owners WHERE lower(email) = lower($1)`, [req.trusted.ssoEmail]);
    if (!found.rows[0]) return html(403, errorPage(403, 'No account for that identity here.'));
    const sid = await createSession(sql, String(found.rows[0]['owner_id']), now, config.sessionTtlHours);
    return {
      status: 303,
      headers: { location: '/app', 'set-cookie': sessionCookie(sid, secure, config.sessionTtlHours) },
      body: '',
    };
  }

  if (parts[0] === 'signup') {
    // Sharding · trusted signup: the directory already spent the invite,
    // claimed the email, and enforced the global ceiling. This org's world
    // just creates its owner — founding the tenant org on first arrival.
    if (req.method === 'POST' && req.trusted?.signupEmail) {
      const input = {
        email: req.trusted.signupEmail,
        displayName: (req.trusted.displayName ?? req.trusted.signupEmail.split('@')[0]!).trim(),
        timezone: (req.trusted.timezone ?? 'UTC').trim() || 'UTC',
      };
      const made = await createOwnerDirect(sql, deps.tx, input, Number.MAX_SAFE_INTEGER);
      if (!made.ok) {
        return html(400, errorPage(400, 'That address already has an account here. Sign in instead.'));
      }
      if (req.trusted.newOrg) {
        const orgId = randomUUID();
        await sql.query(`INSERT INTO orgs (org_id, name) VALUES ($1, $2)`,
          [orgId, `${input.displayName}'s team`]);
        await sql.query(
          `INSERT INTO org_members (org_id, owner_id, role) VALUES ($1, $2, 'admin')`,
          [orgId, made.owner.owner_id]);
      } else {
        // Joining an existing tenant: membership in its founding org.
        const tenant = await sql.query(
          `SELECT org_id FROM orgs ORDER BY created_at LIMIT 1`);
        if (tenant.rows[0]) {
          await sql.query(
            `INSERT INTO org_members (org_id, owner_id, role) VALUES ($1, $2, 'member')
             ON CONFLICT (org_id, owner_id) DO NOTHING`,
            [String(tenant.rows[0]['org_id']), made.owner.owner_id]);
        }
      }
      await registerOwnerLink(deps, sql, made.owner.owner_id);

      // I7 · No invite vouched for this address and no identity provider
      // asserted it, so nothing here proves the person typing it can read that
      // mailbox. The account exists; the session does not, until they follow a
      // link only that mailbox receives. The router marked this case.
      if (req.trusted.verifyEmail) {
        const token = await issueSignInToken(sql, made.owner.owner_id, now);
        await mail.send({ kind: 'signin', to: input.email, bookingId: '', start: now,
          token: tagged(deps, token) });
        // I8 · Byte-identical to what the router returns when the address was
        // already taken. If these two ever diverge, the pair becomes an oracle.
        return html(200, loginPage(true));
      }

      const sid = await createSession(sql, made.owner.owner_id, now, config.sessionTtlHours);
      return {
        status: 303,
        headers: { location: '/app', 'set-cookie': sessionCookie(sid, secure, config.sessionTtlHours) },
        body: '',
      };
    }
    // I2 · public signup is off unless the operator enables it; until then an
    // invite is the only way in. With the flag on, the same page works without one.
    if (req.method === 'GET') {
      return html(200, signupPage(req.query?.['invite'] ?? '', undefined,
        { sso: { google: Boolean(config.googleClientId), microsoft: Boolean(config.msClientId) }, publicSignup: config.publicSignup }));
    }
    const f = req.form ?? {};
    const inviteCode = (f['invite'] ?? '').trim();
    const input = {
      email: (f['email'] ?? '').trim(),
      displayName: (f['display_name'] ?? '').trim(),
      timezone: (f['timezone'] ?? 'UTC').trim(),
    };
    if (!inviteCode && config.publicSignup) {
      // I7 · A public signup proves nothing about the address it claims. An
      // invite used to be that proof; with public signup on, nothing is, so the
      // account is created WITHOUT a session and the session is issued only to
      // whoever can read the mailbox. Otherwise anyone could hold a live session
      // as support@somecompany.com and take real bookings under it.
      if (await overLimit(sql, `signup:${req.ip}`, RATE_LIMITS.signups_per_ip_per_hour, 3600, now)) {
        return html(429, errorPage(429, 'Too many sign-up attempts. Try again later.'));
      }
      const made = await createOwnerDirect(sql, deps.tx, input, config.maxOwnerAccounts);
      if (made.ok) {
        const token = await issueSignInToken(sql, made.owner.owner_id, now);
        await mail.send({ kind: 'signin', to: input.email, bookingId: '', start: now,
          token: tagged(deps, token) });
      } else if (made.reason === 'ceiling') {
        return html(400, signupPage('',
          'This service has reached its account limit and is not taking more.'));
      }
      // I8 · Identical answer whether or not the address was already taken —
      // the same rule /login already follows. A differing response here would
      // turn public signup into an account-enumeration oracle.
      return html(200, loginPage(true));
    }
    const result = await redeemInvite(
      sql, deps.tx,
      {
        code: inviteCode,
        email: input.email,
        displayName: input.displayName,
        timezone: input.timezone,
      },
      config.maxOwnerAccounts,
    );
    if (!result.ok) {
      const message =
        result.reason === 'ceiling'
          ? 'This service has reached its account limit and is not taking more.'
          : result.reason === 'already_registered'
            ? 'That address already has an account. Sign in instead.'
            : 'That invite is not valid or has already been used.';
      return html(400, signupPage((f['invite'] ?? '').trim(), message));
    }
    const sid = await createSession(sql, result.owner.owner_id, now, config.sessionTtlHours);
    return {
      status: 303,
      headers: { location: '/app', 'set-cookie': sessionCookie(sid, secure, config.sessionTtlHours) },
      body: '',
    };
  }

  // ── org SSO entry (P8): /login/sso/<orgId> starts the customer IdP flow ──
  if (parts[0] === 'login' && parts[1] === 'sso' && parts[2]) {
    // SPEC-0007 S3a · what this route needs is the ability to SEAL a state, not
    // a calendar. Gating it on `deps.calendars` — which exists only when Google
    // Calendar is fully configured — turned an organisation's own single
    // sign-on off wherever Google Calendar was unconfigured, on both paths: the
    // Workers router does not handle this route, it forwards it into the
    // Durable Object that runs this same handle() (worker.ts:805).
    //
    // S3b · the deployment check stays ABOVE the org_sso lookup. With no seal
    // key nothing can start whatever the lookup finds, and looking up first
    // would tell an unauthenticated caller which org ids exist on a deployment
    // that cannot serve any of them.
    // SPEC-0009 S2d · and it says what is missing: this door has no
    // deployment-level credentials of its own, so the key is all it can lack.
    const states = deps.calendars?.state ?? oauthState(config);
    if (!states) return html(404, errorPage(404, sealRefusal('SSO')));
    // Sharding · the public entry addresses the TENANT ('main' = founding org).
    let ssoOrgId = parts[2];
    if (ssoOrgId === 'main') {
      const first = await sql.query(`SELECT org_id FROM orgs ORDER BY created_at LIMIT 1`);
      if (!first.rows[0]) return html(404, errorPage(404, 'This organization has no SSO configured.'));
      ssoOrgId = String(first.rows[0]['org_id']);
    }
    const ssoQ = await sql.query(
      `SELECT issuer, client_id FROM org_sso WHERE org_id = $1`, [ssoOrgId]);
    const sso = ssoQ.rows[0];
    if (!sso) return html(404, errorPage(404, 'This organization has no SSO configured.'));
    try {
      const endpoints = await discoverOidc(String(sso['issuer']));
      const state = await states.seal({ purpose: 'oidc', org: ssoOrgId,
        tag: deps.orgTag ?? '' });
      return {
        status: 303,
        headers: {
          location: oidcAuthUrl({
            authorizationEndpoint: endpoints.authorization_endpoint,
            clientId: String(sso['client_id']),
            redirectUri: `${config.baseUrl}/oauth/oidc/callback`,
            state,
          }),
        },
        body: '',
      };
    } catch (err) {
      console.warn(`[sso] discovery failed: ${(err as Error).message}`);
      return html(502, errorPage(502, "The organization's identity provider did not answer."));
    }
  }

  if (parts[0] === 'login') {
    if (req.method === 'GET') return html(200, loginPage(undefined, undefined, { google: Boolean(config.googleClientId), microsoft: Boolean(config.msClientId) }));
    const email = (req.form?.['email'] ?? '').trim();
    // P8 · a domain claimed by an organization's SSO is steered to its IdP.
    const domain = email.slice(email.indexOf('@') + 1).toLowerCase();
    const steered = await sql.query(
      `SELECT org_id FROM org_sso WHERE email_domain = $1`, [domain]);
    if (steered.rows[0]) {
      return { status: 303,
        headers: { location: `/login/sso/${String(steered.rows[0]['org_id'])}` }, body: '' };
    }
    if (await overLimit(sql, `login:${req.ip}`, RATE_LIMITS.booking_attempts_per_ip_per_minute, 60, now)) {
      return html(429, errorPage(429, 'Too many attempts. Try again shortly.'));
    }
    const { rows } = await sql.query(`SELECT owner_id FROM owners WHERE lower(email) = lower($1)`, [email]);
    if (rows[0]) {
      const token = await issueSignInToken(sql, String(rows[0]['owner_id']), now);
      await mail.send({ kind: 'signin', to: email, bookingId: '', start: now,
        token: tagged(deps, token) });
    }
    // The same answer either way: whether an address has an account is not
    // something an unauthenticated caller gets to learn.
    return html(200, loginPage(true));
  }

  // ── "Sign in with Google" (P4) — openid+email only, never calendar ───────
  if (parts[0] === 'auth' && parts[1] === 'google' && parts[2] === 'start' && req.method === 'POST') {
    // SPEC-0009 S2a · what this door needs is a sealer, a client id and a
    // secret. `deps.calendars` stood for all three and named none of them, so
    // an operator missing one was told the feature was "not configured". The
    // hub's own sealer where there is one (SPEC-0007 S1b); the sentence comes
    // from the one implementation the Workers router imports too (S1a).
    const states = deps.calendars?.state ?? oauthState(config);
    const refusal = signInRefusal(config, 'google', Boolean(states));
    if (refusal !== undefined) return html(404, errorPage(404, refusal));
    // No refusal means the id, the secret and a sealer all exist (S1b, last
    // row); the assertions below only tell the types what the helper checked.
    const state = await states!.seal({
      purpose: 'sso',
      invite: (req.form?.['invite'] ?? '').trim(),
      timezone: (req.form?.['timezone'] ?? '').trim(),
    });
    return {
      status: 303,
      headers: {
        location: googleSsoUrl({
          clientId: config.googleClientId!,
          redirectUri: `${config.baseUrl}/oauth/google/callback`,
          state,
        }),
      },
      body: '',
    };
  }

  // ── "Sign in with Microsoft" (Issue #5) — openid+email+profile only ────────
  if (parts[0] === 'auth' && parts[1] === 'microsoft' && parts[2] === 'start' && req.method === 'POST') {
    // SPEC-0007 S2a · Microsoft sign-in needs a Microsoft app and a key to seal
    // the state with. It has never needed Google Calendar, which is what
    // `deps.calendars` actually stands for — so an operator holding Microsoft
    // credentials and no Google Calendar was shown a button (app.ts ~947, on
    // `msClientId` alone) whose own answer was that it is not configured.
    //
    // S2b · this is now the guard worker.ts:614 already holds, word for word
    // and message for message. Two builds answering the same question
    // differently is L-009, and this pair had drifted for exactly that long.
    //
    // SPEC-0009 S2c · the same guard now names what is missing, and requires
    // the secret at the button — the callback (below) always did, so the only
    // thing that moves is where the refusal arrives.
    const states = deps.calendars?.state ?? oauthState(config);
    const refusal = signInRefusal(config, 'microsoft', Boolean(states));
    if (refusal !== undefined) return html(404, errorPage(404, refusal));
    const state = await states!.seal({
      purpose: 'sso_ms',
      invite: (req.form?.['invite'] ?? '').trim(),
      timezone: (req.form?.['timezone'] ?? '').trim(),
    });
    return {
      status: 303,
      headers: {
        location: microsoftSsoUrl({
          clientId: config.msClientId!,
          redirectUri: `${config.baseUrl}/oauth/microsoft/callback`,
          state,
        }),
      },
      body: '',
    };
  }

  // ── "Connect with Zoom" OAuth Start ───────────────────────────────
  if (parts[0] === 'oauth' && parts[1] === 'zoom' && parts[2] === 'authorize') {
    const owner = await ownerForSession(sql, sessionId, now);
    if (!owner) return { status: 303, headers: { location: '/login' }, body: '' };
    return startZoomConnect(deps, config, owner.owner_id);
  }

  if (parts[0] === 'auth' && parts[1]) {
    const ownerId = await consumeSignInToken(sql, parts[1], now);
    if (!ownerId) return html(400, errorPage(400, 'That sign-in link has expired or was already used.'));
    const sid = await createSession(sql, ownerId, now, config.sessionTtlHours);
    return {
      status: 303,
      headers: { location: '/app', 'set-cookie': sessionCookie(sid, secure, config.sessionTtlHours) },
      body: '',
    };
  }

  // ── OAuth callback for calendar connections (SPEC-0003) ──────────────────
  // Unauthenticated by necessity: the browser arrives from the provider. The
  // sealed state, not the session, says whose connection this is.
  if (parts[0] === 'oauth' && parts[2] === 'callback' && req.method === 'GET') {
    const hub = deps.calendars;
    // S2a · the gate is the ability to OPEN A STATE, not the presence of a
    // calendar hub. The state is what says which flow is arriving and whose it
    // is; a hub is a calendar's business and is checked below, where a
    // calendar callback actually needs one (S2d). Gating here answered
    // "Calendar integration is not configured" to an operator connecting Zoom,
    // and did it before the zoom branch ~200 lines down could be reached.
    // The hub's own sealer first where there is one: a hub may hold a key that
    // did not come from `config.tokenKey`, and a state must open under the key
    // that sealed it. With no hub, the config key is the only one there is.
    const states = hub?.state ?? oauthState(config);
    // S2b · name what is missing. TOKEN_KEY is the one thing without which no
    // state on any path can be authenticated.
    if (!states) {
      return html(404, errorPage(404,
        'This deployment cannot complete an OAuth connection: TOKEN_KEY is not configured.'));
    }
    if (req.query?.['error']) {
      return html(400, errorPage(400, 'The calendar connection was declined. Nothing was stored.'));
    }
    const state = await states.open(req.query?.['state'] ?? '');
    const code = req.query?.['code'];
    if (!state || !code) {
      return html(400, errorPage(400, 'This connection attempt is stale or invalid. Start again from your dashboard.'));
    }

    // P4 · the same callback serves sign-in; the sealed state says which.
    if (state['purpose'] === 'sso') {
      // SPEC-0009 S2g · the callback's own refusal names what is missing too.
      const refusal = signInRefusal(config, 'google', true);
      if (refusal !== undefined) return html(404, errorPage(404, refusal));
      let email: string;
      try {
        const who = await googleSsoExchange({
          clientId: config.googleClientId!,
          clientSecret: config.googleClientSecret!,
          code,
          redirectUri: `${config.baseUrl}/oauth/google/callback`,
        });
        if (!who.emailVerified) {
          return html(403, errorPage(403, 'That Google account has no verified email address.'));
        }
        email = who.email;
      } catch (err) {
        console.warn(`[sso] google exchange failed: ${(err as Error).message}`);
        return html(502, errorPage(502, 'Google did not complete the sign-in. Try again.'));
      }
      const found = await sql.query(
        `SELECT owner_id FROM owners WHERE lower(email) = lower($1)`, [email]);
      let ownerId = found.rows[0] ? String(found.rows[0]['owner_id']) : undefined;
      if (!ownerId) {
        const input = {
          email,
          displayName: email.split('@')[0]!,
          timezone: state['timezone'] || 'UTC',
        };
        const made = state['invite']
          ? await redeemInvite(sql, deps.tx, { code: state['invite'], ...input }, config.maxOwnerAccounts)
          : config.publicSignup
            ? await createOwnerDirect(sql, deps.tx, input, config.maxOwnerAccounts)
            : undefined;
        if (!made) {
          return html(403, errorPage(403,
            'No account for that address. Accounts are invite-only while this service is small.'));
        }
        if (!made.ok) {
          const message = made.reason === 'ceiling'
            ? 'This service has reached its account limit and is not taking more.'
            : made.reason === 'already_registered'
              ? 'That address already has an account. Sign in instead.'
              : 'That invite is not valid or has already been used.';
          return html(400, errorPage(400, message));
        }
        ownerId = made.owner.owner_id;
      }
      const sid = await createSession(sql, ownerId, now, config.sessionTtlHours);
      return {
        status: 303,
        headers: { location: '/app', 'set-cookie': sessionCookie(sid, secure, config.sessionTtlHours) },
        body: '',
      };
    }

    // Issue #5 · "Sign in with Microsoft"
    if (state['purpose'] === 'sso_ms' || (parts[1] === 'microsoft' && state['purpose'] === 'sso')) {
      const refusal = signInRefusal(config, 'microsoft', true);
      if (refusal !== undefined) return html(404, errorPage(404, refusal));
      let email: string;
      try {
        const who = await microsoftSsoExchange({
          clientId: config.msClientId!,
          clientSecret: config.msClientSecret!,
          code,
          redirectUri: `${config.baseUrl}/oauth/microsoft/callback`,
        });
        if (!who.emailVerified) {
          return html(403, errorPage(403, 'That Microsoft account has no verified email address.'));
        }
        email = who.email;
      } catch (err) {
        console.warn(`[sso] microsoft exchange failed: ${(err as Error).message}`);
        return html(502, errorPage(502, 'Microsoft did not complete the sign-in. Try again.'));
      }
      const found = await sql.query(
        `SELECT owner_id FROM owners WHERE lower(email) = lower($1)`, [email]);
      let ownerId = found.rows[0] ? String(found.rows[0]['owner_id']) : undefined;
      if (!ownerId) {
        const input = {
          email,
          displayName: email.split('@')[0]!,
          timezone: state['timezone'] || 'UTC',
        };
        const made = state['invite']
          ? await redeemInvite(sql, deps.tx, { code: state['invite'], ...input }, config.maxOwnerAccounts)
          : config.publicSignup
            ? await createOwnerDirect(sql, deps.tx, input, config.maxOwnerAccounts)
            : undefined;
        if (!made) {
          return html(403, errorPage(403,
            'No account for that address. Accounts are invite-only while this service is small.'));
        }
        if (!made.ok) {
          const message = made.reason === 'ceiling'
            ? 'This service has reached its account limit and is not taking more.'
            : made.reason === 'already_registered'
              ? 'That address already has an account. Sign in instead.'
              : 'That invite is not valid or has already been used.';
          return html(400, errorPage(400, message));
        }
        ownerId = made.owner.owner_id;
      }
      const sid = await createSession(sql, ownerId, now, config.sessionTtlHours);
      return {
        status: 303,
        headers: { location: '/app', 'set-cookie': sessionCookie(sid, secure, config.sessionTtlHours) },
        body: '',
      };
    }

    // P8 · a customer IdP's answer: sign the member in, provisioning them on
    // first arrival (JIT) inside the org, ceiling respected.
    if (state['purpose'] === 'oidc' && state['org']) {
      const ssoQ = await sql.query(
        `SELECT issuer, client_id, client_secret, email_domain FROM org_sso WHERE org_id = $1`,
        [state['org']]);
      const sso = ssoQ.rows[0];
      if (!sso) return html(404, errorPage(404, 'This organization has no SSO configured.'));
      let email: string;
      try {
        const endpoints = await discoverOidc(String(sso['issuer']));
        email = (await oidcExchange({
          tokenEndpoint: endpoints.token_endpoint,
          clientId: String(sso['client_id']),
          clientSecret: String(sso['client_secret']),
          code,
          redirectUri: `${config.baseUrl}/oauth/oidc/callback`,
        })).email;
      } catch (err) {
        console.warn(`[sso] oidc exchange failed: ${(err as Error).message}`);
        return html(502, errorPage(502, 'The identity provider did not complete the sign-in.'));
      }
      const claimedDomain = sso['email_domain'] === null ? undefined : String(sso['email_domain']);
      if (claimedDomain && !email.toLowerCase().endsWith(`@${claimedDomain}`)) {
        return html(403, errorPage(403, 'That identity does not belong to this organization.'));
      }
      const found = await sql.query(
        `SELECT owner_id FROM owners WHERE lower(email) = lower($1)`, [email]);
      let memberId = found.rows[0] ? String(found.rows[0]['owner_id']) : undefined;
      if (!memberId) {
        // Sharding · the directory owns emails and the global ceiling.
        if (deps.directory) {
          const claim = await deps.directory.claimEmail(email);
          if (claim === 'ceiling') {
            return html(400, errorPage(400,
              'This service has reached its account limit and is not taking more.'));
          }
          if (claim === 'taken') {
            return html(403, errorPage(403,
              'That identity already belongs to a different organization here.'));
          }
        }
        const made = await createOwnerDirect(sql, deps.tx, {
          email, displayName: email.split('@')[0]!, timezone: 'UTC',
        }, deps.directory ? Number.MAX_SAFE_INTEGER : config.maxOwnerAccounts);
        if (!made.ok) {
          return html(400, errorPage(400,
            made.reason === 'ceiling'
              ? 'This service has reached its account limit and is not taking more.'
              : 'Could not provision this identity.'));
        }
        memberId = made.owner.owner_id;
        await sql.query(`UPDATE owners SET provisioned_by = $2 WHERE owner_id = $1`,
          [memberId, `sso:${state['org']}`]);
        await registerOwnerLink(deps, sql, memberId);
      }
      await sql.query(
        `INSERT INTO org_members (org_id, owner_id, role) VALUES ($1, $2, 'member')
         ON CONFLICT (org_id, owner_id) DO NOTHING`, [state['org'], memberId]);
      await audit(sql, { ownerId: memberId, orgId: state['org'], actor: email,
        action: 'sso_login' });
      const sid = await createSession(sql, memberId, now, config.sessionTtlHours);
      return {
        status: 303,
        headers: { location: '/app', 'set-cookie': sessionCookie(sid, secure, config.sessionTtlHours) },
        body: '',
      };
    }

    // Zoom Video OAuth Connection
    if (parts[1] === 'zoom' || state['purpose'] === 'zoom_connect') {
      if (!config.zoomClientId || !config.zoomClientSecret) {
        return html(400, errorPage(400, 'Zoom credentials are not configured.'));
      }
      try {
        const zoomTokens = await zoomExchangeCode({
          clientId: config.zoomClientId,
          clientSecret: config.zoomClientSecret,
          code,
          redirectUri: `${config.baseUrl}/oauth/zoom/callback`,
        });
        const ownerId = state['owner_id'] || (await ownerForSession(sql, sessionId, now))?.owner_id;
        // Z1a · the connection is stored; `schedules` is not touched. This used
        // to stamp the owner's personal meeting URL onto every zoom event type,
        // which the public booking page then printed to strangers (§0 D-b1) and
        // which suppressed per-booking creation for exactly the owners who had
        // pressed the button (§0 D-c1).
        const video = videoConnections(config, deps.now);
        if (!ownerId) {
          console.warn('[zoom] connect completed with no owner in state or session');
          return html(400, errorPage(400, 'This connection attempt is stale or invalid. Start again from your dashboard.'));
        }
        if (!video) {
          // Z1c · no TOKEN_KEY means no sealed column to put a credential in.
          // Storing it in the clear would be worse than not connecting.
          console.warn('[zoom] connect refused: TOKEN_KEY is not configured');
          return html(500, errorPage(500,
            'This deployment cannot store a Zoom connection: TOKEN_KEY is not configured.'));
        }
        await video.save(sql, ownerId, zoomTokens);
        // Z1e · a connection with no personal room is still a connection; the
        // credential is the point. Kept as a log line, not a failure.
        if (!zoomTokens.personalMeetingUrl && !zoomTokens.pmi) {
          console.warn('[zoom] connect stored without a personal meeting URL');
        }
      } catch (err) {
        console.warn(`[zoom] OAuth connect failed: ${(err as Error).message}`);
        return html(502, errorPage(502, 'Zoom did not complete the connection. Try again.'));
      }
      return { status: 303, headers: { location: '/app/integrations' }, body: '' };
    }

    // S2d · the calendar 404 kept, moved to where it belongs: after every
    // purpose branch, immediately before the first thing that needs a hub. A
    // calendar callback on a deployment with no calendar integration answers
    // exactly what it answered before this change.
    if (!hub) return html(404, errorPage(404, 'Calendar integration is not configured.'));
    const provider = hub.provider(parts[1] ?? '');
    if (!provider) return html(404, errorPage(404, 'Calendar integration is not configured.'));
    if (!state['owner_id']) {
      return html(400, errorPage(400, 'This connection attempt is stale or invalid. Start again from your dashboard.'));
    }
    try {
      const tokens = await provider.exchangeCode(code, `${config.baseUrl}/oauth/${provider.id}/callback`);
      await hub.saveConnection(sql, state['owner_id'], provider, tokens);
    } catch (err) {
      console.warn(`[calendar] connect failed: ${(err as Error).message}`);
      return html(502, errorPage(502, 'The calendar provider did not complete the connection. Try again.'));
    }
    return { status: 303, headers: { location: '/app' }, body: '' };
  }

  if (parts[0] === 'logout' && req.method === 'POST') {
    if (sessionId) await destroySession(sql, sessionId);
    return { status: 303, headers: { location: '/login', 'set-cookie': clearedCookie(secure) }, body: '' };
  }

  if (parts[0] === 'app') {
    const owner = await ownerForSession(sql, sessionId, now);
    if (!owner) return { status: 303, headers: { location: '/login' }, body: '' };

    // D3 · deletion removes data, verified by absence rather than a flag. It
    // reaches the bookers' details too: they gave those to a person who is
    // leaving, and keeping them would be holding data with no one to hold it
    // for.
    if (req.method === 'POST' && parts[1] === 'delete') {
      if (req.form?.['confirm'] !== 'yes') {
        return html(400, errorPage(400, 'Deletion needs the confirmation box ticked.'));
      }
      const dirRow = await sql.query(
        `SELECT email, link_slug FROM owners WHERE owner_id = $1`, [owner.owner_id]);
      await deps.tx.transaction(async (tx) => {
        // D3 · answers are deleted BY THE BOOKINGS THAT OWN THEM, before the
        // booking rows go. The earlier join through event_questions silently
        // matched nothing once a question had been removed — a cross-family
        // review (grok) caught a booker's free text surviving the account.
        await tx.query(
          `DELETE FROM booking_answers WHERE booking_id IN
             (SELECT booking_id FROM bookings WHERE owner_id = $1)`, [owner.owner_id]);
        await tx.query(`DELETE FROM bookings WHERE owner_id = $1`, [owner.owner_id]);
        // D3 · calendar credentials are the most protected datum; deletion of
        // the account deletes them in the same transaction.
        await tx.query(
          `DELETE FROM connection_calendars WHERE connection_id IN
             (SELECT connection_id FROM calendar_connections WHERE owner_id = $1)`,
          [owner.owner_id],
        );
        await tx.query(`DELETE FROM calendar_connections WHERE owner_id = $1`, [owner.owner_id]);
        // Z5c · a third party's credential must not outlive the person who
        // granted it. Same transaction as the rest of the erasure.
        await tx.query(`DELETE FROM video_connections WHERE owner_id = $1`, [owner.owner_id]);
        // P3 · contacts and sharing artefacts go with the account (D3).
        await tx.query(`DELETE FROM contacts WHERE owner_id = $1`, [owner.owner_id]);
        await tx.query(`DELETE FROM contact_exclusions WHERE owner_id = $1`, [owner.owner_id]);
        await tx.query(`DELETE FROM booking_blocks WHERE owner_id = $1`, [owner.owner_id]);
        // Unredeemed intents hold a booker's name and address; they go too.
        await tx.query(`DELETE FROM booking_intents WHERE owner_id = $1`, [owner.owner_id]);
        await tx.query(
          `DELETE FROM booking_answers WHERE question_id IN
             (SELECT question_id FROM event_questions WHERE owner_id = $1)`, [owner.owner_id]);
        await tx.query(`DELETE FROM event_questions WHERE owner_id = $1`, [owner.owner_id]);
        await tx.query(`DELETE FROM org_branding WHERE owner_id = $1`, [owner.owner_id]);
        await tx.query(
          `DELETE FROM single_use_links WHERE schedule_id IN
             (SELECT schedule_id FROM schedules WHERE owner_id = $1)`, [owner.owner_id]);
        await tx.query(
          `DELETE FROM set_rules WHERE set_id IN
             (SELECT set_id FROM availability_sets WHERE owner_id = $1)`, [owner.owner_id]);
        await tx.query(
          `DELETE FROM set_overrides WHERE set_id IN
             (SELECT set_id FROM availability_sets WHERE owner_id = $1)`, [owner.owner_id]);
        await tx.query(`DELETE FROM availability_sets WHERE owner_id = $1`, [owner.owner_id]);
        // P5 · memberships and host roles go too.
        await tx.query(`DELETE FROM org_members WHERE owner_id = $1`, [owner.owner_id]);
        await tx.query(`DELETE FROM event_hosts WHERE owner_id = $1`, [owner.owner_id]);
        await tx.query(`DELETE FROM owners WHERE owner_id = $1`, [owner.owner_id]);
      });
      if (dirRow.rows[0]) {
        await deps.directory?.releaseOwner(String(dirRow.rows[0]['email']),
          dirRow.rows[0]['link_slug'] === null ? undefined : String(dirRow.rows[0]['link_slug']));
      }
      return {
        status: 303,
        headers: { location: '/login', 'set-cookie': clearedCookie(secure) },
        body: '',
      };
    }

    if (req.method === 'POST' && parts[1] === 'schedules' && !parts[2]) {
      const f = req.form ?? {};
      const slug = (f['slug'] ?? '').trim().toLowerCase();
      if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
        return html(400, errorPage(400, 'A link may use lowercase letters, digits and dashes.'));
      }
      // P2 · every event type draws from an availability set; reuse the
      // owner's first, or found a 'Working hours' set on first use.
      let setId: string;
      const existingSet = await sql.query(
        `SELECT set_id FROM availability_sets WHERE owner_id = $1 ORDER BY created_at LIMIT 1`,
        [owner.owner_id],
      );
      if (existingSet.rows[0]) {
        setId = String(existingSet.rows[0]['set_id']);
      } else {
        setId = randomUUID();
        await sql.query(
          `INSERT INTO availability_sets (set_id, owner_id, name) VALUES ($1, $2, 'Working hours')`,
          [setId, owner.owner_id],
        );
      }
      const newId = randomUUID();
      try {
        await sql.query(
          `INSERT INTO schedules (schedule_id, owner_id, slug, title, duration_minutes,
             granularity_minutes, minimum_notice_minutes, maximum_horizon_days, availability_set_id)
           VALUES ($1, $2, $3, $4, $5, $5, 60, 30, $6)`,
          [newId, owner.owner_id, slug, (f['title'] ?? 'Booking').trim(),
           Number(f['duration_minutes'] ?? 30), setId],
        );
      } catch {
        return html(409, errorPage(409, 'That link is already taken.'));
      }
      return { status: 303, headers: { location: `/app/event/${newId}` }, body: '' };
    }

    if (req.method === 'POST' && parts[1] === 'schedules' && parts[2] && parts[3] === 'availability') {
      // I4 · scoped AT THE QUERY. Owning the row is a condition of the write,
      // not something checked separately and then trusted.
      const upd = await sql.query(
        `SELECT schedule_id FROM schedules WHERE schedule_id = $1 AND owner_id = $2`,
        [parts[2], owner.owner_id],
      );
      if (!upd.rows[0]) return html(404, errorPage(404, 'No such booking page.'));

      const f = req.form ?? {};
      // P2 · the quick editor now writes to the schedule's availability SET
      // (shared across event types); the schedule-keyed table remains only for
      // rows that predate sets.
      const setRow = await sql.query(
        `SELECT availability_set_id FROM schedules WHERE schedule_id = $1`, [parts[2]]);
      const setId = setRow.rows[0]?.['availability_set_id'];
      await deps.tx.transaction(async (tx) => {
        if (setId) {
          await tx.query(`DELETE FROM set_rules WHERE set_id = $1`, [setId]);
        } else {
          await tx.query(`DELETE FROM availability_rules WHERE schedule_id = $1`, [parts[2]]);
        }
        for (const d of ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']) {
          const s = (f[`${d}_start`] ?? '').trim();
          const e = (f[`${d}_end`] ?? '').trim();
          if (!/^\d{2}:\d{2}$/.test(s) || !/^\d{2}:\d{2}$/.test(e)) continue;
          if (setId) {
            await tx.query(
              `INSERT INTO set_rules (set_id, weekday, starts_local, ends_local)
               VALUES ($1, $2, $3, $4)`, [String(setId), d, s, e]);
          } else {
            await tx.query(
              `INSERT INTO availability_rules (schedule_id, weekday, starts_local, ends_local)
               VALUES ($1, $2, $3, $4)`, [parts[2], d, s, e]);
          }
        }
      });
      return { status: 303, headers: { location: '/app' }, body: '' };
    }

    // ── workflows, webhooks, API keys (P7) ───────────────────────────────
    if (parts[1] === 'workflows') {
      if (req.method === 'POST' && parts[2] === 'delete') {
        await sql.query(`DELETE FROM workflows WHERE workflow_id = $1 AND owner_id = $2`,
          [req.form?.['id'] ?? '', owner.owner_id]);
        return { status: 303, headers: { location: '/app/workflows' }, body: '' };
      }
      if (req.method === 'POST') {
        const f = req.form ?? {};
        const trigger = ['booking_created', 'booking_cancelled', 'booking_rescheduled',
          'before_event', 'after_event'].includes(f['trigger'] ?? '')
          ? f['trigger']! : 'booking_created';
        const offset = Math.max(0, Number(f['offset_minutes'] ?? 0) || 0);
        const recipient = f['recipient'] === 'owner' ? 'owner' : 'booker';
        await sql.query(
          `INSERT INTO workflows (workflow_id, owner_id, title, trigger, offset_minutes,
             recipient, subject, body)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [randomUUID(), owner.owner_id, (f['title'] ?? 'Workflow').trim(), trigger, offset,
           recipient, (f['subject'] ?? 'About your booking').trim(),
           (f['body'] ?? '').trim() || 'Hi {{name}}, a note about {{title}} at {{start}}.']);
        return { status: 303, headers: { location: '/app/workflows' }, body: '' };
      }
      const { rows } = await sql.query(
        `SELECT workflow_id, title, trigger, offset_minutes, recipient, subject
           FROM workflows WHERE owner_id = $1 ORDER BY created_at`, [owner.owner_id]);
      return html(200, workflowsPage(rows.map((r) => ({
        workflow_id: String(r['workflow_id']), title: String(r['title']),
        trigger: String(r['trigger']), offset_minutes: Number(r['offset_minutes']),
        recipient: String(r['recipient']), subject: String(r['subject']),
      }))));
    }

    if (parts[1] === 'webhooks') {
      if (req.method === 'POST' && parts[2] === 'delete') {
        await sql.query(`DELETE FROM webhooks WHERE webhook_id = $1 AND owner_id = $2`,
          [req.form?.['id'] ?? '', owner.owner_id]);
        return { status: 303, headers: { location: '/app/webhooks' }, body: '' };
      }
      if (req.method === 'POST') {
        const f = req.form ?? {};
        const url = (f['url'] ?? '').trim();
        if (!/^https:\/\//.test(url)) {
          return html(400, errorPage(400, 'A webhook URL starts with https://.'));
        }
        await sql.query(
          `INSERT INTO webhooks (webhook_id, owner_id, url, secret, format)
           VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), owner.owner_id, url, newToken(),
           f['format'] === 'slack' ? 'slack' : 'json']);
        return { status: 303, headers: { location: '/app/webhooks' }, body: '' };
      }
      const { rows } = await sql.query(
        `SELECT webhook_id, url, secret, format FROM webhooks
          WHERE owner_id = $1 ORDER BY created_at`, [owner.owner_id]);
      return html(200, webhooksPage(rows.map((r) => ({
        webhook_id: String(r['webhook_id']), url: String(r['url']),
        secret: String(r['secret']), format: String(r['format']),
      }))));
    }

    if (parts[1] === 'api-keys') {
      if (req.method === 'POST' && parts[2] === 'delete') {
        await sql.query(`DELETE FROM api_keys WHERE key_hash = $1 AND owner_id = $2`,
          [req.form?.['hash'] ?? '', owner.owner_id]);
        return { status: 303, headers: { location: '/app/api-keys' }, body: '' };
      }
      let freshKey: string | undefined;
      if (req.method === 'POST') {
        freshKey = deps.orgTag ? `pk_${deps.orgTag}_${newToken()}` : `pk_${newToken()}`;
        await sql.query(
          `INSERT INTO api_keys (key_hash, owner_id, name) VALUES ($1, $2, $3)`,
          [await sha256Hex(freshKey), owner.owner_id,
           (req.form?.['name'] ?? 'API key').trim()]);
      }
      const { rows } = await sql.query(
        `SELECT key_hash, name, created_at FROM api_keys
          WHERE owner_id = $1 ORDER BY created_at`, [owner.owner_id]);
      return html(200, apiKeysPage(rows.map((r) => ({
        key_hash: String(r['key_hash']), name: String(r['name']),
        created_at: String(r['created_at']).slice(0, 10),
      })), config.baseUrl, freshKey));
    }

    // ── routing forms (P6) ───────────────────────────────────────────────
    if (parts[1] === 'routing') {
      if (req.method === 'POST' && !parts[2]) {
        const f = req.form ?? {};
        const rSlug = (f['slug'] ?? '').trim().toLowerCase();
        if (!/^[a-z0-9-]{2,40}$/.test(rSlug)) {
          return html(400, errorPage(400, 'A link may use lowercase letters, digits and dashes.'));
        }
        if (deps.directory && !(await deps.directory.registerForm(rSlug))) {
          return html(409, errorPage(409, 'That link is already taken.'));
        }
        try {
          await sql.query(
            `INSERT INTO routing_forms (form_id, owner_id, slug, title, question)
             VALUES ($1, $2, $3, $4, $5)`,
            [randomUUID(), owner.owner_id, rSlug, (f['title'] ?? 'Routing').trim(),
             (f['question'] ?? 'What do you need?').trim()]);
        } catch {
          await deps.directory?.releaseForm(rSlug);
          return html(409, errorPage(409, 'That link is already taken.'));
        }
        return { status: 303, headers: { location: '/app/routing' }, body: '' };
      }
      if (req.method === 'POST' && parts[2] && parts[3] === 'options') {
        const owned = await sql.query(
          `SELECT form_id FROM routing_forms WHERE form_id = $1 AND owner_id = $2`,
          [parts[2], owner.owner_id]);
        if (!owned.rows[0]) return html(404, errorPage(404, 'No such form.'));
        const f = req.form ?? {};
        if (f['remove']) {
          await sql.query(`DELETE FROM routing_options WHERE option_id = $1 AND form_id = $2`,
            [f['remove'], parts[2]]);
          return { status: 303, headers: { location: '/app/routing' }, body: '' };
        }
        const kind = ['event', 'url', 'message'].includes(f['destination_kind'] ?? '')
          ? f['destination_kind']! : 'message';
        let value = (f['destination_value'] ?? '').trim();
        if (kind === 'event') {
          // The destination must be the owner's own event type (I4).
          const ev = await sql.query(
            `SELECT slug FROM schedules WHERE schedule_id = $1 AND owner_id = $2`,
            [value, owner.owner_id]);
          if (!ev.rows[0]) return html(400, errorPage(400, 'Pick one of your own booking pages.'));
        }
        if (kind === 'url' && !/^https?:\/\//.test(value)) {
          return html(400, errorPage(400, 'A URL destination starts with http(s)://.'));
        }
        const pos = await sql.query(
          `SELECT count(*)::int AS c FROM routing_options WHERE form_id = $1`, [parts[2]]);
        await sql.query(
          `INSERT INTO routing_options (option_id, form_id, position, label, destination_kind, destination_value)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [randomUUID(), parts[2], Number(pos.rows[0]?.['c'] ?? 0),
           (f['label'] ?? 'Option').trim(), kind, value]);
        return { status: 303, headers: { location: '/app/routing' }, body: '' };
      }
      if (req.method === 'POST' && parts[2] && parts[3] === 'delete') {
        const gone = await sql.query(
          `SELECT slug FROM routing_forms WHERE form_id = $1 AND owner_id = $2`,
          [parts[2], owner.owner_id]);
        await sql.query(`DELETE FROM routing_forms WHERE form_id = $1 AND owner_id = $2`,
          [parts[2], owner.owner_id]);
        if (gone.rows[0]) await deps.directory?.releaseForm(String(gone.rows[0]['slug']));
        return { status: 303, headers: { location: '/app/routing' }, body: '' };
      }
      // GET /app/routing — every form with its options, editable in place.
      const formsQ = await sql.query(
        `SELECT form_id, slug, title, question FROM routing_forms
          WHERE owner_id = $1 ORDER BY title`, [owner.owner_id]);
      const forms = [];
      for (const r of formsQ.rows) {
        const opts = await sql.query(
          `SELECT option_id, label, destination_kind, destination_value FROM routing_options
            WHERE form_id = $1 ORDER BY position`, [String(r['form_id'])]);
        forms.push({
          form_id: String(r['form_id']), slug: String(r['slug']),
          title: String(r['title']), question: String(r['question']),
          options: opts.rows.map((o) => ({
            option_id: String(o['option_id']), label: String(o['label']),
            kind: String(o['destination_kind']), value: String(o['destination_value']),
          })),
        });
      }
      const myEvents = await sql.query(
        `SELECT schedule_id, title FROM schedules WHERE owner_id = $1 ORDER BY title`,
        [owner.owner_id]);
      return html(200, routingPage(forms, myEvents.rows.map((e) => ({
        schedule_id: String(e['schedule_id']), title: String(e['title']),
      })), config.baseUrl));
    }

    // ── meeting polls (P6) ───────────────────────────────────────────────
    if (parts[1] === 'polls') {
      if (req.method === 'POST' && !parts[2]) {
        const f = req.form ?? {};
        const title = (f['title'] ?? '').trim() || 'Meeting poll';
        const dur = Number(f['duration_minutes'] ?? 30);
        const options: { start: string; end: string }[] = [];
        for (let i = 1; i <= 5; i++) {
          const raw = (f[`opt${i}`] ?? '').trim();
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) continue;
          try {
            const startInstant = Temporal.PlainDateTime.from(raw)
              .toZonedDateTime(owner.timezone).toInstant();
            options.push({
              start: startInstant.toString(),
              end: startInstant.add({ minutes: dur }).toString(),
            });
          } catch { /* an unparseable time is simply skipped */ }
        }
        if (options.length < 2) {
          return html(400, errorPage(400, 'A poll needs at least two proposed times.'));
        }
        const pollId = randomUUID();
        const pollToken = newToken();
        await deps.tx.transaction(async (tx) => {
          await tx.query(
            `INSERT INTO polls (poll_id, owner_id, token, title, duration_minutes)
             VALUES ($1, $2, $3, $4, $5)`,
            [pollId, owner.owner_id, pollToken, title, dur]);
          for (const o of options) {
            await tx.query(
              `INSERT INTO poll_options (option_id, poll_id, starts_at, ends_at)
               VALUES ($1, $2, $3, $4)`, [randomUUID(), pollId, o.start, o.end]);
          }
        });
        return { status: 303, headers: { location: `/app/polls/${pollId}` }, body: '' };
      }

      const pollFor = async (pollId: string) => {
        const p = await sql.query(
          `SELECT poll_id, token, title, duration_minutes, status FROM polls
            WHERE poll_id = $1 AND owner_id = $2`, [pollId, owner.owner_id]);
        return p.rows[0];
      };

      if (req.method === 'POST' && parts[2] && parts[3] === 'book') {
        const p = await pollFor(parts[2]);
        if (!p) return html(404, errorPage(404, 'No such poll.'));
        const optRow = await sql.query(
          `SELECT option_id, starts_at, ends_at FROM poll_options
            WHERE option_id = $1 AND poll_id = $2`, [req.form?.['option'] ?? '', parts[2]]);
        const o = optRow.rows[0];
        if (!o) return html(400, errorPage(400, 'Pick one of the proposed times.'));
        const start = new Date(String(o['starts_at'])).toISOString().replace('.000Z', 'Z');
        const end = new Date(String(o['ends_at'])).toISOString().replace('.000Z', 'Z');
        const store = new PostgresBookingStore(sql, owner.owner_id, deps.tx);
        const bookingId = randomUUID();
        const tok = newToken();
        const inserted = await store.insertConfirmed(bookingId, start, end,
          `poll:${parts[2]}`, {
            name: `Poll — ${String(p['title'])}`, email: owner.email,
            timezone: owner.timezone, token: tok,
          });
        if (!inserted.ok) {
          return html(409, errorPage(409, 'That time now conflicts with another booking. Pick a different winner.'));
        }
        await sql.query(`UPDATE polls SET status = 'booked' WHERE poll_id = $1`, [parts[2]]);
        await deps.calendars?.writeBack(sql, owner.owner_id, bookingId, {
          title: String(p['title']),
          description: `Booked from a meeting poll.`,
          start, end,
        });
        // Everyone who voted learns the chosen time — whichever way they voted.
        const voters = await sql.query(
          `SELECT DISTINCT v.voter_email FROM poll_votes v
             JOIN poll_options po ON po.option_id = v.option_id
            WHERE po.poll_id = $1`, [parts[2]]);
        for (const v of voters.rows) {
          await mail.send({ kind: 'confirmed', to: String(v['voter_email']),
            bookingId, start, timezone: 'UTC' });
        }
        await mail.send({ kind: 'confirmed', to: owner.email, bookingId, start,
          token: tagged(deps, tok), timezone: owner.timezone });
        return { status: 303, headers: { location: `/app/polls/${parts[2]}` }, body: '' };
      }

      if (req.method === 'POST' && parts[2] && parts[3] === 'delete') {
        await sql.query(`DELETE FROM polls WHERE poll_id = $1 AND owner_id = $2`,
          [parts[2], owner.owner_id]);
        return { status: 303, headers: { location: '/app/polls' }, body: '' };
      }

      if (req.method === 'GET' && parts[2]) {
        const p = await pollFor(parts[2]);
        if (!p) return html(404, errorPage(404, 'No such poll.'));
        // Aggregated in JS: string_agg/group_concat differ by dialect.
        const opts = await sql.query(
          `SELECT option_id, starts_at FROM poll_options WHERE poll_id = $1 ORDER BY starts_at`,
          [parts[2]]);
        const votes = await sql.query(
          `SELECT v.option_id, v.voter_name FROM poll_votes v
             JOIN poll_options po ON po.option_id = v.option_id
            WHERE po.poll_id = $1`, [parts[2]]);
        const byOption = new Map<string, string[]>();
        for (const v of votes.rows) {
          const k = String(v['option_id']);
          if (!byOption.has(k)) byOption.set(k, []);
          byOption.get(k)!.push(String(v['voter_name']));
        }
        return html(200, pollDetailPage({
          poll_id: String(p['poll_id']), title: String(p['title']),
          status: String(p['status']), token: tagged(deps, String(p['token'])),
        }, opts.rows.map((t) => {
          const k = String(t['option_id']);
          return {
            option_id: k,
            start: new Date(String(t['starts_at'])).toISOString().replace('.000Z', 'Z'),
            votes: (byOption.get(k) ?? []).length,
            names: (byOption.get(k) ?? []).join(', '),
          };
        }), config.baseUrl));
      }

      const list = await sql.query(
        `SELECT poll_id, title, status FROM polls WHERE owner_id = $1 ORDER BY created_at DESC`,
        [owner.owner_id]);
      return html(200, pollsPage(list.rows.map((r) => ({
        poll_id: String(r['poll_id']), title: String(r['title']), status: String(r['status']),
      })), owner.timezone));
    }

    // ── invites (P5): any owner may mint one while seats remain ──────────
    if (parts[1] === 'invites' && req.method === 'POST') {
      // Sharding · the directory owns invites and the global ceiling. 'org'
      // invites bring a teammate into THIS org; 'platform' invites found a
      // new customer org.
      if (deps.directory) {
        const kind = req.form?.['kind'] === 'platform' ? 'platform' : 'org';
        const code = await deps.directory.mintInvite(kind);
        return { status: 303,
          headers: { location: `/app/team?invite=${encodeURIComponent(code)}` }, body: '' };
      }
      const seats = await sql.query(`SELECT count(*)::int AS c FROM owners`);
      if (Number(seats.rows[0]?.['c'] ?? 0) >= config.maxOwnerAccounts) {
        return html(400, errorPage(400, 'Every seat is taken (D-105 holds the ceiling).'));
      }
      const code = `inv-${newToken().slice(0, 12)}`;
      await sql.query(`INSERT INTO invites (code) VALUES ($1)`, [code]);
      return { status: 303, headers: { location: '/app/team' }, body: '' };
    }

    // ── team (P5): organizations and members ─────────────────────────────
    if (parts[1] === 'team') {
      if (req.method === 'POST' && !parts[2]) {
        const orgName = (req.form?.['name'] ?? '').trim();
        if (!orgName) return html(400, errorPage(400, 'A team needs a name.'));
        const orgId = randomUUID();
        await deps.tx.transaction(async (tx) => {
          await tx.query(`INSERT INTO orgs (org_id, name) VALUES ($1, $2)`, [orgId, orgName]);
          await tx.query(
            `INSERT INTO org_members (org_id, owner_id, role) VALUES ($1, $2, 'admin')`,
            [orgId, owner.owner_id]);
        });
        return { status: 303, headers: { location: '/app/team' }, body: '' };
      }
      if (req.method === 'POST' && parts[2] && parts[3] === 'members') {
        // Admin-only, checked at the query (I4).
        const admin = await sql.query(
          `SELECT 1 FROM org_members WHERE org_id = $1 AND owner_id = $2 AND role = 'admin'`,
          [parts[2], owner.owner_id]);
        if (!admin.rows[0]) return html(404, errorPage(404, 'No such team.'));
        const f = req.form ?? {};
        if (f['remove']) {
          await sql.query(
            `DELETE FROM org_members WHERE org_id = $1 AND owner_id = $2 AND owner_id <> $3`,
            [parts[2], f['remove'], owner.owner_id]);
          return { status: 303, headers: { location: '/app/team' }, body: '' };
        }
        const memberEmail = (f['email'] ?? '').trim();
        const found = await sql.query(
          `SELECT owner_id FROM owners WHERE lower(email) = lower($1)`, [memberEmail]);
        if (!found.rows[0]) {
          return html(400, errorPage(400,
            'No account with that address. Members need an account here first (invite them).'));
        }
        await sql.query(
          `INSERT INTO org_members (org_id, owner_id, role) VALUES ($1, $2, 'member')
           ON CONFLICT (org_id, owner_id) DO NOTHING`,
          [parts[2], String(found.rows[0]['owner_id'])]);
        return { status: 303, headers: { location: '/app/team' }, body: '' };
      }
      // P8 · SSO + SCIM configuration, admin-only, checked at the query.
      if (req.method === 'POST' && parts[2] && parts[3] === 'sso') {
        const admin = await sql.query(
          `SELECT 1 FROM org_members WHERE org_id = $1 AND owner_id = $2 AND role = 'admin'`,
          [parts[2], owner.owner_id]);
        if (!admin.rows[0]) return html(404, errorPage(404, 'No such team.'));
        const f = req.form ?? {};
        if (f['remove']) {
          await sql.query(`DELETE FROM org_sso WHERE org_id = $1`, [parts[2]]);
          await deps.directory?.registerDomain(null);
          await audit(sql, { orgId: parts[2], actor: owner.email, action: 'sso_removed' });
          return { status: 303, headers: { location: '/app/team' }, body: '' };
        }
        const issuer = (f['issuer'] ?? '').trim().replace(/\/$/, '');
        if (!/^https:\/\//.test(issuer)) {
          return html(400, errorPage(400, 'The issuer is an https:// URL from your IdP.'));
        }
        const scimToken = deps.orgTag
          ? `scim_${deps.orgTag}_${newToken()}` : `scim_${newToken()}`;
        await sql.query(
          `INSERT INTO org_sso (org_id, issuer, client_id, client_secret, email_domain, scim_token_hash)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (org_id) DO UPDATE SET issuer = $2, client_id = $3, client_secret = $4,
             email_domain = $5, scim_token_hash = $6`,
          [parts[2], issuer, (f['client_id'] ?? '').trim(), (f['client_secret'] ?? '').trim(),
           (f['email_domain'] ?? '').trim().toLowerCase() || null, await sha256Hex(scimToken)]);
        await deps.directory?.registerDomain(
          (f['email_domain'] ?? '').trim().toLowerCase() || null);
        await audit(sql, { orgId: parts[2], actor: owner.email, action: 'sso_configured',
          detail: issuer });
        // The SCIM token is shown exactly once, on the redirect target.
        return { status: 303,
          headers: { location: `/app/team?scim=${encodeURIComponent(scimToken)}` }, body: '' };
      }

      // GET /app/team — my organizations, with members where I admin.
      const myOrgs = await sql.query(
        `SELECT o.org_id, o.name, m.role FROM orgs o
           JOIN org_members m ON m.org_id = o.org_id
          WHERE m.owner_id = $1 ORDER BY o.name`,
        [owner.owner_id]);
      const orgs = [];
      for (const r of myOrgs.rows) {
        const members = await sql.query(
          `SELECT m.owner_id, m.role, ow.display_name, ow.email FROM org_members m
             JOIN owners ow ON ow.owner_id = m.owner_id
            WHERE m.org_id = $1 ORDER BY ow.display_name`,
          [String(r['org_id'])]);
        orgs.push({
          org_id: String(r['org_id']),
          name: String(r['name']),
          my_role: String(r['role']),
          members: members.rows.map((m) => ({
            owner_id: String(m['owner_id']),
            role: String(m['role']),
            display_name: String(m['display_name']),
            email: String(m['email']),
          })),
        });
      }
      const openInvites = await sql.query(
        `SELECT code FROM invites WHERE consumed_at IS NULL ORDER BY code`);
      // P8 · attach each org's SSO state for admins.
      const ssoByOrg = new Map<string, { issuer: string; email_domain?: string }>();
      for (const o of orgs) {
        const s = await sql.query(
          `SELECT issuer, email_domain FROM org_sso WHERE org_id = $1`, [o.org_id]);
        if (s.rows[0]) {
          ssoByOrg.set(o.org_id, {
            issuer: String(s.rows[0]['issuer']),
            email_domain: s.rows[0]['email_domain'] === null ? undefined
              : String(s.rows[0]['email_domain']),
          });
        }
      }
      return html(200, teamPage(orgs, owner.owner_id,
        openInvites.rows.map((r) => String(r['code'])), config.baseUrl,
        ssoByOrg, req.query?.['scim'], req.query?.['invite']));
    }

    // ── audit (P8): what happened to this account ────────────────────────
    if (parts[1] === 'audit' && req.method === 'GET') {
      const myOrgIds = await sql.query(
        `SELECT org_id FROM org_members WHERE owner_id = $1 AND role = 'admin'`,
        [owner.owner_id]);
      const orgIds = myOrgIds.rows.map((r) => String(r['org_id']));
      const events: { actor: string; action: string; detail: string; at: string }[] = [];
      const mine = await sql.query(
        `SELECT actor, action, detail, created_at FROM audit_events
          WHERE owner_id = $1 ORDER BY id DESC LIMIT 100`, [owner.owner_id]);
      for (const r of mine.rows) {
        events.push({ actor: String(r['actor']), action: String(r['action']),
          detail: r['detail'] === null ? '' : String(r['detail']),
          at: String(r['created_at']) });
      }
      for (const orgId of orgIds) {
        const theirs = await sql.query(
          `SELECT actor, action, detail, created_at FROM audit_events
            WHERE org_id = $1 ORDER BY id DESC LIMIT 100`, [orgId]);
        for (const r of theirs.rows) {
          events.push({ actor: String(r['actor']), action: String(r['action']),
            detail: r['detail'] === null ? '' : String(r['detail']),
            at: String(r['created_at']) });
        }
      }
      events.sort((a, b) => (a.at < b.at ? 1 : -1));
      return html(200, auditPage(events.slice(0, 100)));
    }

    // ── settings (P4): profile, brand, my link ───────────────────────────
    if (parts[1] === 'settings') {
      const me = await sql.query(
        `SELECT display_name, email, timezone, link_slug, welcome_message, brand_color
           FROM owners WHERE owner_id = $1`, [owner.owner_id]);
      const row = me.rows[0]!;
      const current = {
        display_name: String(row['display_name']),
        email: String(row['email']),
        timezone: String(row['timezone']),
        link_slug: row['link_slug'] === null ? '' : String(row['link_slug']),
        welcome_message: row['welcome_message'] === null ? '' : String(row['welcome_message']),
        brand_color: row['brand_color'] === null ? '' : String(row['brand_color']),
      };
      const brandRow = await sql.query(
        `SELECT logo FROM org_branding WHERE owner_id = $1`, [owner.owner_id]);
      const currentLogo = brandRow.rows[0] ? String(brandRow.rows[0]['logo']) : undefined;
      if (req.method === 'GET') {
        return html(200, settingsPage(current, config.baseUrl, undefined, currentLogo));
      }
      if (req.method === 'POST') {
        const f = req.form ?? {};
        const name = (f['display_name'] ?? '').trim() || current.display_name;
        const tz = (f['timezone'] ?? '').trim() || current.timezone;
        try {
          Temporal.Now.zonedDateTimeISO(tz); // refuse an unknown zone loudly
        } catch {
          return html(400, settingsPage(current, config.baseUrl, 'That timezone is not recognised.', currentLogo));
        }
        const welcome = (f['welcome_message'] ?? '').trim().slice(0, 500);
        const color = (f['brand_color'] ?? '').trim();
        if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
          return html(400, settingsPage(current, config.baseUrl, 'A color looks like #1a56db.', currentLogo));
        }
        // The logo, before anything is written: a rejected image must not
        // leave the rest of the form half-saved.
        let nextLogo: string | null | undefined;
        if (f['remove_logo'] === 'on') {
          nextLogo = null;
        } else if ((f['logo'] ?? '').trim()) {
          const checked = validateLogo(f['logo']!);
          if (!checked.ok) {
            return html(400, settingsPage(current, config.baseUrl, checked.reason, currentLogo));
          }
          nextLogo = checked.dataUrl;
        }

        const newSlug = (f['link_slug'] ?? '').trim().toLowerCase();
        if (newSlug !== current.link_slug) {
          if (!/^[a-z0-9-]{2,40}$/.test(newSlug) || RESERVED_SLUGS.has(newSlug)) {
            return html(400, settingsPage(current, config.baseUrl,
              'A link uses lowercase letters, digits and dashes, and some names are reserved.', currentLogo));
          }
          const clash = await sql.query(
            `SELECT 1 FROM owners WHERE link_slug = $1 AND owner_id <> $2`,
            [newSlug, owner.owner_id]);
          if (clash.rows[0]) {
            return html(400, settingsPage(current, config.baseUrl, 'That link is already taken.', currentLogo));
          }
          // Sharding · the rename must also win the GLOBAL name.
          if (deps.directory && !(await deps.directory.registerLink(newSlug, current.link_slug))) {
            return html(400, settingsPage(current, config.baseUrl, 'That link is already taken.', currentLogo));
          }
        }
        await sql.query(
          `UPDATE owners SET display_name = $2, timezone = $3, welcome_message = $4,
                  brand_color = $5, link_slug = $6
            WHERE owner_id = $1`,
          [owner.owner_id, name, tz, welcome || null, color || null, newSlug || current.link_slug]);
        if (nextLogo === null) {
          await sql.query(`DELETE FROM org_branding WHERE owner_id = $1`, [owner.owner_id]);
        } else if (nextLogo !== undefined) {
          await sql.query(
            `INSERT INTO org_branding (owner_id, logo, updated_at) VALUES ($1, $2, $3)
             ON CONFLICT (owner_id) DO UPDATE SET logo = excluded.logo,
                                                 updated_at = excluded.updated_at`,
            [owner.owner_id, nextLogo, now]);
        }
        return { status: 303, headers: { location: '/app/settings' }, body: '' };
      }
    }

    // ── apps & video integrations (Calendly workflow) ───────────────────
    if (parts[1] === 'integrations') {
      if (req.method === 'GET' && !parts[2]) {
        const conns = deps.calendars ? await deps.calendars.listConnections(sql, owner.owner_id) : [];
        const google = conns.find((c) => c.provider === 'google');
        const ms = conns.find((c) => c.provider === 'microsoft');
        const zoomRow = await sql.query(
          `SELECT location_value FROM schedules WHERE owner_id = $1 AND location_kind = 'zoom' LIMIT 1`,
          [owner.owner_id],
        );
        const zoomLink = zoomRow.rows[0]?.['location_value'] ? String(zoomRow.rows[0]['location_value']) : undefined;
        // Z4b · connected means a stored connection (or Server-to-Server
        // credentials), never a stamped location_value. Since Z1a nothing
        // writes that column on connect, so the old derivation would now read
        // "Not Connected" for a genuinely connected owner.
        const zoomConn = await videoConnections(config, deps.now)?.find(sql, owner.owner_id);
        const zoomConnected = Boolean(zoomConn
          || (config.zoomAccountId && config.zoomClientId && config.zoomClientSecret));

        const notice = req.query?.['zoom_needed'] === '1'
          ? 'To enable 1-Click Zoom OAuth connect, provide your Zoom Client ID & Client Secret below, or set them as environment variables.'
          : req.query?.['zoom_disconnected'] === '1'
            ? 'Zoom disconnected. Your Zoom events no longer carry a meeting link until you reconnect.'
            : req.query?.['cal_disconnected'] === '1'
              ? 'Account disconnected. Bookings no longer sync to that calendar.'
              : undefined;

        return html(
          200,
          integrationsPage({
            googleConnected: Boolean(google),
            googleEmail: google?.account_email,
            googleConnectionId: google?.connection_id,
            msConnected: Boolean(ms),
            msEmail: ms?.account_email,
            msConnectionId: ms?.connection_id,
            zoomConnected,
            zoomAccount: zoomConn?.displayName ?? zoomConn?.accountEmail,
            zoomStatus: zoomConn?.status,
            zoomLink,
            zoomAccountId: config.zoomAccountId,
            baseUrl: config.baseUrl,
            notice,
          }),
        );
      }
      if (parts[2] === 'zoom') {
        if (parts[3] === 'disconnect' && req.method === 'POST') {
          // Z5a · both halves. The stored credential is what "disconnect"
          // means; clearing location_value is kept because this is the only
          // route by which a personal room stamped by the old connect flow
          // ever leaves the database (Z6c: no data migration does it).
          await videoConnections(config, deps.now)?.remove(sql, owner.owner_id);
          await sql.query(
            `UPDATE schedules SET location_value = NULL WHERE owner_id = $1 AND location_kind = 'zoom'`,
            [owner.owner_id],
          );
          return { status: 303, headers: { location: '/app/integrations?zoom_disconnected=1' }, body: '' };
        }
        if (parts[3] === 'connect' || req.query?.['connect'] === '1') {
          return startZoomConnect(deps, config, owner.owner_id);
        }
        if (req.method === 'POST') {
          const form = req.form ?? {};
          const zoomLink = (form['zoom_link'] ?? '').trim();
          const zoomClientId = (form['zoom_client_id'] ?? '').trim();
          const zoomClientSecret = (form['zoom_client_secret'] ?? '').trim();
          const zoomAccountId = (form['zoom_account_id'] ?? '').trim();
          if (zoomClientId) config.zoomClientId = zoomClientId;
          if (zoomClientSecret) config.zoomClientSecret = zoomClientSecret;
          if (zoomAccountId) config.zoomAccountId = zoomAccountId;
          if (zoomLink) {
            await sql.query(
              `UPDATE schedules SET location_value = $2 WHERE owner_id = $1 AND location_kind = 'zoom'`,
              [owner.owner_id, zoomLink],
            );
          }
          if (config.zoomClientId) {
            return startZoomConnect(deps, config, owner.owner_id);
          }
          return { status: 303, headers: { location: '/app/integrations' }, body: '' };
        }
      }
    }

    // ── meetings (P3) ────────────────────────────────────────────────────
    if (parts[1] === 'meetings') {
      if (req.method === 'GET' && !parts[2]) {
        const range = req.query?.['range'] === 'past' ? 'past' : 'upcoming';
        const q = (req.query?.['q'] ?? '').trim().toLowerCase();
        const cmp = range === 'past' ? '<=' : '>';
        const order = range === 'past' ? 'DESC' : 'ASC';
        const { rows } = await sql.query(
          `SELECT b.booking_id, b.starts_at, b.ends_at, b.status, b.booker_name, b.booker_email,
                  b.no_show, b.owner_note, s.title
             FROM bookings b LEFT JOIN schedules s ON s.schedule_id = b.schedule_id
            WHERE b.owner_id = $1 AND b.starts_at ${cmp} $2
              AND (b.status = 'confirmed' OR $3 = 'past')
            ORDER BY b.starts_at ${order} LIMIT 100`,
          [owner.owner_id, now, range],
        );
        const items = rows
          .map((r) => ({
            booking_id: String(r['booking_id']),
            start: new Date(String(r['starts_at'])).toISOString().replace('.000Z', 'Z'),
            end: new Date(String(r['ends_at'])).toISOString().replace('.000Z', 'Z'),
            status: String(r['status']),
            name: r['booker_name'] === null ? '' : String(r['booker_name']),
            email: r['booker_email'] === null ? '' : String(r['booker_email']),
            no_show: Number(r['no_show']) === 1,
            note: r['owner_note'] === null ? '' : String(r['owner_note']),
            title: String(r['title'] ?? 'Booking'),
          }))
          .filter((m) => !q || m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
        // Answers for the page's bookings, in one query rather than one each.
        // Fetched after the filter so a search does not read answers for rows
        // it is about to discard.
        const withAnswers = items.length > 0
          ? await sql.query(
              `SELECT booking_id, label, answer FROM booking_answers
                WHERE booking_id IN (${items.map((_, i) => `$${i + 1}`).join(', ')})`,
              items.map((m) => m.booking_id))
          : { rows: [] as Record<string, unknown>[] };
        const answersFor = new Map<string, { label: string; answer: string }[]>();
        for (const r of withAnswers.rows) {
          const key = String(r['booking_id']);
          const list = answersFor.get(key) ?? [];
          list.push({ label: String(r['label']), answer: String(r['answer']) });
          answersFor.set(key, list);
        }
        return html(200, meetingsPage(
          items.map((m) => ({ ...m, answers: answersFor.get(m.booking_id) ?? [] })),
          range, q, owner.timezone));
      }

      // Owner actions on one booking — scoped at the query (I4).
      if (req.method === 'POST' && parts[2] && parts[3]) {
        const found = await sql.query(
          `SELECT booking_id, starts_at, status, group_id FROM bookings
            WHERE booking_id = $1 AND owner_id = $2 ORDER BY id DESC LIMIT 1`,
          [parts[2], owner.owner_id],
        );
        const b = found.rows[0];
        if (!b) return html(404, errorPage(404, 'No such meeting.'));
        const bookingId = String(b['booking_id']);
        const startIso = new Date(String(b['starts_at'])).toISOString().replace('.000Z', 'Z');
        const groupId = b['group_id'] === null ? undefined : String(b['group_id']);

        if (parts[3] === 'cancel' && String(b['status']) === 'confirmed') {
          const store = new PostgresBookingStore(sql, owner.owner_id, deps.tx);
          // P7 · automations before the row changes state.
          const actx = await automationCtx(sql, bookingId);
          if (actx) {
            await fireTrigger(sql, 'booking_cancelled', actx, actx.ownerEmail, actx.ownerTz, now);
            await cancelPendingJobs(sql, bookingId, now);
            await deps.pump?.();
          }
          // P5 · cancelling any host's row of a collective meeting cancels the
          // whole meeting — half-cancelled groups help nobody.
          const cancelledIds = groupId
            ? await store.cancelGroup(groupId, `owner-cancel:${groupId}`)
            : (await store.cancel(bookingId, `owner-cancel:${bookingId}`), [bookingId]);
          for (const id of cancelledIds) {
            await deps.calendars?.onCancelled(sql, id);
          }
          const booker = await bookerFor(sql, bookingId);
          if (booker?.email) {
            await mail.send({ kind: 'cancelled', to: booker.email, bookingId,
              start: startIso, timezone: booker.timezone });
          }
        }
        if (parts[3] === 'noshow') {
          await sql.query(
            `UPDATE bookings SET no_show = CASE no_show WHEN 1 THEN 0 ELSE 1 END
              WHERE booking_id = $1 AND owner_id = $2`,
            [bookingId, owner.owner_id],
          );
        }
        if (parts[3] === 'note') {
          await sql.query(
            `UPDATE bookings SET owner_note = $3 WHERE booking_id = $1 AND owner_id = $2`,
            [bookingId, owner.owner_id, (req.form?.['note'] ?? '').slice(0, 2000)],
          );
        }
        const back = req.form?.['range'] === 'past' ? '?range=past' : '';
        return { status: 303, headers: { location: `/app/meetings${back}` }, body: '' };
      }
      return html(404, errorPage(404, 'Nothing here.'));
    }

    // ── analytics ────────────────────────────────────────────────────────
    //
    // Every bucket is computed in Temporal, in the owner's timezone, and never
    // in SQL. `AT TIME ZONE` is PostgreSQL-only and took production down once
    // when the same query reached SQLite in a Durable Object; the engine's own
    // rule — one representation, converted in one place — applies to reporting
    // as much as to booking.
    if (parts[1] === 'analytics' && req.method === 'GET') {
      const allowed = [30, 90, 365];
      const asked = Number(req.query?.['days'] ?? 30);
      const days = allowed.includes(asked) ? asked : 30;
      const since = Temporal.Instant.from(now)
        .subtract({ hours: 24 * days }).toString();

      const { rows } = await sql.query(
        `SELECT b.starts_at, b.ends_at, b.status, b.no_show, b.created_at, s.title
           FROM bookings b LEFT JOIN schedules s ON s.schedule_id = b.schedule_id
          WHERE b.owner_id = $1 AND b.starts_at >= $2 AND b.starts_at <= $3
          ORDER BY b.starts_at DESC LIMIT 5000`,
        [owner.owner_id, since, now],
      );

      const tz = owner.timezone;
      const byWeekday = [0, 0, 0, 0, 0, 0, 0];
      const byHour = Array.from({ length: 24 }, () => 0);
      const byEvent = new Map<string, number>();
      const leads: number[] = [];
      let booked = 0, cancelled = 0, noShows = 0, minutes = 0;

      for (const r of rows) {
        const startIso = new Date(String(r['starts_at'])).toISOString();
        if (String(r['status']) === 'cancelled') { cancelled++; continue; }
        booked++;
        if (Number(r['no_show']) === 1) noShows++;
        const start = Temporal.Instant.from(startIso);
        const end = Temporal.Instant.from(new Date(String(r['ends_at'])).toISOString());
        minutes += Math.round((end.epochMilliseconds - start.epochMilliseconds) / 60000);
        const local = start.toZonedDateTimeISO(tz);
        // dayOfWeek is 1..7 from Monday, which is the order the labels use.
        byWeekday[local.dayOfWeek - 1]! += 1;
        byHour[local.hour]! += 1;
        const title = String(r['title'] ?? 'Booking');
        byEvent.set(title, (byEvent.get(title) ?? 0) + 1);
        if (r['created_at']) {
          const made = Temporal.Instant.from(new Date(String(r['created_at'])).toISOString());
          const lead = (start.epochMilliseconds - made.epochMilliseconds) / 86_400_000;
          if (lead >= 0) leads.push(lead);
        }
      }

      // The median, not the mean: one meeting booked a year out would drag an
      // average somewhere no owner recognises.
      leads.sort((x, y) => x - y);
      const leadDays = leads.length === 0 ? null
        : Math.round(leads[Math.floor(leads.length / 2)]!);

      return html(200, analyticsPage({
        days, timezone: tz, booked, cancelled, noShows, minutes, leadDays,
        byEvent: [...byEvent.entries()]
          .map(([title, count]) => ({ title, count }))
          .sort((x, y) => y.count - x.count),
        byWeekday, byHour,
      }));
    }

    // ── contacts (P3) ────────────────────────────────────────────────────
    if (parts[1] === 'contacts') {
      if (req.method === 'POST' && parts[2] === 'exclusions') {
        const f = req.form ?? {};
        if (f['remove']) {
          await sql.query(`DELETE FROM contact_exclusions WHERE owner_id = $1 AND pattern = $2`,
            [owner.owner_id, f['remove']]);
        } else {
          const pattern = (f['pattern'] ?? '').trim().toLowerCase();
          if (pattern) {
            await sql.query(
              `INSERT INTO contact_exclusions (owner_id, pattern) VALUES ($1, $2)
               ON CONFLICT (owner_id, pattern) DO NOTHING`,
              [owner.owner_id, pattern]);
          }
        }
        return { status: 303, headers: { location: '/app/contacts' }, body: '' };
      }
      if (req.method === 'POST' && parts[2] === 'blocks') {
        const f = req.form ?? {};
        if (f['remove']) {
          await sql.query(`DELETE FROM booking_blocks WHERE owner_id = $1 AND pattern = $2`,
            [owner.owner_id, f['remove']]);
          await audit(sql, { ownerId: owner.owner_id, actor: owner.email,
            action: 'block.removed', detail: f['remove'] });
        } else {
          const pattern = (f['pattern'] ?? '').trim().toLowerCase();
          // An owner blocking their own address would lock themselves out of
          // their own test bookings and read as a bug, not a choice.
          if (pattern && pattern !== owner.email.toLowerCase()) {
            await sql.query(
              `INSERT INTO booking_blocks (owner_id, pattern, note) VALUES ($1, $2, $3)
               ON CONFLICT (owner_id, pattern) DO UPDATE SET note = excluded.note`,
              [owner.owner_id, pattern, (f['note'] ?? '').trim() || null]);
            await audit(sql, { ownerId: owner.owner_id, actor: owner.email,
              action: 'block.added', detail: pattern });
          }
        }
        return { status: 303, headers: { location: '/app/contacts' }, body: '' };
      }
      if (req.method === 'POST' && parts[2] === 'delete') {
        await sql.query(`DELETE FROM contacts WHERE owner_id = $1 AND email = $2`,
          [owner.owner_id, (req.form?.['email'] ?? '').toLowerCase()]);
        return { status: 303, headers: { location: '/app/contacts' }, body: '' };
      }
      const contacts = await sql.query(
        `SELECT email, name, times_booked, last_booked_at FROM contacts
          WHERE owner_id = $1 ORDER BY last_booked_at DESC LIMIT 200`,
        [owner.owner_id],
      );
      const exclusions = await sql.query(
        `SELECT pattern FROM contact_exclusions WHERE owner_id = $1 ORDER BY pattern`,
        [owner.owner_id],
      );
      const blocks = await sql.query(
        `SELECT pattern, note FROM booking_blocks WHERE owner_id = $1 ORDER BY pattern`,
        [owner.owner_id],
      );
      return html(200, contactsPage(
        contacts.rows.map((r) => ({
          email: String(r['email']), name: String(r['name']),
          times_booked: Number(r['times_booked']),
          last_booked_at: String(r['last_booked_at']).slice(0, 10),
        })),
        exclusions.rows.map((r) => String(r['pattern'])),
        blocks.rows.map((r) => ({
          pattern: String(r['pattern']),
          note: r['note'] === null ? '' : String(r['note']),
        })),
      ));
    }

    // ── sharing (P3): single-use links and the times snippet ─────────────
    // Per-event questions. Saved by their own form so that adding a question
    // never silently writes the rest of the settings form as a side effect.
    if (parts[1] === 'event' && parts[2] && parts[3] === 'questions' && req.method === 'POST') {
      const sched = await findScheduleById(sql, parts[2]);
      if (!sched || sched.owner_id !== owner.owner_id) {
        return html(404, errorPage(404, 'No such booking page.'));
      }
      const f = req.form ?? {};
      if (f['remove']) {
        // The question goes; answers already given do NOT, because they are
        // the record of what someone was asked and said. They carry their own
        // label, so they stay readable with the question gone, and they are
        // deleted with the booking they belong to.
        await sql.query(
          `DELETE FROM event_questions WHERE question_id = $1 AND owner_id = $2`,
          [f['remove'], owner.owner_id]);
        return { status: 303, headers: { location: `/app/event/${parts[2]}` }, body: '' };
      }
      const label = (f['label'] ?? '').trim().slice(0, 200);
      if (label) {
        const kind = ['text', 'textarea', 'select'].includes(f['kind'] ?? '')
          ? f['kind']! : 'text';
        const options = kind === 'select'
          ? (f['options'] ?? '').split('\n').map((o) => o.trim()).filter(Boolean).slice(0, 40).join('\n')
          : null;
        // A list with no choices is an unanswerable required field, so it
        // falls back to a plain line rather than shipping a dead control.
        const finalKind = kind === 'select' && !options ? 'text' : kind;
        const { rows: posRows } = await sql.query(
          `SELECT count(*)::int AS c FROM event_questions WHERE schedule_id = $1`,
          [sched.schedule_id]);
        await sql.query(
          `INSERT INTO event_questions
             (question_id, schedule_id, owner_id, position, label, kind, required, options)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [randomUUID(), sched.schedule_id, owner.owner_id,
           Number(posRows[0]?.['c'] ?? 0), label, finalKind,
           f['required'] === 'on' ? 1 : 0, options]);
        await audit(sql, { ownerId: owner.owner_id, actor: owner.email,
          action: 'question.added', detail: label });
      }
      return { status: 303, headers: { location: `/app/event/${parts[2]}` }, body: '' };
    }

    if (parts[1] === 'event' && parts[2] && parts[3] === 'single-use' && req.method === 'POST') {
      const sched = await findScheduleById(sql, parts[2]);
      if (!sched || sched.owner_id !== owner.owner_id) {
        return html(404, errorPage(404, 'No such booking page.'));
      }
      const token = newToken();
      await sql.query(
        `INSERT INTO single_use_links (token, schedule_id) VALUES ($1, $2)`,
        [token, sched.schedule_id],
      );
      return { status: 303, headers: { location: `/app/event/${sched.schedule_id}` }, body: '' };
    }
    if (parts[1] === 'event' && parts[2] && parts[3] === 'snippet' && req.method === 'GET') {
      const sched = await findScheduleById(sql, parts[2]);
      if (!sched || sched.owner_id !== owner.owner_id) {
        return html(404, errorPage(404, 'No such booking page.'));
      }
      const slots = await slotsFor(deps, sched, now);
      const link = await sql.query(`SELECT link_slug FROM owners WHERE owner_id = $1`, [owner.owner_id]);
      const url = link.rows[0]?.['link_slug']
        ? `${config.baseUrl}/${String(link.rows[0]['link_slug'])}/${sched.slug}`
        : `${config.baseUrl}/${sched.slug}`;
      return html(200, snippetPage(sched.title, url, owner.timezone, slots.slots.slice(0, 12)));
    }

    // ── availability sets (P2) ───────────────────────────────────────────
    if (parts[1] === 'availability') {
      if (req.method === 'POST' && !parts[2]) {
        const name = (req.form?.['name'] ?? '').trim() || 'Working hours';
        await sql.query(
          `INSERT INTO availability_sets (set_id, owner_id, name) VALUES ($1, $2, $3)`,
          [randomUUID(), owner.owner_id, name],
        );
        return { status: 303, headers: { location: '/app' }, body: '' };
      }
      // Ownership at the query (I4): every set operation is owner-scoped.
      const owned = parts[2]
        ? await sql.query(
            `SELECT set_id, name FROM availability_sets WHERE set_id = $1 AND owner_id = $2`,
            [parts[2], owner.owner_id],
          )
        : { rows: [] };
      if (!owned.rows[0]) return html(404, errorPage(404, 'No such availability schedule.'));
      const setId = String(owned.rows[0]['set_id']);

      if (req.method === 'GET' && !parts[3]) {
        const rules = await sql.query(
          `SELECT weekday, starts_local, ends_local FROM set_rules
            WHERE set_id = $1 ORDER BY weekday, starts_local`, [setId]);
        const overrides = await sql.query(
          `SELECT local_date, starts_local, ends_local FROM set_overrides
            WHERE set_id = $1 ORDER BY local_date`, [setId]);
        return html(200, availabilityEditor({
          set_id: setId,
          name: String(owned.rows[0]['name']),
          timezone: owner.timezone,
          rules: rules.rows.map((x) => ({
            weekday: String(x['weekday']),
            start: String(x['starts_local']),
            end: String(x['ends_local']),
          })),
          overrides: overrides.rows.map((x) => ({
            date: String(x['local_date']).slice(0, 10),
            start: x['starts_local'] === null ? undefined : String(x['starts_local']),
            end: x['ends_local'] === null ? undefined : String(x['ends_local']),
          })),
        }));
      }

      if (req.method === 'POST' && parts[3] === 'hours') {
        const f = req.form ?? {};
        await deps.tx.transaction(async (tx) => {
          await tx.query(`DELETE FROM set_rules WHERE set_id = $1`, [setId]);
          for (const d of ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']) {
            const st = (f[`${d}_start`] ?? '').trim();
            const en = (f[`${d}_end`] ?? '').trim();
            if (!/^\d{2}:\d{2}$/.test(st) || !/^\d{2}:\d{2}$/.test(en)) continue;
            await tx.query(
              `INSERT INTO set_rules (set_id, weekday, starts_local, ends_local)
               VALUES ($1, $2, $3, $4)`, [setId, d, st, en]);
          }
        });
        return { status: 303, headers: { location: `/app/availability/${setId}` }, body: '' };
      }

      if (req.method === 'POST' && parts[3] === 'overrides') {
        const f = req.form ?? {};
        if (f['remove']) {
          await sql.query(`DELETE FROM set_overrides WHERE set_id = $1 AND local_date = $2`,
            [setId, f['remove']]);
          return { status: 303, headers: { location: `/app/availability/${setId}` }, body: '' };
        }
        const date = (f['date'] ?? '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return html(400, errorPage(400, 'An override needs a date (YYYY-MM-DD).'));
        }
        const st = (f['start'] ?? '').trim();
        const en = (f['end'] ?? '').trim();
        const windowed = /^\d{2}:\d{2}$/.test(st) && /^\d{2}:\d{2}$/.test(en);
        // S11: a date present with no window means unavailable that day.
        await sql.query(`DELETE FROM set_overrides WHERE set_id = $1 AND local_date = $2`,
          [setId, date]);
        await sql.query(
          `INSERT INTO set_overrides (set_id, local_date, starts_local, ends_local)
           VALUES ($1, $2, $3, $4)`,
          [setId, date, windowed ? st : null, windowed ? en : null]);
        return { status: 303, headers: { location: `/app/availability/${setId}` }, body: '' };
      }

      // P2 · holiday import: public holidays become full-day overrides. The
      // fetch happens once, here, at the owner's request — never on a booking
      // path. Source: date.nager.at (public domain data).
      if (req.method === 'POST' && parts[3] === 'holidays') {
        const country = (req.form?.['country'] ?? '').trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(country)) {
          return html(400, errorPage(400, 'Pick a two-letter country code.'));
        }
        const year = Number(now.slice(0, 4));
        let added = 0;
        for (const y of [year, year + 1]) {
          const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/${country}`);
          if (!res.ok) return html(502, errorPage(502, 'The holiday service did not answer. Try again.'));
          const days = (await res.json()) as { date: string; global: boolean }[];
          for (const d of days) {
            if (!d.global) continue;
            if (d.date < now.slice(0, 10)) continue;
            await sql.query(`DELETE FROM set_overrides WHERE set_id = $1 AND local_date = $2`,
              [setId, d.date]);
            await sql.query(
              `INSERT INTO set_overrides (set_id, local_date, starts_local, ends_local)
               VALUES ($1, $2, NULL, NULL)`, [setId, d.date]);
            added++;
          }
        }
        return { status: 303, headers: { location: `/app/availability/${setId}?holidays=${added}` }, body: '' };
      }
      return html(404, errorPage(404, 'Nothing here.'));
    }

    // ── event type settings (P2) ─────────────────────────────────────────
    if (parts[1] === 'event' && parts[2]) {
      const sched = await findScheduleById(sql, parts[2]);
      if (!sched || sched.owner_id !== owner.owner_id) {
        return html(404, errorPage(404, 'No such booking page.'));
      }
      const sets = await sql.query(
        `SELECT set_id, name FROM availability_sets WHERE owner_id = $1 ORDER BY name`,
        [owner.owner_id],
      );
      if (req.method === 'GET') {
        const link = await sql.query(`SELECT link_slug FROM owners WHERE owner_id = $1`, [owner.owner_id]);
        const linkSlug = link.rows[0]?.['link_slug'] ? String(link.rows[0]['link_slug']) : '';
        const su = await sql.query(
          `SELECT token FROM single_use_links WHERE schedule_id = $1 AND used_at IS NULL
            ORDER BY created_at DESC LIMIT 10`,
          [sched.schedule_id],
        );
        // P5 · possible hosts: me plus everyone I share an organization with.
        const mates = await sql.query(
          `SELECT DISTINCT ow.owner_id, ow.display_name, ow.email
             FROM org_members mine
             JOIN org_members them ON them.org_id = mine.org_id
             JOIN owners ow ON ow.owner_id = them.owner_id
            WHERE mine.owner_id = $1 ORDER BY ow.display_name`,
          [owner.owner_id]);
        const choices = mates.rows.map((m) => ({
          owner_id: String(m['owner_id']),
          label: `${String(m['display_name'])} <${String(m['email'])}>`,
        }));
        if (!choices.some((c) => c.owner_id === owner.owner_id)) {
          choices.unshift({ owner_id: owner.owner_id, label: `${owner.display_name} (you)` });
        }
        const hosts = await loadHosts(sql, sched.schedule_id);
        return html(200, eventTypeEditor(sched, sets.rows.map((r) => ({
          set_id: String(r['set_id']), name: String(r['name']),
        })), linkSlug, config.baseUrl, su.rows.map((r) => tagged(deps, String(r['token']))),
          choices, hosts.map((h) => h.owner_id),
          await loadQuestions(sql, sched.schedule_id)));
      }
      if (req.method === 'POST') {
        const f = req.form ?? {};
        const num = (v: string | undefined, fallback: number, min = 0): number => {
          const x = Number(v);
          return Number.isFinite(x) && x >= min ? x : fallback;
        };
        const opt = (v: string | undefined): string | null => {
          const t = (v ?? '').trim();
          return t === '' ? null : t;
        };
        const cap = (v: string | undefined): number | null => {
          const t = (v ?? '').trim();
          if (t === '') return null;
          const x = Number(t);
          return Number.isInteger(x) && x > 0 ? x : null;
        };
        const kind = ['custom', 'phone', 'in_person', 'meet', 'teams', 'zoom', 'google_chat'].includes(f['location_kind'] ?? '')
          ? f['location_kind']! : 'custom';
        const chosenSet = sets.rows.some((r) => String(r['set_id']) === f['availability_set_id'])
          ? f['availability_set_id']! : sched.availability_set_id;
        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
        await sql.query(
          `UPDATE schedules SET title = $2, description = $3, duration_minutes = $4,
                  granularity_minutes = $5, buffer_before_minutes = $6, buffer_after_minutes = $7,
                  minimum_notice_minutes = $8, maximum_horizon_days = $9, max_bookings_per_day = $10,
                  location_kind = $11, location_value = $12, availability_set_id = $13,
                  available_from = $14, available_until = $15, color = $16,
                  max_bookings_per_week = $18, max_bookings_per_month = $19,
                  max_minutes_per_day = $20, max_minutes_per_week = $21,
                  recurrence_rule = $22, require_email_verification = $23
            WHERE schedule_id = $1 AND owner_id = $17`,
          [sched.schedule_id,
           (f['title'] ?? sched.title).trim() || sched.title,
           opt(f['description']),
           num(f['duration_minutes'], sched.duration_minutes, 1),
           num(f['granularity_minutes'], sched.granularity_minutes, 1),
           num(f['buffer_before_minutes'], sched.buffer_before_minutes),
           num(f['buffer_after_minutes'], sched.buffer_after_minutes),
           num(f['minimum_notice_minutes'], sched.minimum_notice_minutes),
           num(f['maximum_horizon_days'], sched.maximum_horizon_days, 1),
           f['max_bookings_per_day'] === '' ? null : num(f['max_bookings_per_day'], 0, 1) || null,
           kind, opt(f['location_value']), chosenSet,
           dateRe.test(f['available_from'] ?? '') ? f['available_from']! : null,
           dateRe.test(f['available_until'] ?? '') ? f['available_until']! : null,
           opt(f['color']), owner.owner_id,
           // S9b · blank means no limit; a nonsense value means no limit too,
           // because a cap nobody can explain is worse than none.
           cap(f['max_bookings_per_week']), cap(f['max_bookings_per_month']),
           cap(f['max_minutes_per_day']), cap(f['max_minutes_per_week']),
           // A rule we cannot parse is refused rather than stored: an event
           // type that promises a series it cannot expand is worse than none.
           (f['recurrence_rule'] ?? '').trim() && isValidRecurrence(f['recurrence_rule']!.trim())
             ? f['recurrence_rule']!.trim() : null,
           f['require_email_verification'] === 'on' ? 1 : 0],
        );

        // P5 · scheduling kind and hosts. A chosen host must share an org with
        // the editor (or be the editor) — checked against the database, not
        // the form.
        const kindWanted = ['solo', 'round_robin', 'collective'].includes(f['scheduling_kind'] ?? '')
          ? (f['scheduling_kind'] as 'solo' | 'round_robin' | 'collective') : sched.scheduling_kind;
        const allowed = new Set<string>([owner.owner_id]);
        const mates = await sql.query(
          `SELECT DISTINCT them.owner_id FROM org_members mine
             JOIN org_members them ON them.org_id = mine.org_id
            WHERE mine.owner_id = $1`, [owner.owner_id]);
        for (const m of mates.rows) allowed.add(String(m['owner_id']));
        const wantedHosts = Object.keys(f)
          .filter((k) => k.startsWith('host:'))
          .map((k) => k.slice(5))
          .filter((id) => allowed.has(id));
        await deps.tx.transaction(async (tx) => {
          await tx.query(`UPDATE schedules SET scheduling_kind = $2 WHERE schedule_id = $1`,
            [sched.schedule_id, kindWanted]);
          await tx.query(`DELETE FROM event_hosts WHERE schedule_id = $1`, [sched.schedule_id]);
          const list = kindWanted === 'solo' ? [] : (wantedHosts.length ? wantedHosts : [owner.owner_id]);
          for (const id of list) {
            await tx.query(
              `INSERT INTO event_hosts (schedule_id, owner_id) VALUES ($1, $2)`,
              [sched.schedule_id, id]);
          }
        });
        return { status: 303, headers: { location: `/app/event/${sched.schedule_id}` }, body: '' };
      }
    }

    // ── calendar connections (SPEC-0003) ─────────────────────────────────
    if (parts[1] === 'calendar' && req.method === 'POST' && deps.calendars) {
      const hub = deps.calendars;
      // /app/calendar/<provider>/connect  |  /app/calendar/<provider>/upgrade
      const provider = hub.provider(parts[2] ?? '');
      if (provider && (parts[3] === 'connect' || parts[3] === 'upgrade')) {
        const scopeLevel = parts[3] === 'upgrade' ? 'events' : 'freebusy';
        const state = await hub.sealState({ owner_id: owner.owner_id, level: scopeLevel,
          tag: deps.orgTag ?? '' });
        const location = provider.authUrl({
          state,
          redirectUri: `${config.baseUrl}/oauth/${provider.id}/callback`,
          scopeLevel,
          loginHint: req.form?.['account'] || undefined,
        });
        return { status: 303, headers: { location }, body: '' };
      }
      // /app/calendar/<connectionId>/delete
      if (parts[2] && parts[3] === 'delete') {
        const gone = await hub.deleteConnection(sql, owner.owner_id, parts[2]);
        if (!gone) return html(404, errorPage(404, 'No such calendar connection.'));
        const back = req.form?.['return_to'] === 'integrations'
          ? '/app/integrations?cal_disconnected=1' : '/app';
        return { status: 303, headers: { location: back }, body: '' };
      }
      // /app/calendar/<connectionId>/calendars — which are checked, which receives
      if (parts[2] && parts[3] === 'calendars') {
        const owned = await sql.query(
          `SELECT connection_id FROM calendar_connections
            WHERE connection_id = $1 AND owner_id = $2`,
          [parts[2], owner.owner_id],
        );
        if (!owned.rows[0]) return html(404, errorPage(404, 'No such calendar connection.'));
        const f = req.form ?? {};
        const { rows: cals } = await sql.query(
          `SELECT calendar_id FROM connection_calendars WHERE connection_id = $1`,
          [parts[2]],
        );
        for (const c of cals) {
          const id = String(c['calendar_id']);
          await sql.query(
            `UPDATE connection_calendars SET check_conflicts = $3, is_destination = $4
              WHERE connection_id = $1 AND calendar_id = $2`,
            [parts[2], id, f[`check:${id}`] === 'on' ? 1 : 0, f['destination'] === id ? 1 : 0],
          );
        }
        return { status: 303, headers: { location: '/app' }, body: '' };
      }
      return html(404, errorPage(404, 'Nothing here.'));
    }

    // I4 · every owner-scoped read is filtered by the session's account here,
    // not by hiding controls in the interface.
    const { rows } = await sql.query(
      `SELECT s.schedule_id, s.slug, s.title, s.duration_minutes, s.color,
              (SELECT count(*)::int FROM bookings b
                WHERE b.schedule_id = s.schedule_id AND b.status='confirmed'
                  AND b.starts_at > now()) AS upcoming
         FROM schedules s WHERE s.owner_id = $1 ORDER BY s.slug`,
      [owner.owner_id],
    );
    const summaries: ScheduleSummary[] = [];
    for (const r of rows) {
      const rules = await sql.query(
        `SELECT weekday, starts_local, ends_local FROM availability_rules
          WHERE schedule_id = $1 ORDER BY weekday`,
        [r['schedule_id']],
      );
      summaries.push({
        schedule_id: String(r['schedule_id']),
        slug: String(r['slug']),
        title: String(r['title']),
        duration_minutes: Number(r['duration_minutes']),
        upcoming: Number(r['upcoming'] ?? 0),
        color: r['color'] === null || r['color'] === undefined ? undefined : String(r['color']),
        rules: rules.rows.map((x) => ({
          weekday: String(x['weekday']),
          start: String(x['starts_local']),
          end: String(x['ends_local']),
        })),
      });
    }
    const connections = deps.calendars
      ? await deps.calendars.listConnections(sql, owner.owner_id)
      : undefined;
    const setsRows = await sql.query(
      `SELECT set_id, name FROM availability_sets WHERE owner_id = $1 ORDER BY name`,
      [owner.owner_id],
    );
    const linkRow = await sql.query(
      `SELECT link_slug FROM owners WHERE owner_id = $1`, [owner.owner_id]);
    // P4 · the getting-started checklist, until all three are true.
    const anyHours = await sql.query(
      `SELECT 1 FROM set_rules r JOIN availability_sets s ON s.set_id = r.set_id
        WHERE s.owner_id = $1 LIMIT 1`, [owner.owner_id]);
    const setup = {
      calendar: (connections?.length ?? 0) > 0,
      hours: Boolean(anyHours.rows[0]),
      event: summaries.length > 0,
    };
    return html(200, ownerHome(owner, summaries, config.baseUrl, undefined, connections,
      setsRows.rows.map((r) => ({ set_id: String(r['set_id']), name: String(r['name']) })),
      linkRow.rows[0]?.['link_slug'] ? String(linkRow.rows[0]['link_slug']) : undefined,
      setup));
  }

  // ── single-use links (P3): /s/<token> works once, then is a dead page ────
  if (parts[0] === 's' && parts[1]) {
    const link = await sql.query(
      `SELECT schedule_id, used_at FROM single_use_links WHERE token = $1`, [parts[1]]);
    const l = link.rows[0];
    if (!l || l['used_at'] !== null) {
      return html(404, errorPage(404, 'This link has been used or does not exist.'));
    }
    const schedule = await findScheduleById(sql, String(l['schedule_id']));
    if (!schedule) return html(404, errorPage(404, 'No such booking page.'));
    if (req.method === 'GET' && !parts[2]) {
      if (await overLimit(sql, `view:${req.ip}`, RATE_LIMITS.page_views_per_ip_per_minute, 60, now)) {
        return html(429, errorPage(429, 'Too many requests. Try again shortly.'));
      }
      const slots = await slotsFor(deps, schedule, now);
      return html(200, bookingPage(schedule, slots.slots, { action: `/s/${tagged(deps, parts[1])}/book`,
        questions: await loadQuestions(sql, schedule.schedule_id),
        logo: await logoFor(sql, schedule.owner_id) }));
    }
    if (req.method === 'POST' && parts[2] === 'book') {
      return bookHandler(deps, schedule, req, now, parts[1], `/s/${tagged(deps, parts[1])}/book`);
    }
    return html(404, errorPage(404, 'Nothing here.'));
  }

  // ── booking email verification: the proof, then the ordinary booking ────
  //
  // GET, because it is reached from a mail client. That is safe here in a way
  // it would not be for a destructive action: using the link twice books
  // nothing twice (the intent is consumed, and the idempotency key would catch
  // it anyway), and a link-prefetching mail client only completes a booking
  // its own user asked for.
  if (parts[0] === 'v' && parts[1] && req.method === 'GET') {
    if (await overLimit(sql, `verify:${req.ip}`, RATE_LIMITS.page_views_per_ip_per_minute, 60, now)) {
      return html(429, errorPage(429, 'Too many requests. Try again shortly.'));
    }
    const found = await sql.query(
      `SELECT schedule_id, payload, created_at, used_at FROM booking_intents WHERE token = $1`,
      [parts[1]]);
    const intent = found.rows[0];
    // One answer for expired, used and never-existed alike: distinguishing
    // them tells a guesser which tokens are real.
    const dead = () => html(404, errorPage(404,
      'This confirmation link has been used or has expired. Book the time again to get a new one.'));
    if (!intent || intent['used_at'] !== null) return dead();
    const age = Temporal.Instant.from(now).epochMilliseconds
      - Temporal.Instant.from(String(intent['created_at'])).epochMilliseconds;
    if (age > VERIFY_TTL_MINUTES * 60_000) return dead();

    const schedule = await findScheduleById(sql, String(intent['schedule_id']));
    if (!schedule) return dead();

    // Consumed BEFORE the booking runs. If the booking fails — the time went,
    // a limit was reached — the token is still spent, and the booker starts
    // over from the page. Spending it afterwards would leave a live token on
    // every failure, which is a replay window for anyone who saw the link.
    await sql.query(`UPDATE booking_intents SET used_at = $2 WHERE token = $1`, [parts[1], now]);

    const payload = JSON.parse(String(intent['payload'])) as Record<string, string>;
    return bookHandler(deps, schedule, { ip: req.ip, form: payload }, now,
      undefined, `/${schedule.slug}/book`, true);
  }

  // ── routing forms, public side (P6): the answer routes, and is gone ──────
  if (parts[0] === 'r' && parts[1]) {
    const formQ = await sql.query(
      `SELECT form_id, owner_id, title, question FROM routing_forms WHERE slug = $1`, [parts[1]]);
    const form = formQ.rows[0];
    if (!form) return html(404, errorPage(404, 'No such page.'));
    const opts = await sql.query(
      `SELECT option_id, label FROM routing_options WHERE form_id = $1 ORDER BY position`,
      [String(form['form_id'])]);
    if (req.method === 'GET') {
      return html(200, routeFormPage(String(form['title']), String(form['question']),
        `/r/${parts[1]}`,
        opts.rows.map((o) => ({ option_id: String(o['option_id']), label: String(o['label']) }))));
    }
    if (req.method === 'POST') {
      const chosen = await sql.query(
        `SELECT destination_kind, destination_value FROM routing_options
          WHERE option_id = $1 AND form_id = $2`,
        [req.form?.['answer'] ?? '', String(form['form_id'])]);
      const dest = chosen.rows[0];
      if (!dest) return html(400, errorPage(400, 'Pick one of the options.'));
      const kind = String(dest['destination_kind']);
      const value = String(dest['destination_value']);
      if (kind === 'url') return { status: 303, headers: { location: value }, body: '' };
      if (kind === 'event') {
        const ev = await sql.query(
          `SELECT sc.slug, o.link_slug FROM schedules sc JOIN owners o ON o.owner_id = sc.owner_id
            WHERE sc.schedule_id = $1`, [value]);
        const e = ev.rows[0];
        if (!e) return html(404, errorPage(404, 'That destination no longer exists.'));
        const path = e['link_slug'] ? `/${String(e['link_slug'])}/${String(e['slug'])}` : `/${String(e['slug'])}`;
        return { status: 303, headers: { location: path }, body: '' };
      }
      return html(200, messagePage(String(form['title']), value));
    }
    return html(404, errorPage(404, 'Nothing here.'));
  }

  // ── meeting polls, public side (P6) ──────────────────────────────────────
  if (parts[0] === 'p' && parts[1]) {
    const pollQ = await sql.query(
      `SELECT poll_id, title, status FROM polls WHERE token = $1`, [parts[1]]);
    const poll = pollQ.rows[0];
    if (!poll) return html(404, errorPage(404, 'No such poll.'));
    const pollId = String(poll['poll_id']);
    const opts = await sql.query(
      `SELECT option_id, starts_at, ends_at FROM poll_options WHERE poll_id = $1 ORDER BY starts_at`,
      [pollId]);
    const optionViews = opts.rows.map((o) => ({
      option_id: String(o['option_id']),
      start: new Date(String(o['starts_at'])).toISOString().replace('.000Z', 'Z'),
      end: new Date(String(o['ends_at'])).toISOString().replace('.000Z', 'Z'),
    }));
    if (req.method === 'GET') {
      return html(200, pollVotePage(String(poll['title']), `/p/${tagged(deps, parts[1])}`,
        optionViews, String(poll['status'])));
    }
    if (req.method === 'POST' && String(poll['status']) === 'open') {
      if (await overLimit(sql, `vote:${req.ip}`, RATE_LIMITS.booking_attempts_per_ip_per_minute, 60, now)) {
        return html(429, errorPage(429, 'Too many attempts. Try again shortly.'));
      }
      const vName = (req.form?.['name'] ?? '').trim();
      const vEmail = (req.form?.['email'] ?? '').trim().toLowerCase();
      if (!vName || !vEmail.includes('@')) {
        return html(400, pollVotePage(String(poll['title']), `/p/${tagged(deps, parts[1])}`,
          optionViews, 'open', 'Give a name and email so the organiser knows who answered.'));
      }
      // Re-voting replaces the previous answer wholesale.
      await deps.tx.transaction(async (tx) => {
        await tx.query(
          `DELETE FROM poll_votes WHERE voter_email = $1 AND option_id IN
             (SELECT option_id FROM poll_options WHERE poll_id = $2)`, [vEmail, pollId]);
        for (const o of optionViews) {
          if (req.form?.[`vote:${o.option_id}`] === 'on') {
            await tx.query(
              `INSERT INTO poll_votes (option_id, voter_email, voter_name) VALUES ($1, $2, $3)`,
              [o.option_id, vEmail, vName]);
          }
        }
      });
      return html(200, messagePage(String(poll['title']),
        'Your answer is recorded. The organiser will confirm the chosen time by email.'));
    }
    return html(409, errorPage(409, 'This poll is closed.'));
  }

  // ── the embed loader (P3): one script, one iframe ────────────────────────
  if (req.path === '/embed.js' && req.method === 'GET') {
    const js = `(function(){var s=document.currentScript;var p=s.getAttribute('data-pumasi');if(!p)return;
var f=document.createElement('iframe');f.src=${JSON.stringify(config.baseUrl)}+p;
f.style.cssText='width:100%;height:'+(s.getAttribute('data-height')||'720')+'px;border:0;border-radius:8px';
f.loading='lazy';f.title='Book a time';s.parentNode.insertBefore(f,s);})();`;
    return {
      status: 200,
      headers: { 'content-type': 'application/javascript; charset=utf-8',
                 'cache-control': 'public, max-age=3600' },
      body: js,
    };
  }

  // ── D-105 · the published privacy pack, on every host ────────────────────
  if (req.method === 'GET') {
    const doc = LEGAL_DOCS.find((d) => d.slug === parts[0] && parts.length === 1);
    if (doc) return html(200, legalPage(doc));
  }

  // ── the public surfaces (P2) ─────────────────────────────────────────────
  // /<owner>            the owner's landing page, listing their event types
  // /<owner>/<event>    a booking page (the parity route)
  // /<event>            legacy: a bare event slug still resolves
  const slug = parts[0];
  if (!slug) return html(200, homePage(config.publicSignup));

  if (await overLimit(sql, `view:${req.ip}`, RATE_LIMITS.page_views_per_ip_per_minute, 60, now)) {
    return html(429, errorPage(429, 'Too many requests. Try again shortly.'));
  }

  // Two segments: /<owner>/<event> — page or its book action.
  if (parts.length >= 2 && parts[1] !== 'book') {
    const schedule = await findScheduleByOwnerSlug(sql, slug, parts[1]!);
    if (!schedule) return html(404, errorPage(404, 'No such booking page.'));
    const bookAction = `/${slug}/${parts[1]}/book`;
    if (req.method === 'GET' && parts.length === 2) {
      const slots = await slotsFor(deps, schedule, now);
      return html(200, bookingPage(schedule, slots.slots, { action: bookAction,
        questions: await loadQuestions(sql, schedule.schedule_id),
        logo: await logoFor(sql, schedule.owner_id),
        recurrence: schedule.recurrence_rule ? describeRecurrence(schedule.recurrence_rule) : undefined }));
    }
    if (req.method === 'POST' && parts[2] === 'book') {
      return bookHandler(deps, schedule, req, now, undefined, bookAction);
    }
    return html(404, errorPage(404, 'Nothing here.'));
  }

  // One segment: an owner landing page, or a legacy event slug.
  if (parts.length === 1 && req.method === 'GET') {
    const ownerRow = await sql.query(
      `SELECT owner_id, display_name, link_slug, welcome_message, brand_color
         FROM owners WHERE link_slug = $1`,
      [slug],
    );
    if (ownerRow.rows[0]) {
      const events = await sql.query(
        `SELECT slug, title, duration_minutes, description, color FROM schedules
          WHERE owner_id = $1 ORDER BY title`,
        [String(ownerRow.rows[0]['owner_id'])],
      );
      const opt = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
      return html(200, ownerLanding(
        String(ownerRow.rows[0]['display_name']),
        String(ownerRow.rows[0]['link_slug']),
        events.rows.map((r) => ({
          slug: String(r['slug']),
          title: String(r['title']),
          duration_minutes: Number(r['duration_minutes']),
          description: r['description'] === null ? undefined : String(r['description']),
          color: r['color'] === null ? undefined : String(r['color']),
        })),
        opt(ownerRow.rows[0]['welcome_message']),
        opt(ownerRow.rows[0]['brand_color']),
        await logoFor(sql, String(ownerRow.rows[0]['owner_id'])),
      ));
    }
    const schedule = await findScheduleBySlug(sql, slug);
    if (!schedule) return html(404, errorPage(404, 'No such booking page.'));
    const slots = await slotsFor(deps, schedule, now);
    return html(200, bookingPage(schedule, slots.slots, {
      questions: await loadQuestions(sql, schedule.schedule_id),
      logo: await logoFor(sql, schedule.owner_id),
      recurrence: schedule.recurrence_rule ? describeRecurrence(schedule.recurrence_rule) : undefined }));
  }

  if (req.method === 'POST' && parts[1] === 'book') {
    const schedule = await findScheduleBySlug(sql, slug);
    if (!schedule) return html(404, errorPage(404, 'No such booking page.'));
    return bookHandler(deps, schedule, req, now);
  }

  return html(404, errorPage(404, 'Nothing here.'));
}

interface Contact {
  email: string;
  timezone: string;
}

/**
 * Is this address blocked from booking `ownerId`?
 *
 * Matches the full address or its bare domain, both lowercased. Kept beside
 * the other booking-path helpers rather than inside the handler so the same
 * rule is available to any future path that creates a booking — a block that
 * only one entry point honours is not a block.
 */
async function blockedSource(sql: SqlClient, ownerId: string, email: string): Promise<boolean> {
  const address = email.trim().toLowerCase();
  const at = address.indexOf('@');
  if (at < 0) return false;
  const domain = address.slice(at + 1);
  const { rows } = await sql.query(
    `SELECT 1 FROM booking_blocks WHERE owner_id = $1 AND (pattern = $2 OR pattern = $3)`,
    [ownerId, address, domain],
  );
  return rows.length > 0;
}

/** An owner's logo, as a data URL, or undefined when they have not set one. */
async function logoFor(sql: SqlClient, ownerId: string): Promise<string | undefined> {
  const { rows } = await sql.query(
    `SELECT logo FROM org_branding WHERE owner_id = $1`, [ownerId]);
  return rows[0] ? String(rows[0]['logo']) : undefined;
}

async function ownerContact(sql: SqlClient, ownerId: string): Promise<Contact | undefined> {
  const { rows } = await sql.query(`SELECT email, timezone FROM owners WHERE owner_id = $1`, [ownerId]);
  const r = rows[0];
  return r ? { email: String(r['email']), timezone: String(r['timezone']) } : undefined;
}

/** L3 · how long a management link outlives the meeting it manages. */
export const L3_GRACE_DAYS = 7;

/**
 * F1 · The interval must be one the ENGINE offered.
 *
 * Without this the service accepts whatever interval a form posts: a night, a
 * week, the wrong duration, a time outside every availability rule. The
 * database only forbids OVERLAP, so an attacker could park a booking anywhere
 * and lock a real calendar, and nothing in the booking path would object.
 *
 * SPEC-0002 §1 says every question of the form "may this booking be made" is
 * answered by calling the engine. This is that call. Its absence was the
 * largest defect found in the pre-handover review — the service was trusting a
 * hidden form field.
 */
function offeredSlot(slots: Slot[], start: string, end: string): boolean {
  return slots.some((s) => s.start === start && s.end === end);
}

async function bookerFor(sql: SqlClient, bookingId: string): Promise<Contact | undefined> {
  const { rows } = await sql.query(
    `SELECT booker_email AS email, coalesce(booker_tz, 'UTC') AS timezone
       FROM bookings WHERE booking_id = $1 AND booker_email IS NOT NULL
      ORDER BY id DESC LIMIT 1`,
    [bookingId],
  );
  const r = rows[0];
  return r ? { email: String(r['email']), timezone: String(r['timezone']) } : undefined;
}

/** P7 · everything an automation needs to speak about one booking. */
async function automationCtx(
  sql: SqlClient,
  bookingId: string,
): Promise<(BookingCtx & { ownerEmail: string; ownerTz: string }) | undefined> {
  const { rows } = await sql.query(
    `SELECT b.booking_id, b.starts_at, b.ends_at, b.booker_name, b.booker_email, b.booker_tz,
            s.title, s.owner_id AS event_owner, b.owner_id AS row_owner
       FROM bookings b LEFT JOIN schedules s ON s.schedule_id = b.schedule_id
      WHERE b.booking_id = $1 ORDER BY b.id DESC LIMIT 1`,
    [bookingId],
  );
  const r = rows[0];
  if (!r) return undefined;
  const ownerId = r['event_owner'] === null ? String(r['row_owner']) : String(r['event_owner']);
  const who = await ownerContact(sql, ownerId);
  if (!who) return undefined;
  return {
    bookingId,
    ownerId,
    title: String(r['title'] ?? 'Booking'),
    start: new Date(String(r['starts_at'])).toISOString().replace('.000Z', 'Z'),
    end: new Date(String(r['ends_at'])).toISOString().replace('.000Z', 'Z'),
    bookerName: r['booker_name'] === null ? '' : String(r['booker_name']),
    bookerEmail: r['booker_email'] === null ? '' : String(r['booker_email']),
    bookerTz: r['booker_tz'] === null ? 'UTC' : String(r['booker_tz']),
    ownerEmail: who.email,
    ownerTz: who.timezone,
  };
}

async function ownerForBooking(sql: SqlClient, bookingId: string): Promise<Contact | undefined> {
  const { rows } = await sql.query(
    `SELECT o.email, o.timezone FROM bookings b
       JOIN owners o ON o.owner_id = b.owner_id
      WHERE b.booking_id = $1 LIMIT 1`,
    [bookingId],
  );
  const r = rows[0];
  return r ? { email: String(r['email']), timezone: String(r['timezone']) } : undefined;
}

interface SlotsResult {
  slots: Slot[];
  /** P5 · present on team events: each host's own offerable slots. */
  team?: { hosts: EventHost[]; perHost: Map<string, Slot[]> };
}

async function slotsFor(
  deps: AppDeps,
  schedule: Schedule,
  now: string,
  window?: { from: string; to: string },
): Promise<SlotsResult> {
  let from = window?.from ?? Temporal.Instant.from(now).toString();
  let to = window?.to ?? Temporal.Instant.from(now).add({ hours: 24 * 14 }).toString();
  // P2 · a fixed date range clamps the window. The dates are owner-local,
  // inclusive; outside them the page simply has no times.
  if (schedule.available_from) {
    const startOfRange = Temporal.PlainDate.from(schedule.available_from)
      .toZonedDateTime(schedule.owner_timezone).toInstant();
    if (Temporal.Instant.compare(startOfRange, Temporal.Instant.from(from)) > 0) {
      from = startOfRange.toString();
    }
  }
  if (schedule.available_until) {
    const endOfRange = Temporal.PlainDate.from(schedule.available_until)
      .add({ days: 1 }).toZonedDateTime(schedule.owner_timezone).toInstant();
    if (Temporal.Instant.compare(endOfRange, Temporal.Instant.from(to)) < 0) {
      to = endOfRange.toString();
    }
  }
  if (Temporal.Instant.compare(Temporal.Instant.from(from), Temporal.Instant.from(to)) >= 0) {
    return { slots: [] };
  }
  const q = { from, to, now };

  // P5 · a team event asks every host; a blind host fails the whole page
  // closed — offering a time we cannot verify for someone is the same sin
  // solo fail-closed exists to prevent.
  if (schedule.scheduling_kind !== 'solo') {
    const hosts = await loadHosts(deps.sql, schedule.schedule_id);
    if (hosts.length === 0) return { slots: [] };
    const perHost = new Map<string, Slot[]>();
    for (const host of hosts) {
      let external: Interval[] = [];
      if (deps.calendars) {
        const answer = await deps.calendars.busyFor(deps.sql, host.owner_id, from, to);
        if (!answer.ok) throw new CalendarBlindError(answer.reason);
        external = answer.intervals;
      }
      const r = await hostSlots(deps.sql, schedule, host, q, external);
      perHost.set(host.owner_id, r.slots);
    }
    const lists = hosts.map((h) => perHost.get(h.owner_id)!);
    const slots =
      schedule.scheduling_kind === 'collective' ? intersectSlots(lists) : unionSlots(lists);
    return { slots, team: { hosts, perHost } };
  }

  // SPEC-0003 · the calendar is consulted on every slot computation — page
  // views AND the commit-time revalidation — so a busy time that appeared
  // after the page loaded still blocks the booking (fresh fetch, B3 pattern).
  let externalBusy: Interval[] = [];
  if (deps.calendars) {
    const answer = await deps.calendars.busyFor(deps.sql, schedule.owner_id, from, to);
    if (!answer.ok) throw new CalendarBlindError(answer.reason);
    externalBusy = answer.intervals;
  }
  const solo = await availableSlots(deps.sql, schedule, q, externalBusy, window ? 400 : undefined);
  return { slots: solo.slots };
}

async function bookHandler(
  deps: AppDeps,
  schedule: Schedule,
  req: { ip: string; form?: Record<string, string> },
  now: string,
  /** P3 · a single-use link token to consume iff the booking commits. */
  singleUse?: string,
  /** Sharding · where the page's form posts back to on an error re-render. */
  action?: string,
  /** The booker has proved this address, so do not ask again. */
  verified?: boolean,
): Promise<Reply> {
  const { sql, config, mail } = deps;
  const form = req.form ?? {};

  if (await overLimit(sql, `book:${req.ip}`, RATE_LIMITS.booking_attempts_per_ip_per_minute, 60, now)) {
    return html(429, errorPage(429, 'Too many booking attempts. Try again shortly.'));
  }
  if (await overLimit(sql, `sched:${schedule.schedule_id}`, RATE_LIMITS.bookings_per_schedule_per_hour, 3600, now)) {
    return html(429, errorPage(429, 'This page has taken too many bookings recently.'));
  }

  // The owner's own questions, and whatever the booker typed into them. Loaded
  // before the first re-render so a failed submit hands the answers back
  // instead of making someone retype them.
  const questions = await loadQuestions(sql, schedule.schedule_id);
  const answers: Record<string, string> = {};
  for (const q of questions) {
    const given = (form[`q:${q.question_id}`] ?? '').trim();
    if (given) answers[q.question_id] = given.slice(0, MAX_ANSWER_CHARS);
  }
  const rerender = (status: number, offer: { slots: Slot[] }, error?: string) =>
    html(status, bookingPage(schedule, offer.slots, { action, error, questions, answers }));

  const start = form['start'];
  const end = form['end'];
  // F3 · name and email, plus any answers to the owner's own questions. A
  // field that belongs to neither is discarded here rather than stored and
  // justified later.
  const name = (form['name'] ?? '').trim();
  const email = (form['email'] ?? '').trim();
  const bookerTz = (form['booker_tz'] ?? 'UTC').trim();

  if (!start || !end || !name || !email) {
    return rerender(400, await slotsFor(deps, schedule, now), 'Pick a time and give a name and email.');
  }

  // Blocked sources · refused before any work is done for them, and before the
  // slot is held. The refusal is plain rather than a fake success: pretending
  // to book a meeting that will never happen wastes the person's time and
  // guarantees they turn up to nothing. It does not say who blocked them or
  // why — that is the owner's business, not the caller's.
  if (await blockedSource(sql, schedule.owner_id, email)) {
    return html(403, errorPage(403, 'This booking page is not accepting bookings from that address.'));
  }

  // A required question must be answered. Checked before the verification mail
  // goes out, so nobody is asked to confirm a submission that will be refused
  // the moment they do.
  const missing = questions.filter((q) => q.required && !answers[q.question_id]);
  if (missing.length > 0) {
    return rerender(400, await slotsFor(deps, schedule, now),
      `Answer ${missing.length === 1 ? 'the question' : 'the questions'}: ${missing.map((q) => q.label).join(', ')}.`);
  }

  // Email verification · prove the address before a meeting exists.
  //
  // The intent is stored INSTEAD of the booking. Holding the slot for an
  // unproven address would turn this feature into a denial-of-service tool —
  // one submission per slot with fabricated addresses fills a calendar without
  // a single real person — and a control meant to raise the cost of abuse must
  // not lower it. So the time stays open, and when the link is used the
  // ordinary booking path runs with the same form: same availability check,
  // same race, same 409 if the time went.
  if (schedule.require_email_verification && !verified) {
    const intentToken = newToken();
    await sql.query(
      `INSERT INTO booking_intents (token, schedule_id, owner_id, email, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [intentToken, schedule.schedule_id, schedule.owner_id, email.toLowerCase(),
       JSON.stringify(form), now],
    );
    await mail.send({
      kind: 'verify', to: email, bookingId: 'pending', start,
      token: tagged(deps, intentToken), timezone: bookerTz,
      // Z2d · nothing is booked yet and the address is unproven. Pre-booking by
      // definition, so it gets the public rendering.
      location: locationText(schedule, undefined, 'public'),
    });
    // The same page whether or not the mail could be delivered: a different
    // answer for a deliverable address is an address oracle.
    return html(200, errorPage(200,
      'Check your email. Nothing is booked yet — the message has a link that confirms it. The time is not held until you do.'));
  }

  // D1 · the ceiling is enforced, not intended.
  const { rows: countRows } = await sql.query(
    `SELECT count(*)::int AS c FROM bookings WHERE status = 'confirmed'`,
  );
  if (Number(countRows[0]?.['c'] ?? 0) >= config.maxBookingsRetained) {
    return html(
      503,
      errorPage(503, 'This service has reached its booking limit and is not accepting more.'),
    );
  }

  const store = new PostgresBookingStore(sql, schedule.owner_id, deps.tx);
  const idempotencyKey = form['idempotency_key'] ?? `${schedule.slug}:${start}:${email}`;

  // B1 / B5.1 — a replay reports the booking's state now.
  //
  // It does NOT disclose the management token. The default key is derived from
  // the slug, the start and the email, all of which an attacker can guess or
  // already knows — returning the token here would hand out a bearer credential
  // that cancels and deletes someone else's booking to anyone who guesses an
  // email address. Found in adversarial review. The token reaches exactly one
  // place: the confirmation mail.
  const replayed = await store.findByIdempotencyKey(idempotencyKey);
  if (replayed) {
    return html(
      200,
      errorPage(200, 'This time is already booked under that email. The confirmation message has the link to change or cancel it.'),
    );
  }

  // F1 · the interval must be one the engine actually offered, checked against
  // a fresh computation rather than against whatever the form claimed.
  const offered = await slotsFor(deps, schedule, now);
  if (!offeredSlot(offered.slots, start, end)) {
    return rerender(409, offered, 'That time is not available. Here are the times that are.');
  }

  // B3 · revalidate at commit, against the commit-time clock, with the
  // constraint the slot was computed under. Omitting it would revalidate
  // against nothing and confirm a slot that should have expired.
  if (noticeExpired(start, now, schedule.minimum_notice_minutes)) {
    return rerender(409, await slotsFor(deps, schedule, now), 'That time has passed. Pick another.');
  }

  // F4 · the page is a snapshot. Losing the race is normal operation.
  const bookingId = randomUUID();
  const token = newToken();
  const booker = { name, email, timezone: bookerTz, token };
  /** every row this booking creates: who it is for, and when */
  let occupied: { ownerId: string; bookingId: string; start: string; end: string }[];

  if (schedule.scheduling_kind === 'round_robin' && offered.team) {
    // P5 · fairness: fewest upcoming bookings first, then declared priority.
    // Losing a host to a race falls through to the next able host.
    const able = offered.team.hosts.filter((h) =>
      offeredSlot(offered.team!.perHost.get(h.owner_id) ?? [], start, end));
    const load = new Map<string, number>();
    for (const h of able) {
      const c = await sql.query(
        `SELECT count(*)::int AS c FROM bookings
          WHERE owner_id = $1 AND status = 'confirmed' AND starts_at > $2`,
        [h.owner_id, now]);
      load.set(h.owner_id, Number(c.rows[0]?.['c'] ?? 0));
    }
    able.sort((a, b) =>
      (load.get(a.owner_id)! - load.get(b.owner_id)!) || (b.priority - a.priority)
        || a.owner_id.localeCompare(b.owner_id));
    let winner: string | undefined;
    for (const h of able) {
      const hostStore = new PostgresBookingStore(sql, h.owner_id, deps.tx);
      const r = await hostStore.insertConfirmed(bookingId, start, end, idempotencyKey, booker);
      if (r.ok) { winner = h.owner_id; break; }
    }
    if (!winner) {
      return rerender(409, await slotsFor(deps, schedule, now), 'Someone just took that time. Here are the rest.');
    }
    occupied = [{ ownerId: winner, bookingId, start, end }];
  } else if (schedule.scheduling_kind === 'collective' && offered.team) {
    // P5 · every host, or nobody: one transaction, one group.
    const groupId = randomUUID();
    const entries = offered.team.hosts.map((h, i) => ({
      bookingId: i === 0 ? bookingId : randomUUID(),
      ownerId: h.owner_id,
    }));
    const r = await store.insertConfirmedGroup(groupId, entries, start, end, idempotencyKey, booker);
    if (!r.ok) {
      return rerender(409, await slotsFor(deps, schedule, now), 'Someone just took that time. Here are the rest.');
    }
    await sql.query(`UPDATE bookings SET schedule_id = $1 WHERE group_id = $2`,
      [schedule.schedule_id, groupId]);
    occupied = entries.map((e) => ({ ...e, start, end }));
  } else if (schedule.recurrence_rule && form['repeat'] === 'on') {
    // A series is all-or-nothing: every occurrence must be a time the engine
    // offers, and one clash refuses the whole thing rather than booking a
    // partial series someone has to unpick.
    const expanded = expandRecurrence({
      rule: schedule.recurrence_rule,
      firstStart: start,
      durationMinutes: schedule.duration_minutes,
      timezone: schedule.owner_timezone,
    });
    if (expanded.skipped.length > 0) {
      return rerender(409, await slotsFor(deps, schedule, now),
        'One date in that series falls in a daylight-saving gap, where the time does not exist. Pick another time.');
    }
    const last = expanded.occurrences[expanded.occurrences.length - 1]!;
    const seriesOffer = await slotsFor(deps, schedule, now, { from: start, to: last.end });
    const unavailable = expanded.occurrences.filter(
      (o) => !offeredSlot(seriesOffer.slots, o.start, o.end));
    if (unavailable.length > 0) {
      return rerender(409, await slotsFor(deps, schedule, now),
        `Not every date in that series is free (${unavailable.length} of ${expanded.occurrences.length} taken). Pick another time, or book a single meeting.`);
    }
    const groupId = randomUUID();
    const entries = expanded.occurrences.map((o, i) => ({
      bookingId: i === 0 ? bookingId : randomUUID(), start: o.start, end: o.end,
    }));
    const made = await store.insertConfirmedSeries(groupId, entries, idempotencyKey, booker);
    if (!made.ok) {
      return rerender(409, await slotsFor(deps, schedule, now), 'Someone just took one of those times. Here are the rest.');
    }
    await sql.query(`UPDATE bookings SET schedule_id = $1 WHERE group_id = $2`,
      [schedule.schedule_id, groupId]);
    occupied = entries.map((e) => ({ ownerId: schedule.owner_id, ...e }));
  } else {
    const inserted = await store.insertConfirmed(bookingId, start, end, idempotencyKey, booker);
    if (!inserted.ok) {
      return rerender(409, await slotsFor(deps, schedule, now), 'Someone just took that time. Here are the rest.');
    }
    occupied = [{ ownerId: schedule.owner_id, bookingId, start, end }];
  }
  await sql.query(`UPDATE bookings SET schedule_id = $1 WHERE booking_id = $2`, [
    schedule.schedule_id,
    bookingId,
  ]);
  const primaryOwnerId = occupied[0]!.ownerId;

  // Answers are written against every booking row this created, not just the
  // first. A recurring series is a dozen rows and a collective meeting is one
  // per host; an owner opening the third occurrence should see what was
  // answered, and — more importantly — deleting any one row must take its own
  // copy of the answer with it, which a single shared row would not allow.
  // The label is stored ALONGSIDE the answer, so editing the question later
  // cannot relabel what somebody already said.
  if (questions.length > 0) {
    const byId = new Map(questions.map((q) => [q.question_id, q]));
    for (const o of occupied) {
      for (const [questionId, answer] of Object.entries(answers)) {
        await sql.query(
          `INSERT INTO booking_answers (booking_id, question_id, label, answer)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (booking_id, question_id) DO UPDATE SET answer = excluded.answer`,
          [o.bookingId, questionId, byId.get(questionId)?.label ?? '', answer],
        );
      }
    }
  }

  // SPEC-0003 · the booking lands in the owner's calendar (never fatal, M3),
  // BEFORE the mails so a minted Meet link can ride along in them.
  // P3 · a single-use link dies with the booking that used it.
  if (singleUse) {
    await sql.query(`UPDATE single_use_links SET used_at = $2 WHERE token = $1`, [singleUse, now]);
  }

  // P3 · the booker joins the owner's contacts, unless excluded by address or
  // domain. Being excluded never blocks the booking itself.
  const domain = email.slice(email.indexOf('@') + 1).toLowerCase();
  const excluded = await sql.query(
    `SELECT 1 FROM contact_exclusions WHERE owner_id = $1 AND (pattern = $2 OR pattern = $3)`,
    [primaryOwnerId, email.toLowerCase(), domain],
  );
  if (!excluded.rows[0]) {
    await sql.query(
      `INSERT INTO contacts (owner_id, email, name, times_booked, last_booked_at)
       VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT (owner_id, email) DO UPDATE SET
         name = excluded.name,
         times_booked = contacts.times_booked + 1,
         last_booked_at = excluded.last_booked_at`,
      [primaryOwnerId, email.toLowerCase(), name, now],
    );
  }

  // P5 · each occupied host's own calendar receives the event; the Meet link
  // is minted on the first host's calendar and shared with everyone.
  let meetUrl: string | undefined;
  for (const [i, o] of occupied.entries()) {
    const written = await deps.calendars?.writeBack(sql, o.ownerId, o.bookingId, {
      title: `${schedule.title} — ${name}`,
      description: `Booked via ${config.baseUrl}/${schedule.slug}\nWith: ${name} <${email}>`,
      start: o.start,
      end: o.end,
      conference: i === 0 && (schedule.location_kind === 'meet' || schedule.location_kind === 'teams' || schedule.location_kind === 'zoom'),
    });
    if (i === 0) meetUrl = written?.meetUrl;
  }

  // Z3 · a room per booking, for the owner who actually connected.
  //
  // The old guard was `!meetUrl && !schedule.location_value`, and the connect
  // flow always set location_value — so per-booking creation was skipped for
  // exactly the population the integrations card promised it to (§0 D-c1). The
  // location_value half is gone: a stored link is a fallback, not a suppressor.
  //
  // Z3d steps 2 and 3, in order. Every step is best-effort (Z3e): a booking is
  // already committed by this point and must never fail because Zoom did.
  if (schedule.location_kind === 'zoom' && !meetUrl) {
    const zoomOpts = {
      topic: `${schedule.title} — ${name}`,
      startTime: start,
      durationMinutes: schedule.duration_minutes,
      timezone: schedule.owner_timezone,
      agenda: `Booked by ${name} <${email}> via Pumasi Booking`,
    };
    try {
      // 2 · the owner's own connection. Z3f · this token is used to create a
      // meeting for a booking on that owner's event type, and for nothing else.
      const video = videoConnections(config, deps.now);
      const conn = await video?.find(sql, schedule.owner_id);
      if (video && conn) {
        const token = await video.accessToken(sql, conn.connectionId, {
          clientId: config.zoomClientId,
          clientSecret: config.zoomClientSecret,
        });
        if (token) {
          const minted = await createZoomUserMeeting(token, zoomOpts);
          if (minted?.joinUrl) meetUrl = minted.joinUrl;
          else await video.markError(sql, conn.connectionId, 'Zoom declined the meeting creation');
        }
      }
    } catch (err) {
      console.warn('[zoom] per-booking creation from the stored connection failed:', err);
    }
    // 3 · Server-to-Server credentials, when the deployment has all three.
    if (!meetUrl) {
      const zoomRes = await createZoomMeeting(zoomOpts, {
        accountId: config.zoomAccountId,
        clientId: config.zoomClientId,
        clientSecret: config.zoomClientSecret,
      });
      if (zoomRes?.joinUrl) meetUrl = zoomRes.joinUrl;
    }
    // 5 · the personal meeting room, last. Step 4 (a link the owner typed, or
    // the residue of the old connect flow) is `schedule.location_value` and is
    // applied by locationText below, so this only fills in behind it.
    if (!meetUrl && !schedule.location_value) {
      try {
        const conn = await videoConnections(config, deps.now)?.find(sql, schedule.owner_id);
        if (conn?.fallbackUrl) meetUrl = conn.fallbackUrl;
      } catch (err) {
        console.warn('[zoom] fallback lookup failed:', err);
      }
    }
  }

  // Z2c · the confirmed audience. This is a booker who booked and the hosts of
  // that booking, so the link belongs here — and only here.
  const location = locationText(schedule, meetUrl, 'confirmed');

  // M2 · after commit, never inside the transaction. M3 · a failure here must
  // not invalidate a confirmed booking.
  // M5 · both parties. The owner's address is resolved here rather than passed
  // as a marker -- the SMTP adapter refuses a non-address, which is how the
  // placeholder was caught.
  await mail.send({
    kind: 'confirmed', to: email, bookingId, start, token: tagged(deps, token),
    timezone: bookerTz, location,
    // P3 · the booker's copy carries an .ics any calendar can import.
    ics: icsFor({ bookingId, title: schedule.title, start, end, location }),
  });
  // M5/P5 · every occupied host learns of the meeting; none gets the booker's
  // management token — it is the booker's credential.
  for (const o of [...new Map(occupied.map((x) => [x.ownerId, x])).values()]) {
    const host = await ownerContact(sql, o.ownerId);
    if (host) {
      await mail.send({ kind: 'confirmed', to: host.email, bookingId, start, timezone: host.timezone, location });
    }
  }

  // P7 · automations fire for the event type's owner: immediate workflows and
  // webhooks now, before/after reminders at the meeting's edges.
  {
    const wfOwner = await ownerContact(sql, schedule.owner_id);
    if (wfOwner) {
      await fireTrigger(sql, 'booking_created', {
        bookingId, ownerId: schedule.owner_id, title: schedule.title,
        start, end, bookerName: name, bookerEmail: email, bookerTz, location,
      }, wfOwner.email, wfOwner.timezone, now);
      await deps.pump?.();
    }
  }

  // The management token reaches exactly one place: the confirmation mail.
  // Putting it on the response page would let anyone who books using someone
  // else's address walk away holding a credential over that booking, and would
  // leave it in browser history and on shared screens.
  return html(200, confirmedPage({ title: schedule.title, start, location }));
}
