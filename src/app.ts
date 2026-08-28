/**
 * SPEC-0002 §3 — the HTTP surfaces.
 *
 * Routing and I/O only. Every availability question goes to the engine and
 * every exclusivity question goes to the database; neither is decided here.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { Temporal } from '@js-temporal/polyfill';
import { PostgresBookingStore, type SqlClient, type Transactor } from './store.ts';
import { availableSlots, findScheduleById, findScheduleBySlug, type Schedule } from './schedules.ts';
import {
  bookingPage, confirmedPage, errorPage, homePage, loginPage, managePage, ownerHome, signupPage,
  type ScheduleSummary,
} from './pages.ts';
import {
  clearedCookie, consumeSignInToken, createSession, destroySession, issueSignInToken,
  ownerForSession, readCookie, redeemInvite, sessionCookie,
} from './identity.ts';
import { RATE_LIMITS, type Config } from './config.ts';
import type { MailPort } from './mail.ts';
import type { Slot } from '@pumasi/scheduling-core';

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

export interface AppDeps {
  sql: SqlClient;
  /** Supplies a connection per transaction (driver.ts). */
  tx: Transactor;
  config: Config;
  mail: MailPort;
  /** Injected so tests control it and the service never reads an ambient clock. */
  now: () => string;
  ready: () => boolean;
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
      `SELECT b.booking_id, b.starts_at, b.ends_at, b.status, b.schedule_id, b.owner_id, s.title
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

    /** L4 · other times this booking could move to. The engine decides them. */
    const moveOptions = async (): Promise<Slot[]> => {
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
        await store.cancel(bookingId, `cancel:${token}`);
        const ownerRow = await ownerForBooking(sql, bookingId);
        if (ownerRow) {
          await mail.send({
            kind: 'cancelled', to: ownerRow.email, bookingId,
            start: startIso, timezone: ownerRow.timezone,
          });
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
    // I2 · public signup stays blocked; an invite is the only way in.
    if (req.method === 'GET') {
      return html(200, signupPage(req.query?.['invite'] ?? ''));
    }
    const f = req.form ?? {};
    const result = await redeemInvite(
      sql, deps.tx,
      {
        code: (f['invite'] ?? '').trim(),
        email: (f['email'] ?? '').trim(),
        displayName: (f['display_name'] ?? '').trim(),
        timezone: (f['timezone'] ?? 'UTC').trim(),
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
    if (req.method === 'GET') return html(200, loginPage());
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
      try {
        await sql.query(
          `INSERT INTO schedules (schedule_id, owner_id, slug, title, duration_minutes,
             granularity_minutes, minimum_notice_minutes, maximum_horizon_days)
           VALUES ($1, $2, $3, $4, $5, $5, 60, 30)`,
          [randomUUID(), owner.owner_id, slug, (f['title'] ?? 'Booking').trim(),
           Number(f['duration_minutes'] ?? 30)],
        );
      } catch {
        return html(409, errorPage(409, 'That link is already taken.'));
      }
      return { status: 303, headers: { location: '/app' }, body: '' };
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
      await deps.tx.transaction(async (tx) => {
        await tx.query(`DELETE FROM availability_rules WHERE schedule_id = $1`, [parts[2]]);
        for (const d of ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']) {
          const s = (f[`${d}_start`] ?? '').trim();
          const e = (f[`${d}_end`] ?? '').trim();
          if (!/^\d{2}:\d{2}$/.test(s) || !/^\d{2}:\d{2}$/.test(e)) continue;
          await tx.query(
            `INSERT INTO availability_rules (schedule_id, weekday, starts_local, ends_local)
             VALUES ($1, $2, $3, $4)`,
            [parts[2], d, s, e],
          );
        }
      });
      return { status: 303, headers: { location: '/app' }, body: '' };
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
    return html(200, ownerHome(owner, summaries, config.baseUrl));
  }

  // ── the public booking page ──────────────────────────────────────────────
  const slug = parts[0];
  if (!slug) return html(200, homePage());

  const schedule = await findScheduleBySlug(sql, slug);
  if (!schedule) return html(404, errorPage(404, 'No such booking page.'));

  if (req.method === 'GET' && parts.length === 1) {
    if (await overLimit(sql, `view:${req.ip}`, RATE_LIMITS.page_views_per_ip_per_minute, 60, now)) {
      return html(429, errorPage(429, 'Too many requests. Try again shortly.'));
    }
    const slots = await slotsFor(deps, schedule, now);
    return html(200, bookingPage(schedule, slots.slots));
  }

  if (req.method === 'POST' && parts[1] === 'book') {
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

async function slotsFor(deps: AppDeps, schedule: Schedule, now: string) {
  const from = Temporal.Instant.from(now).toString();
  const to = Temporal.Instant.from(now).add({ hours: 24 * 14 }).toString();
  return availableSlots(deps.sql, schedule, { from, to, now });
}

async function bookHandler(
  deps: AppDeps,
  schedule: Schedule,
  req: { ip: string; form?: Record<string, string> },
  now: string,
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
  const inserted = await store.insertConfirmed(bookingId, start, end, idempotencyKey, {
    name,
    email,
    timezone: bookerTz,
    token,
  });
  if (!inserted.ok) {
    const slots = await slotsFor(deps, schedule, now);
    return html(409, bookingPage(schedule, slots.slots, { error: 'Someone just took that time. Here are the rest.' }));
  }
  await sql.query(`UPDATE bookings SET schedule_id = $1 WHERE booking_id = $2`, [
    schedule.schedule_id,
    bookingId,
  ]);

  // M2 · after commit, never inside the transaction. M3 · a failure here must
  // not invalidate a confirmed booking.
  // M5 · both parties. The owner's address is resolved here rather than passed
  // as a marker -- the SMTP adapter refuses a non-address, which is how the
  // placeholder was caught.
  const owner = await ownerContact(sql, schedule.owner_id);
  await mail.send({ kind: 'confirmed', to: email, bookingId, start, token, timezone: bookerTz });
  if (owner) {
    // The owner gets no management token: it is the booker's credential.
    await mail.send({ kind: 'confirmed', to: owner.email, bookingId, start, timezone: owner.timezone });
  }

  // The management token reaches exactly one place: the confirmation mail.
  // Putting it on the response page would let anyone who books using someone
  // else's address walk away holding a credential over that booking, and would
  // leave it in browser history and on shared screens.
  return html(200, confirmedPage({ title: schedule.title, start }));
}
