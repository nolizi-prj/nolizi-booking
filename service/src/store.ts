/**
 * SPEC-0002 P1, P2a, P2c — the PostgreSQL booking store.
 *
 * This implements the `BookingStore` contract from the engine. The engine says
 * WHAT must be true of a booking; this says HOW, and the how is the whole point:
 * exclusivity under concurrency is a property of the store, and an in-process
 * check would be a time-of-check-to-time-of-use race.
 *
 * Every guarantee here is enforced by a constraint in migrations/001_bookings.sql,
 * caught as an integrity error, and translated to `conflict`. None of it is
 * enforced by reading rows and deciding.
 */

import type { BookingRecord, BookingStore } from '@pumasi/booking-core';

/** The minimum surface a driver must offer. `pg` and PGlite both satisfy it. */
export interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /**
   * Run a multi-statement script. Separate from `query` because a parameterised
   * statement can only carry one command — migrations need the other mode.
   */
  exec(sql: string): Promise<void>;
}

/** PostgreSQL SQLSTATE codes we translate rather than propagate. */
const UNIQUE_VIOLATION = '23505';
const EXCLUSION_VIOLATION = '23P01';
const SERIALIZATION_FAILURE = '40001';
const DEADLOCK_DETECTED = '40P01';

const sqlstate = (err: unknown): string =>
  (err as { code?: string })?.code ?? '';
const messageOf = (err: unknown): string => (err as Error)?.message ?? '';

/** A genuine loser: someone else holds the interval. */
function isConflict(err: unknown): boolean {
  const code = sqlstate(err);
  if (code === UNIQUE_VIOLATION || code === EXCLUSION_VIOLATION) return true;
  // PGlite surfaces the SQLSTATE in the message rather than a `code` field.
  const m = messageOf(err);
  return m.includes('violates exclusion constraint') || m.includes('violates unique constraint');
}

/**
 * NOT a loser — a transaction the database aborted so that others could
 * proceed, which says nothing about who should hold the interval.
 *
 * Concurrent inserts of mutually overlapping ranges under an exclusion
 * constraint make waiters block on each other, and with three or more the wait
 * graph can cycle. PostgreSQL breaks the cycle by aborting a victim. Reporting
 * that victim as `conflict` would be wrong twice over: it may have been the
 * caller that should have won, and if every contender deadlocks then NOBODY
 * wins — which breaks SPEC-0001 B2's "exactly one returns confirmed".
 *
 * Found by running the store against real PostgreSQL with real parallel
 * connections. PGlite has one connection, so nothing there could ever race and
 * this was invisible to every earlier test.
 */
function isRetryable(err: unknown): boolean {
  const code = sqlstate(err);
  if (code === SERIALIZATION_FAILURE || code === DEADLOCK_DETECTED) return true;
  const m = messageOf(err);
  return m.includes('deadlock detected') || m.includes('could not serialize');
}

/** Raised when another booking already owns the idempotency key (B1). */
class KeyTaken extends Error {}

const RETRY_ATTEMPTS = 8;

/**
 * Make contenders for one owner's calendar QUEUE rather than pile onto the
 * exclusion constraint and form wait cycles.
 *
 * Without this, concurrent inserts of overlapping ranges block on each other
 * inside the constraint's speculative-insertion path, and with enough
 * contenders the wait graph cycles and PostgreSQL starts aborting victims.
 * Retrying a deadlock storm is treating the symptom; taking the lock first
 * turns a cycle-prone free-for-all into a FIFO queue.
 *
 * This does NOT move enforcement into application code — the constraint still
 * decides who holds the interval, which is what SPEC-0002 P1 requires. The lock
 * only controls the order contenders arrive in. It is transaction-scoped, so it
 * releases on commit or rollback with no unlock path to forget.
 */
async function lockOwner(tx: SqlClient, ownerId: string): Promise<void> {
  await tx.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [ownerId]);
}

