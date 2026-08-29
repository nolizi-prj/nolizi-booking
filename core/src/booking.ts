/**
 * SPEC-0001 §5 — booking semantics (B1–B7).
 *
 * This module says WHAT must be true of a booking. It does not choose a store.
 * The exclusivity guarantee (B2) and the atomicity of a reschedule (B6) are
 * delegated to the store, because only the store can keep them under real
 * concurrency — an in-process check is a time-of-check-to-time-of-use race.
 * SPEC-0002 P1 supplies a PostgreSQL store whose constraints enforce both.
 */

import { Temporal } from '@js-temporal/polyfill';
import {
  type BookRequest,
  type BookResult,
  type CancelRequest,
  type CancelResult,
  type Instant,
  type RescheduleRequest,
} from './types.ts';

export interface BookingRecord {
  booking_id: string;
  start: Instant;
  end: Instant;
  status: 'confirmed' | 'cancelled';
}

/**
 * The contract a store must satisfy. Implementations are responsible for
 * atomicity: every method either completes entirely or has no effect (B4).
 */
export interface BookingStore {
  /** The booking a key was first used for, if any (B1). */
  findByIdempotencyKey(key: string): BookingRecord | undefined;
  findById(bookingId: string): BookingRecord | undefined;
  /**
   * Insert a confirmed booking, or report a conflict if any confirmed booking
   * intersects `[start, end)`. MUST be atomic with the overlap check (B2).
   */
  insertConfirmed(
    bookingId: string,
    start: Instant,
    end: Instant,
    key: string,
  ): { ok: true } | { ok: false; reason: 'conflict' };
  /** Cancel, releasing the interval immediately (B5). */
  cancel(bookingId: string, key: string): void;
  /**
   * Move a booking to a new interval, atomically. Either the booking occupies
   * the new interval and has released the old one, or nothing changed (B6).
   * A losing move reports `conflict` and leaves the booking untouched.
   */
  move(
    bookingId: string,
    newStart: Instant,
    newEnd: Instant,
    key: string,
  ): { ok: true } | { ok: false; reason: 'conflict' };
}

const inst = (s: string) => Temporal.Instant.from(s);
const cmp = Temporal.Instant.compare;
const addMinutes = (i: Temporal.Instant, m: number) => i.add({ minutes: m });

/** B5.1 · A replay reports the booking's state NOW, not a frozen response. */
function replay(existing: BookingRecord): BookResult {
  return existing.status === 'cancelled'
    ? { status: 'cancelled', booking_id: existing.booking_id }
    : { status: 'confirmed', booking_id: existing.booking_id };
}

export function book(
  store: BookingStore,
  request: BookRequest,
  newBookingId: () => string,
): BookResult {
  const start = request.slot?.start ?? request.start;
  const end = request.slot?.end ?? request.end;
  if (!start || !end) throw new RangeError('book requires start and end, or slot');

  // B1 / B5.1 — replay before anything else. A key that has been used reports
  // the state of the booking it made, including if that booking has since been
  // cancelled or moved. It does not re-reserve anything.
  const existing = store.findByIdempotencyKey(request.idempotency_key);
  if (existing) return replay(existing);

  // B3 — revalidate against the commit-time clock. A slot that was valid when
  // it was computed may not be valid now.
  const notice = request.minimum_notice_minutes ?? 0;
  if (cmp(inst(start), addMinutes(inst(request.now), notice)) < 0) {
    // B4 — a non-confirmed result leaves no trace.
    return { status: 'expired' };
  }

  const id = newBookingId();
  const inserted = store.insertConfirmed(id, start, end, request.idempotency_key);
  if (!inserted.ok) return { status: 'conflict' };
  return { status: 'confirmed', booking_id: id };
}

export function cancel(store: BookingStore, request: CancelRequest): CancelResult {
  const target = store.findById(request.booking_id);
  // B5 — cancelling something that does not exist creates nothing.
  if (!target) return { status: 'not_found' };
  // B5 — cancelling is idempotent and total. Re-cancelling is `cancelled`,
  // not an error.
  if (target.status === 'cancelled') return { status: 'cancelled' };
  store.cancel(request.booking_id, request.idempotency_key);
  return { status: 'cancelled' };
}

