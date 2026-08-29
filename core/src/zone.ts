/**
 * SPEC-0001 S1–S4 — turning local wall-clock windows into absolute intervals.
 *
 * This file is where scheduling software usually goes wrong, so each function
 * states which clause it implements and what the alternative mistake would be.
 */

import { Temporal } from '@js-temporal/polyfill';
import type { LocalDate, LocalTime } from './types.ts';

export type WallTime =
  | { kind: 'normal'; instant: Temporal.Instant }
  /** Occurs twice (fall back). `instant` is the EARLIER occurrence, per S1. */
  | { kind: 'ambiguous'; instant: Temporal.Instant; second: Temporal.Instant }
  /** Never occurs (spring forward). S3: skip the window, say so, do not shift. */
  | { kind: 'nonexistent' };

/**
 * Classify a local wall time in a zone.
 *
 * The trap: `earlier` and `later` disagree for BOTH a gap and an ambiguity, and
 * `disambiguation: 'reject'` throws for both, so neither distinguishes them.
 * The only thing that does is asking whether the result actually has the local
 * time we requested — for an ambiguity it does, for a gap it cannot.
 */
export function classifyWallTime(
  timezone: string,
  date: LocalDate,
  time: LocalTime,
): WallTime {
  const plain = Temporal.PlainDateTime.from(`${date}T${time}:00`);
  const earlier = plain.toZonedDateTime(timezone, { disambiguation: 'earlier' });
  const later = plain.toZonedDateTime(timezone, { disambiguation: 'later' });

  if (earlier.epochNanoseconds === later.epochNanoseconds) {
    return { kind: 'normal', instant: earlier.toInstant() };
  }
  // Compare the WHOLE local date-time, not just the clock face. A zone that
  // skips an entire calendar day (Pacific/Apia, 2011-12-30) resolves to the
  // same wall time on a DIFFERENT date, so an HH:MM comparison reads a
  // nonexistent day as an ambiguous hour and offers slots that never occur.
  if (earlier.toPlainDateTime().equals(plain)) {
    return {
      kind: 'ambiguous',
      instant: earlier.toInstant(),
      second: later.toInstant(),
    };
  }
  return { kind: 'nonexistent' };
}

export interface MaterializedWindow {
  start: Temporal.Instant;
  end: Temporal.Instant;
  /** The window's start was ambiguous — both occurrences are bookable (S4). */
  ambiguousStart: boolean;
}

export type MaterializeResult =
  | { ok: true; window: MaterializedWindow }
  | { ok: false; reason: 'nonexistent_start' | 'nonexistent_end' };

/**
 * S1 · A local window [S, E) on local date D materializes to the absolute
 * interval starting at the EARLIEST instant on D whose local time is S, and
 * ending at the FIRST INSTANT AT OR AFTER THAT START whose local time is E.
 *
 * S2 and S4 fall out of this without special cases: a window spanning the
 * spring-forward gap is two absolute hours, not three; a window containing the
 * repeated fall-back hour is three, not two. Nothing below special-cases either.
 *
 * "First instant at or after the start" also gives overnight windows
 * (22:00–02:00) for free: E simply resolves on the following local date.
 */
export function materializeWindow(
  timezone: string,
  date: LocalDate,
  startTime: LocalTime,
  endTime: LocalTime,
): MaterializeResult {
  const start = classifyWallTime(timezone, date, startTime);
  if (start.kind === 'nonexistent') return { ok: false, reason: 'nonexistent_start' };

  const startInstant = start.instant;

  // The end is the first occurrence of E at or after the start — same local
  // date if that lands at or after it, otherwise the next one.
  const sameDay = classifyWallTime(timezone, date, endTime);
  let endInstant: Temporal.Instant | null = null;

  if (sameDay.kind !== 'nonexistent') {
    const candidates =
      sameDay.kind === 'ambiguous' ? [sameDay.instant, sameDay.second] : [sameDay.instant];
    for (const c of candidates) {
      if (Temporal.Instant.compare(c, startInstant) >= 0) {
        endInstant = c;
        break;
      }
    }
  }

  if (endInstant === null) {
    // The next local date, for overnight windows. An ambiguous end here has two
    // occurrences and we want the first one at or after the start, exactly as
    // on the same day — taking `instant` unconditionally would pick an end
    // BEFORE the start and yield a silently empty window.
    const nextDate = Temporal.PlainDate.from(date).add({ days: 1 }).toString();
    const next = classifyWallTime(timezone, nextDate, endTime);
    if (next.kind !== 'nonexistent') {
      const candidates = next.kind === 'ambiguous' ? [next.instant, next.second] : [next.instant];
      for (const c of candidates) {
        if (Temporal.Instant.compare(c, startInstant) >= 0) {
          endInstant = c;
          break;
        }
      }
    }
    if (endInstant === null) return { ok: false, reason: 'nonexistent_end' };
  }

  // A window that does not advance is malformed, not empty. Returning it would
  // produce zero slots with no diagnostic, which is indistinguishable from a
  // day that is legitimately fully booked.
  if (Temporal.Instant.compare(endInstant, startInstant) <= 0) {
    return { ok: false, reason: 'nonexistent_end' };
  }

  return {
    ok: true,
    window: {
      start: startInstant,
      end: endInstant,
      ambiguousStart: start.kind === 'ambiguous',
    },
  };
}

/** The owner-local calendar date an instant falls on. S9 counts on this date. */
export function ownerLocalDate(timezone: string, instant: Temporal.Instant): LocalDate {
  return instant.toZonedDateTimeISO(timezone).toPlainDate().toString();
}

const WEEKDAY_CODES = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;

/** ISO weekday (1 = Monday) as the two-letter code the spec uses. */
export function weekdayOf(date: LocalDate): (typeof WEEKDAY_CODES)[number] {
  const dow = Temporal.PlainDate.from(date).dayOfWeek; // 1..7, Monday = 1
  return WEEKDAY_CODES[dow - 1]!;
}

/**
 * Every owner-local date that could contribute a window to the query, with a
 * day of margin either side. Margin matters: an owner-local day can begin
 * before the query window opens in UTC (Sydney, Kiritimati) and a window can
 * run past local midnight.
 */
export function candidateLocalDates(
  timezone: string,
  from: Temporal.Instant,
  to: Temporal.Instant,
): LocalDate[] {
  const first = Temporal.PlainDate.from(ownerLocalDate(timezone, from)).subtract({ days: 1 });
  const last = Temporal.PlainDate.from(ownerLocalDate(timezone, to)).add({ days: 1 });
  const dates: LocalDate[] = [];
  for (let d = first; Temporal.PlainDate.compare(d, last) <= 0; d = d.add({ days: 1 })) {
    dates.push(d.toString());
  }
  return dates;
}