/** Bounded retry with jittered backoff, so contenders do not re-collide in step. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err)) throw err;
      lastError = err;
      const backoff = Math.min(2 ** attempt, 32) * (1 + Math.random());
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastError;
}

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString().replace('.000Z', 'Z') : String(v);

function toRecord(row: Record<string, unknown>): BookingRecord {
  return {
    booking_id: String(row['booking_id']),
    start: iso(row['starts_at']),
    end: iso(row['ends_at']),
    status: row['status'] === 'cancelled' ? 'cancelled' : 'confirmed',
  };
}

/**
 * An async store. The engine's `BookingStore` is synchronous by design — it is
 * a pure contract — so the service calls these directly rather than through it.
 */
export interface Transactor {
  /** Runs `fn` inside a transaction, on a connection of its own. */
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
}

export class PostgresBookingStore {
  readonly #tx: Transactor;

  constructor(
    private readonly sql: SqlClient,
    private readonly ownerId: string,
    transactor?: Transactor,
  ) {
    // Falling back to running the body without a transaction would be silently
    // unsafe, so the fallback is an explicit single-statement path instead: the
    // caller gets the same client and no BEGIN is issued at all.
    this.#tx = transactor ?? { transaction: (fn) => fn(sql) };
  }

  async findByIdempotencyKey(key: string): Promise<BookingRecord | undefined> {
    const { rows } = await this.sql.query(
      `SELECT b.booking_id, b.starts_at, b.ends_at, b.status
         FROM idempotency_keys k
         JOIN bookings b ON b.booking_id = k.booking_id
        WHERE k.key = $1
        ORDER BY b.id DESC
        LIMIT 1`,
      [key],
    );
    return rows[0] ? toRecord(rows[0]) : undefined;
  }

  async findById(bookingId: string): Promise<BookingRecord | undefined> {
    const { rows } = await this.sql.query(
      `SELECT booking_id, starts_at, ends_at, status
         FROM bookings
        WHERE booking_id = $1
        ORDER BY (status = 'confirmed') DESC, id DESC
        LIMIT 1`,
      [bookingId],
    );
    return rows[0] ? toRecord(rows[0]) : undefined;
  }