export function reschedule(
  store: BookingStore,
  request: RescheduleRequest,
): BookResult {
  const existingByKey = store.findByIdempotencyKey(request.idempotency_key);
  if (existingByKey) return replay(existingByKey);

  const target = store.findById(request.booking_id);
  if (!target) return { status: 'not_found' };
  if (target.status === 'cancelled') return { status: 'cancelled', booking_id: target.booking_id };

  // B7 — notice is measured against the start the booking CURRENTLY holds,
  // not the proposed one. Moving a meeting five minutes before it begins is
  // the case this forbids; the new time being far away does not excuse it.
  const notice = request.minimum_reschedule_notice_minutes ?? 0;
  if (cmp(addMinutes(inst(request.now), notice), inst(target.start)) > 0) {
    return { status: 'expired', booking_id: target.booking_id };
  }

  // B6 — atomic. A losing move returns `conflict` and leaves the booking
  // confirmed at its existing interval, unmoved and uncancelled. A failed move
  // must never degrade into a cancellation.
  const moved = store.move(
    request.booking_id,
    request.new_start,
    request.new_end,
    request.idempotency_key,
  );
  if (!moved.ok) return { status: 'conflict', booking_id: target.booking_id };
  return { status: 'confirmed', booking_id: target.booking_id };
}

/**
 * A reference store, correct by construction because JavaScript executes these
 * operations without interleaving. It is NOT evidence for B2 under real
 * concurrency — that requires a store with a constraint, and the proof lives in
 * SPEC-0002 case P-001.
 */
export class InMemoryBookingStore implements BookingStore {
  readonly #byId = new Map<string, BookingRecord>();
  readonly #byKey = new Map<string, string>();

  findByIdempotencyKey(key: string): BookingRecord | undefined {
    const id = this.#byKey.get(key);
    return id === undefined ? undefined : this.#byId.get(id);
  }

  findById(bookingId: string): BookingRecord | undefined {
    return this.#byId.get(bookingId);
  }

  insertConfirmed(bookingId: string, start: Instant, end: Instant, key: string) {
    if (this.#intersectsConfirmed(start, end, null)) {
      return { ok: false as const, reason: 'conflict' as const };
    }
    this.#byId.set(bookingId, { booking_id: bookingId, start, end, status: 'confirmed' });
    this.#rememberKey(key, bookingId);
    return { ok: true as const };
  }

  cancel(bookingId: string, key: string): void {
    const rec = this.#byId.get(bookingId);
    if (!rec) return;
    this.#byId.set(bookingId, { ...rec, status: 'cancelled' });
    this.#rememberKey(key, bookingId);
  }

  move(bookingId: string, newStart: Instant, newEnd: Instant, key: string) {
    const rec = this.#byId.get(bookingId);
    if (!rec || rec.status !== 'confirmed') {
      return { ok: false as const, reason: 'conflict' as const };
    }
    if (this.#intersectsConfirmed(newStart, newEnd, bookingId)) {
      return { ok: false as const, reason: 'conflict' as const };
    }
    this.#byId.set(bookingId, { ...rec, start: newStart, end: newEnd });
    this.#rememberKey(key, bookingId);
    return { ok: true as const };
  }

  /** Every confirmed booking, for assertions. */
  confirmed(): BookingRecord[] {
    return [...this.#byId.values()].filter((r) => r.status === 'confirmed');
  }

  all(): BookingRecord[] {
    return [...this.#byId.values()];
  }

  /**
   * First use of a key wins. Rebinding it would make a later replay report a
   * DIFFERENT booking than the one the key created, silently breaking B1 and
   * B5.1 across bookings — a cancel or a move must never steal another
   * booking's key.
   */
  #rememberKey(key: string, bookingId: string): void {
    const existing = this.#byKey.get(key);
    if (existing !== undefined && existing !== bookingId) return;
    this.#byKey.set(key, bookingId);
  }

  #intersectsConfirmed(start: Instant, end: Instant, exceptId: string | null): boolean {
    const s = inst(start);
    const e = inst(end);
    for (const rec of this.#byId.values()) {
      if (rec.status !== 'confirmed') continue;
      if (exceptId !== null && rec.booking_id === exceptId) continue;
      if (cmp(s, inst(rec.end)) < 0 && cmp(inst(rec.start), e) < 0) return true;
    }
    return false;
  }
}
