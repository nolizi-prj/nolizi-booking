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
  intersectSlots, loadHosts, locationText, unionSlots, type EventHost, type Schedule,
} from './schedules.ts';
import {
  availabilityEditor, bookingPage, confirmedPage, contactsPage, errorPage, eventTypeEditor,
  homePage, loginPage, managePage, meetingsPage, ownerHome, ownerLanding, settingsPage, signupPage,
  teamPage,
  snippetPage,
  type ScheduleSummary,
} from './pages.ts';
import {
  clearedCookie, consumeSignInToken, createOwnerDirect, createSession, destroySession,
  issueSignInToken, ownerForSession, readCookie, redeemInvite, RESERVED_SLUGS, sessionCookie,
} from './identity.ts';
import { googleSsoExchange, googleSsoUrl } from './sso-google.ts';
import { RATE_LIMITS, type Config } from './config.ts';
import type { CalendarHub } from './calendars.ts';
import { icsFor } from './ics.ts';
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
}

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
  },
): Promise<Reply> {
  const { sql, config, mail } = deps;
  const now = deps.now();
  const parts = req.path.split('/').filter(Boolean);
  const secure = config.baseUrl.startsWith('https://');
  const sessionId = readCookie(req.cookie, 'pumasi_session');

  // O3 · health means the process is up; readiness means it can actually serve.
  if (req.path === '/healthz') return json(200, { status: 'ok', commit: config.commit });
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
      commit: config.commit,
      tzdata: (process.versions as { tz?: string }).tz ?? 'unknown',
    });
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
      return html(200, managePage({ title, start: startIso, token, status, slots: await moveOptions() }));
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
        return html(400, managePage({ title, start: startIso, token, status,
          slots: await moveOptions(), error: 'Pick a time to move to.' }));
      }
      // F1 · the same rule as booking. A token holder may move the meeting, but
      // only to a time the engine offers.
      const options = await moveOptions();
      if (!offeredSlot(options, newStart, newEnd)) {
        return html(409, managePage({ title, start: startIso, token, status,
          slots: options, error: 'That time is not available. Here are the times that are.' }));
      }
      const store = new PostgresBookingStore(sql, String(r['owner_id']), deps.tx);
      const moved = await store.move(bookingId, newStart, newEnd, `move:${token}:${newStart}`);
      if (!moved.ok) {
        return html(409, managePage({ title, start: startIso, token, status,
          slots: await moveOptions(), error: 'Someone just took that time. Here are the rest.' }));
      }
      // SPEC-0003 · the owner's calendar follows the move (never fatal, M3).
      await deps.calendars?.onMoved(sql, bookingId, newStart, newEnd);
      // M5 · both parties learn the meeting moved.
      const owner = await ownerForBooking(sql, bookingId);
      const booker = await bookerFor(sql, bookingId);
      if (booker?.email) {
        await mail.send({ kind: 'rescheduled', to: booker.email, bookingId,
          start: newStart, token, timezone: booker.timezone });
      }
      if (owner) {
        await mail.send({ kind: 'rescheduled', to: owner.email, bookingId,
          start: newStart, timezone: owner.timezone });
      }
      return html(200, managePage({ title, start: newStart, token, status: 'confirmed',
        slots: await moveOptions() }));
    }
    if (req.method === 'POST' && parts[2] === 'cancel') {
      const store = new PostgresBookingStore(sql, 'unused', deps.tx);
      const existing = await store.findById(bookingId);
      // B5 · cancelling is idempotent and total; re-cancelling is `cancelled`.
      if (existing?.status === 'confirmed') {
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
      return html(200, managePage({ title, start: startIso, token, status: 'cancelled' }));
    }
    // D8 · a bearer link may cancel, but deleting personal data needs a
    // confirmation from that same link — a forwarded email must not destroy a
    // record in one click.
    if (req.method === 'POST' && parts[2] === 'delete') {
      if (req.form?.['confirm'] !== 'yes') {
        return html(400, errorPage(400, 'Deletion needs the confirmation box ticked.'));
      }
      await sql.query(
        `UPDATE bookings SET status='cancelled', booker_name=NULL, booker_email=NULL, booker_tz=NULL
          WHERE booking_id = $1`,
        [bookingId],
      );
      return html(200, errorPage(200, 'Your booking is cancelled and your details are deleted.'));
    }
    return html(405, errorPage(405, 'Method not allowed.'));
  }

  // ── owner surfaces (I1–I4) ───────────────────────────────────────────────
  if (parts[0] === 'signup') {
    // I2 · public signup stays blocked while D-105 is open; an invite is the
    // only way in. When the flag opens (steward review), the same page works
    // without one.
    if (req.method === 'GET') {
      return html(200, signupPage(req.query?.['invite'] ?? '', undefined,
        { sso: Boolean(config.googleClientId), publicSignup: config.publicSignup }));
    }
    const f = req.form ?? {};
    const inviteCode = (f['invite'] ?? '').trim();
    const input = {
      email: (f['email'] ?? '').trim(),
      displayName: (f['display_name'] ?? '').trim(),
      timezone: (f['timezone'] ?? 'UTC').trim(),
    };
    if (!inviteCode && config.publicSignup) {
      const made = await createOwnerDirect(sql, deps.tx, input, config.maxOwnerAccounts);
      if (!made.ok) {
        const message = made.reason === 'ceiling'
          ? 'This service has reached its account limit and is not taking more.'
          : 'That address already has an account. Sign in instead.';
        return html(400, signupPage('', message));
      }
      const sid = await createSession(sql, made.owner.owner_id, now, config.sessionTtlHours);
      return {
        status: 303,
        headers: { location: '/app', 'set-cookie': sessionCookie(sid, secure, config.sessionTtlHours) },
        body: '',
      };
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

  if (parts[0] === 'login') {
    if (req.method === 'GET') return html(200, loginPage(undefined, undefined, Boolean(config.googleClientId)));
    const email = (req.form?.['email'] ?? '').trim();
    if (await overLimit(sql, `login:${req.ip}`, RATE_LIMITS.booking_attempts_per_ip_per_minute, 60, now)) {
      return html(429, errorPage(429, 'Too many attempts. Try again shortly.'));
    }
    const { rows } = await sql.query(`SELECT owner_id FROM owners WHERE lower(email) = lower($1)`, [email]);
    if (rows[0]) {
      const token = await issueSignInToken(sql, String(rows[0]['owner_id']), now);
      await mail.send({ kind: 'signin', to: email, bookingId: '', start: now, token });
    }
    // The same answer either way: whether an address has an account is not
    // something an unauthenticated caller gets to learn.
    return html(200, loginPage(true));
  }

  // ── "Sign in with Google" (P4) — openid+email only, never calendar ───────
  if (parts[0] === 'auth' && parts[1] === 'google' && parts[2] === 'start' && req.method === 'POST') {
    const hub = deps.calendars;
    if (!hub || !config.googleClientId) {
      return html(404, errorPage(404, 'Google sign-in is not configured.'));
    }
    const state = await hub.sealState({
      purpose: 'sso',
      invite: (req.form?.['invite'] ?? '').trim(),
      timezone: (req.form?.['timezone'] ?? '').trim(),
    });
    return {
      status: 303,
      headers: {
        location: googleSsoUrl({
          clientId: config.googleClientId,
          redirectUri: `${config.baseUrl}/oauth/google/callback`,
          state,
        }),
      },
      body: '',
    };
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
    if (!hub) return html(404, errorPage(404, 'Calendar integration is not configured.'));
    if (req.query?.['error']) {
      return html(400, errorPage(400, 'The calendar connection was declined. Nothing was stored.'));
    }
    const state = await hub.openState(req.query?.['state'] ?? '');
    const code = req.query?.['code'];
    if (!state || !code) {
      return html(400, errorPage(400, 'This connection attempt is stale or invalid. Start again from your dashboard.'));
    }

    // P4 · the same callback serves sign-in; the sealed state says which.
    if (state['purpose'] === 'sso') {
      if (!config.googleClientId || !config.googleClientSecret) {
        return html(404, errorPage(404, 'Google sign-in is not configured.'));
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
      await deps.tx.transaction(async (tx) => {
        await tx.query(`DELETE FROM bookings WHERE owner_id = $1`, [owner.owner_id]);
        // D3 · calendar credentials are the most protected datum; deletion of
        // the account deletes them in the same transaction.
        await tx.query(
          `DELETE FROM connection_calendars WHERE connection_id IN
             (SELECT connection_id FROM calendar_connections WHERE owner_id = $1)`,
          [owner.owner_id],
        );
        await tx.query(`DELETE FROM calendar_connections WHERE owner_id = $1`, [owner.owner_id]);
        // P3 · contacts and sharing artefacts go with the account (D3).
        await tx.query(`DELETE FROM contacts WHERE owner_id = $1`, [owner.owner_id]);
        await tx.query(`DELETE FROM contact_exclusions WHERE owner_id = $1`, [owner.owner_id]);
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

    // ── invites (P5): any owner may mint one while seats remain ──────────
    if (parts[1] === 'invites' && req.method === 'POST') {
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
      return html(200, teamPage(orgs, owner.owner_id,
        openInvites.rows.map((r) => String(r['code'])), config.baseUrl));
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
      if (req.method === 'GET') {
        return html(200, settingsPage(current, config.baseUrl));
      }
      if (req.method === 'POST') {
        const f = req.form ?? {};
        const name = (f['display_name'] ?? '').trim() || current.display_name;
        const tz = (f['timezone'] ?? '').trim() || current.timezone;
        try {
          Temporal.Now.zonedDateTimeISO(tz); // refuse an unknown zone loudly
        } catch {
          return html(400, settingsPage(current, config.baseUrl, 'That timezone is not recognised.'));
        }
        const welcome = (f['welcome_message'] ?? '').trim().slice(0, 500);
        const color = (f['brand_color'] ?? '').trim();
        if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) {
          return html(400, settingsPage(current, config.baseUrl, 'A color looks like #1a56db.'));
        }
        const newSlug = (f['link_slug'] ?? '').trim().toLowerCase();
        if (newSlug !== current.link_slug) {
          if (!/^[a-z0-9-]{2,40}$/.test(newSlug) || RESERVED_SLUGS.has(newSlug)) {
            return html(400, settingsPage(current, config.baseUrl,
              'A link uses lowercase letters, digits and dashes, and some names are reserved.'));
          }
          const clash = await sql.query(
            `SELECT 1 FROM owners WHERE link_slug = $1 AND owner_id <> $2`,
            [newSlug, owner.owner_id]);
          if (clash.rows[0]) {
            return html(400, settingsPage(current, config.baseUrl, 'That link is already taken.'));
          }
        }
        await sql.query(
          `UPDATE owners SET display_name = $2, timezone = $3, welcome_message = $4,
                  brand_color = $5, link_slug = $6
            WHERE owner_id = $1`,
          [owner.owner_id, name, tz, welcome || null, color || null, newSlug || current.link_slug]);
        return { status: 303, headers: { location: '/app/settings' }, body: '' };
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
        return html(200, meetingsPage(items, range, q, owner.timezone));
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
      return html(200, contactsPage(
        contacts.rows.map((r) => ({
          email: String(r['email']), name: String(r['name']),
          times_booked: Number(r['times_booked']),
          last_booked_at: String(r['last_booked_at']).slice(0, 10),
        })),
        exclusions.rows.map((r) => String(r['pattern'])),
      ));
    }

    // ── sharing (P3): single-use links and the times snippet ─────────────
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
        })), linkSlug, config.baseUrl, su.rows.map((r) => String(r['token'])),
          choices, hosts.map((h) => h.owner_id)));
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
        const kind = ['custom', 'phone', 'in_person', 'meet'].includes(f['location_kind'] ?? '')
          ? f['location_kind']! : 'custom';
        const chosenSet = sets.rows.some((r) => String(r['set_id']) === f['availability_set_id'])
          ? f['availability_set_id']! : sched.availability_set_id;
        const dateRe = /^\d{4}-\d{2}-\d{2}$/;
        await sql.query(
          `UPDATE schedules SET title = $2, description = $3, duration_minutes = $4,
                  granularity_minutes = $5, buffer_before_minutes = $6, buffer_after_minutes = $7,
                  minimum_notice_minutes = $8, maximum_horizon_days = $9, max_bookings_per_day = $10,
                  location_kind = $11, location_value = $12, availability_set_id = $13,
                  available_from = $14, available_until = $15, color = $16
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
           opt(f['color']), owner.owner_id],
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
        const state = await hub.sealState({ owner_id: owner.owner_id, level: scopeLevel });
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
        return { status: 303, headers: { location: '/app' }, body: '' };
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
      `SELECT s.schedule_id, s.slug, s.title, s.duration_minutes,
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
      return html(200, bookingPage(schedule, slots.slots, { action: `/s/${parts[1]}/book` }));
    }
    if (req.method === 'POST' && parts[2] === 'book') {
      return bookHandler(deps, schedule, req, now, parts[1]);
    }
    return html(404, errorPage(404, 'Nothing here.'));
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

  // ── the public surfaces (P2) ─────────────────────────────────────────────
  // /<owner>            the owner's landing page, listing their event types
  // /<owner>/<event>    a booking page (the parity route)
  // /<event>            legacy: a bare event slug still resolves
  const slug = parts[0];
  if (!slug) return html(200, homePage());

  if (await overLimit(sql, `view:${req.ip}`, RATE_LIMITS.page_views_per_ip_per_minute, 60, now)) {
    return html(429, errorPage(429, 'Too many requests. Try again shortly.'));
  }

  // Two segments: /<owner>/<event> — page or its book action.
  if (parts.length >= 2 && parts[1] !== 'book') {
    const schedule = await findScheduleByOwnerSlug(sql, slug, parts[1]!);
    if (!schedule) return html(404, errorPage(404, 'No such booking page.'));
    if (req.method === 'GET' && parts.length === 2) {
      const slots = await slotsFor(deps, schedule, now);
      return html(200, bookingPage(schedule, slots.slots));
    }
    if (req.method === 'POST' && parts[2] === 'book') {
      return bookHandler(deps, schedule, req, now);
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
      ));
    }
    const schedule = await findScheduleBySlug(sql, slug);
    if (!schedule) return html(404, errorPage(404, 'No such booking page.'));
    const slots = await slotsFor(deps, schedule, now);
    return html(200, bookingPage(schedule, slots.slots));
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

async function slotsFor(deps: AppDeps, schedule: Schedule, now: string): Promise<SlotsResult> {
  let from = Temporal.Instant.from(now).toString();
  let to = Temporal.Instant.from(now).add({ hours: 24 * 14 }).toString();
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
  const solo = await availableSlots(deps.sql, schedule, q, externalBusy);
  return { slots: solo.slots };
}

async function bookHandler(
  deps: AppDeps,
  schedule: Schedule,
  req: { ip: string; form?: Record<string, string> },
  now: string,
  /** P3 · a single-use link token to consume iff the booking commits. */
  singleUse?: string,
): Promise<Reply> {
  const { sql, config, mail } = deps;
  const form = req.form ?? {};

  if (await overLimit(sql, `book:${req.ip}`, RATE_LIMITS.booking_attempts_per_ip_per_minute, 60, now)) {
    return html(429, errorPage(429, 'Too many booking attempts. Try again shortly.'));
  }
  if (await overLimit(sql, `sched:${schedule.schedule_id}`, RATE_LIMITS.bookings_per_schedule_per_hour, 3600, now)) {
    return html(429, errorPage(429, 'This page has taken too many bookings recently.'));
  }

  const start = form['start'];
  const end = form['end'];
  // F3 · name and email, and nothing else. Any other field is discarded here
  // rather than stored and justified later.
  const name = (form['name'] ?? '').trim();
  const email = (form['email'] ?? '').trim();
  const bookerTz = (form['booker_tz'] ?? 'UTC').trim();

  if (!start || !end || !name || !email) {
    const slots = await slotsFor(deps, schedule, now);
    return html(400, bookingPage(schedule, slots.slots, { error: 'Pick a time and give a name and email.' }));
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
    return html(
      409,
      bookingPage(schedule, offered.slots, {
        error: 'That time is not available. Here are the times that are.',
      }),
    );
  }

  // B3 · revalidate at commit, against the commit-time clock, with the
  // constraint the slot was computed under. Omitting it would revalidate
  // against nothing and confirm a slot that should have expired.
  if (noticeExpired(start, now, schedule.minimum_notice_minutes)) {
    const slots = await slotsFor(deps, schedule, now);
    return html(409, bookingPage(schedule, slots.slots, { error: 'That time has passed. Pick another.' }));
  }

  // F4 · the page is a snapshot. Losing the race is normal operation.
  const bookingId = randomUUID();
  const token = newToken();
  const booker = { name, email, timezone: bookerTz, token };
  /** every owner this meeting occupies, with each one's own booking row id */
  let occupied: { ownerId: string; bookingId: string }[];

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
      const slots = await slotsFor(deps, schedule, now);
      return html(409, bookingPage(schedule, slots.slots, { error: 'Someone just took that time. Here are the rest.' }));
    }
    occupied = [{ ownerId: winner, bookingId }];
  } else if (schedule.scheduling_kind === 'collective' && offered.team) {
    // P5 · every host, or nobody: one transaction, one group.
    const groupId = randomUUID();
    const entries = offered.team.hosts.map((h, i) => ({
      bookingId: i === 0 ? bookingId : randomUUID(),
      ownerId: h.owner_id,
    }));
    const r = await store.insertConfirmedGroup(groupId, entries, start, end, idempotencyKey, booker);
    if (!r.ok) {
      const slots = await slotsFor(deps, schedule, now);
      return html(409, bookingPage(schedule, slots.slots, { error: 'Someone just took that time. Here are the rest.' }));
    }
    await sql.query(`UPDATE bookings SET schedule_id = $1 WHERE group_id = $2`,
      [schedule.schedule_id, groupId]);
    occupied = entries;
  } else {
    const inserted = await store.insertConfirmed(bookingId, start, end, idempotencyKey, booker);
    if (!inserted.ok) {
      const slots = await slotsFor(deps, schedule, now);
      return html(409, bookingPage(schedule, slots.slots, { error: 'Someone just took that time. Here are the rest.' }));
    }
    occupied = [{ ownerId: schedule.owner_id, bookingId }];
  }
  await sql.query(`UPDATE bookings SET schedule_id = $1 WHERE booking_id = $2`, [
    schedule.schedule_id,
    bookingId,
  ]);
  const primaryOwnerId = occupied[0]!.ownerId;

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
      start,
      end,
      conference: i === 0 && schedule.location_kind === 'meet',
    });
    if (i === 0) meetUrl = written?.meetUrl;
  }
  const location = locationText(schedule, meetUrl);

  // M2 · after commit, never inside the transaction. M3 · a failure here must
  // not invalidate a confirmed booking.
  // M5 · both parties. The owner's address is resolved here rather than passed
  // as a marker -- the SMTP adapter refuses a non-address, which is how the
  // placeholder was caught.
  await mail.send({
    kind: 'confirmed', to: email, bookingId, start, token, timezone: bookerTz, location,
    // P3 · the booker's copy carries an .ics any calendar can import.
    ics: icsFor({ bookingId, title: schedule.title, start, end, location }),
  });
  // M5/P5 · every occupied host learns of the meeting; none gets the booker's
  // management token — it is the booker's credential.
  for (const o of occupied) {
    const host = await ownerContact(sql, o.ownerId);
    if (host) {
      await mail.send({ kind: 'confirmed', to: host.email, bookingId, start, timezone: host.timezone, location });
    }
  }

  // The management token reaches exactly one place: the confirmation mail.
  // Putting it on the response page would let anyone who books using someone
  // else's address walk away holding a credential over that booking, and would
  // leave it in browser history and on shared screens.
  return html(200, confirmedPage({ title: schedule.title, start, location }));
}