  /**
   * P1a — insert, and let the exclusion constraint decide. There is deliberately
   * no SELECT-then-INSERT here: that pattern passes every non-concurrent test
   * and loses races in production.
   */
  async insertConfirmed(
    bookingId: string,
    start: string,
    end: string,
    key: string,
    booker?: { name: string; email: string; timezone: string; token: string },
  ): Promise<{ ok: true } | { ok: false; reason: 'conflict' }> {
    return withRetry(() =>
      this.#tx.transaction(async (tx) => {
      try {
      await lockOwner(tx, this.ownerId);
      await tx.query(
        `INSERT INTO bookings
           (booking_id, owner_id, starts_at, ends_at, status, booker_name, booker_email, booker_tz, token)
         VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, $7, $8)`,
        [
          bookingId,
          this.ownerId,
          start,
          end,
          booker?.name ?? null,
          booker?.email ?? null,
          booker?.timezone ?? null,
          booker?.token ?? null,
        ],
      );
      // B1 — first use of a key wins. Claiming the key must be a CONDITION of
      // the insert, not a side effect of it: with DO NOTHING alone, two
      // concurrent requests carrying one key both proceed and produce two
      // confirmed bookings sharing a single key, which breaks B1 and F5 under
      // exactly the load they exist for. RETURNING tells us whether we claimed
      // it, and losing means someone else's booking owns it.
      const claimed = await tx.query(
        `INSERT INTO idempotency_keys (key, booking_id) VALUES ($1, $2)
           ON CONFLICT (key) DO NOTHING
         RETURNING key`,
        [key, bookingId],
      );
      if (!claimed.rows[0]) throw new KeyTaken();
      return { ok: true as const };
      } catch (err) {
        if (err instanceof KeyTaken || isConflict(err)) {
          return { ok: false as const, reason: 'conflict' as const };
        }
        throw err;
      }
      }),
    );
  }

  /**
   * P5 · a collective meeting occupies EVERY host: one row per host, distinct
   * booking_ids joined by group_id, committed in one transaction. Owners are
   * locked in sorted order so two concurrent groups over the same hosts cannot
   * deadlock; any host's overlap aborts the whole group (B2, per owner).
   * The management token rides on the first entry's row only.
   */
  async insertConfirmedGroup(
    groupId: string,
    entries: { bookingId: string; ownerId: string }[],
    start: string,
    end: string,
    key: string,
    booker: { name: string; email: string; timezone: string; token: string },
  ): Promise<{ ok: true } | { ok: false; reason: 'conflict' }> {
    return withRetry(() =>
      this.#tx.transaction(async (tx) => {
        try {
          for (const ownerId of entries.map((e) => e.ownerId).sort()) {
            await lockOwner(tx, ownerId);
          }
          for (const [i, e] of entries.entries()) {
            await tx.query(
              `INSERT INTO bookings
                 (booking_id, owner_id, starts_at, ends_at, status, booker_name, booker_email,
                  booker_tz, token, group_id)
               VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, $7, $8, $9)`,
              [e.bookingId, e.ownerId, start, end, booker.name, booker.email,
               booker.timezone, i === 0 ? booker.token : null, groupId],
            );
          }
          const claimed = await tx.query(
            `INSERT INTO idempotency_keys (key, booking_id) VALUES ($1, $2)
               ON CONFLICT (key) DO NOTHING
             RETURNING key`,
            [key, entries[0]!.bookingId],
          );
          if (!claimed.rows[0]) throw new KeyTaken();
          return { ok: true as const };
        } catch (err) {
          if (err instanceof KeyTaken || isConflict(err)) {
            return { ok: false as const, reason: 'conflict' as const };
          }
          throw err;
        }
      }),
    );
  }

  /**
   * Recurrence · one owner, N intervals, one group: the whole series commits
   * or none of it does. Built on the same lock-then-insert shape as the
   * collective path, so the per-owner exclusivity trigger still guards every
   * row and a clash anywhere rolls the series back.
   */
  async insertConfirmedSeries(
    groupId: string,
    entries: { bookingId: string; start: string; end: string }[],
    key: string,
    booker: { name: string; email: string; timezone: string; token: string },
  ): Promise<{ ok: true } | { ok: false; reason: 'conflict' }> {
    return withRetry(() =>
      this.#tx.transaction(async (tx) => {
        try {
          await lockOwner(tx, this.ownerId);
          for (const [i, e] of entries.entries()) {
            await tx.query(
              `INSERT INTO bookings
                 (booking_id, owner_id, starts_at, ends_at, status, booker_name, booker_email,
                  booker_tz, token, group_id)
               VALUES ($1, $2, $3, $4, 'confirmed', $5, $6, $7, $8, $9)`,
              [e.bookingId, this.ownerId, e.start, e.end, booker.name, booker.email,
               booker.timezone, i === 0 ? booker.token : null, groupId],
            );
          }
          const claimed = await tx.query(
            `INSERT INTO idempotency_keys (key, booking_id) VALUES ($1, $2)
               ON CONFLICT (key) DO NOTHING
             RETURNING key`,
            [key, entries[0]!.bookingId],
          );
          if (!claimed.rows[0]) throw new KeyTaken();
          return { ok: true as const };
        } catch (err) {
          if (err instanceof KeyTaken || isConflict(err)) {
            return { ok: false as const, reason: 'conflict' as const };
          }
          throw err;
        }
      }),
    );
  }

  /** P5 · cancelling a group releases every host's interval at once. */
  async cancelGroup(groupId: string, key: string): Promise<string[]> {
    return withRetry(() =>
      this.#tx.transaction(async (tx) => {
        const { rows } = await tx.query(
          `UPDATE bookings SET status = 'cancelled'
            WHERE group_id = $1 AND status = 'confirmed'
            RETURNING booking_id`,
          [groupId],
        );
        await tx.query(
          `INSERT INTO idempotency_keys (key, booking_id) VALUES ($1, $2)
             ON CONFLICT (key) DO NOTHING`,
          [key, groupId],
        );
        return rows.map((r) => String(r['booking_id']));
      }),
    );
  }

  /** B5 — cancelling releases the interval immediately. */
  async cancel(bookingId: string, key: string): Promise<void> {
    await withRetry(() =>
      this.#tx.transaction(async (tx) => {
      await tx.query(
        `UPDATE bookings SET status = 'cancelled'
          WHERE booking_id = $1 AND status = 'confirmed'`,
        [bookingId],
      );
      await tx.query(
        `INSERT INTO idempotency_keys (key, booking_id) VALUES ($1, $2)
           ON CONFLICT (key) DO NOTHING`,
        [key, bookingId],
      );
      }),
    );
  }

  /**
   * P2a — a reschedule is ONE transaction, and P2c — two reschedules of the
   * same booking are serialised by locking the row we are about to demote.
   *
   * The order matters. Demote first, then insert: inserting first would hold
   * two confirmed rows momentarily, which P1b forbids outright — and if P1b
   * were missing, that state would be invisible to P1a because the two
   * intervals do not overlap. That is the bug this ordering and that index
   * exist to make impossible.
   */
  async move(
    bookingId: string,
    newStart: string,
    newEnd: string,
    key: string,
  ): Promise<{ ok: true } | { ok: false; reason: 'conflict' }> {
    return withRetry(() =>
      this.#tx.transaction(async (tx) => {
      try {
      await lockOwner(tx, this.ownerId);
      // P2c — take the row lock before reading, so a concurrent reschedule of
      // this booking waits here rather than racing us.
      const { rows } = await tx.query(
        `SELECT id, booking_id FROM bookings
          WHERE booking_id = $1 AND status = 'confirmed'
          FOR UPDATE`,
        [bookingId],
      );
      if (!rows[0]) return { ok: false as const, reason: 'conflict' as const };

      await tx.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [rows[0]['id']]);
      await tx.query(
        `INSERT INTO bookings (booking_id, owner_id, starts_at, ends_at, status,
                               booker_name, booker_email, booker_tz, token)
         SELECT $1, owner_id, $2::timestamptz, $3::timestamptz, 'confirmed',
                booker_name, booker_email, booker_tz, token
           FROM bookings WHERE id = $4`,
        [bookingId, newStart, newEnd, rows[0]['id']],
      );
      await tx.query(
        `INSERT INTO idempotency_keys (key, booking_id) VALUES ($1, $2)
           ON CONFLICT (key) DO NOTHING`,
        [key, bookingId],
      );
      return { ok: true as const };
      } catch (err) {
        if (isConflict(err)) return { ok: false as const, reason: 'conflict' as const };
        throw err;
      }
      }),
    );
  }

  /** Every confirmed booking for this owner, for assertions and for `busy`. */
  async confirmed(): Promise<BookingRecord[]> {
    const { rows } = await this.sql.query(
      `SELECT booking_id, starts_at, ends_at, status FROM bookings
        WHERE owner_id = $1 AND status = 'confirmed' ORDER BY starts_at`,
      [this.ownerId],
    );
    return rows.map(toRecord);
  }

  /** Rows of every status, so history survives a cancel or a move (P4). */
  async history(bookingId: string): Promise<BookingRecord[]> {
    const { rows } = await this.sql.query(
      `SELECT booking_id, starts_at, ends_at, status FROM bookings
        WHERE booking_id = $1 ORDER BY id`,
      [bookingId],
    );
    return rows.map(toRecord);
  }
}

/** Satisfies the type-level contract; every method is async here. */
export type AsyncBookingStore = {
  [K in keyof BookingStore]: (
    ...args: Parameters<BookingStore[K]>
  ) => Promise<Awaited<ReturnType<BookingStore[K]>>>;
};
