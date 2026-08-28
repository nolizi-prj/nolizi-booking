/**
 * SPEC-0001 §4 — compute_slots.
 *
 * A pure function of its arguments, including the clock. No ambient time, no
 * ambient timezone, no I/O. Same request in, byte-identical response out (S12).
 */

import { Temporal } from '@js-temporal/polyfill';
import {
  DEFAULTS,
  type ComputeSlotsRequest,
  type ComputeSlotsResponse,
  type Diagnostic,
  type Interval,
  type LocalDate,
  type LocalWindow,
  type Slot,
} from './types.ts';
import {
  candidateLocalDates,
  materializeWindow,
  ownerLocalDate,
  weekdayOf,
  type MaterializedWindow,
} from './zone.ts';

const MINUTE = 60_000_000_000n; // nanoseconds

const ns = (i: Temporal.Instant) => i.epochNanoseconds;
const inst = (s: string) => Temporal.Instant.from(s);
const minutes = (n: number) => BigInt(n) * MINUTE;

function overlaps(aStart: bigint, aEnd: bigint, bStart: bigint, bEnd: bigint): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function computeSlots(request: ComputeSlotsRequest): ComputeSlotsResponse {
  const tz = request.owner_timezone;
  const duration = request.duration_minutes;
  const granularity = request.granularity_minutes;

  if (!Number.isInteger(duration) || duration <= 0) {
    throw new RangeError('duration_minutes must be an integer > 0');
  }
  if (!Number.isInteger(granularity) || granularity <= 0) {
    throw new RangeError('granularity_minutes must be an integer > 0');
  }

  const bufferBefore = request.buffer_before_minutes ?? DEFAULTS.buffer_before_minutes;
  const bufferAfter = request.buffer_after_minutes ?? DEFAULTS.buffer_after_minutes;
  const minimumNotice = request.minimum_notice_minutes ?? DEFAULTS.minimum_notice_minutes;
  const horizonDays = request.maximum_horizon_days ?? DEFAULTS.maximum_horizon_days;
  const maxPerDay = request.max_bookings_per_day ?? DEFAULTS.max_bookings_per_day;
  const perDate = request.bookings_per_local_date ?? {};
  const maxSpanDays = request.max_query_span_days ?? DEFAULTS.max_query_span_days;

  const now = inst(request.now);
  const queryFrom = inst(request.query.from);
  const queryTo = inst(request.query.to);

  const diagnostics: Diagnostic[] = [];

  // S14 · Query span is bounded. Return no slots and say so. Do NOT clamp:
  // a quietly truncated range is a truthful-looking answer to a question the
  // caller did not ask.
  const spanNs = ns(queryTo) - ns(queryFrom);
  if (spanNs > BigInt(maxSpanDays) * 24n * 60n * MINUTE) {
    return {
      slots: [],
      diagnostics: [
        {
          code: 'QUERY_RANGE_TOO_LARGE',
          detail: `query span exceeds max_query_span_days (${maxSpanDays})`,
        },
      ],
    };
  }

  // S11 · A date override replaces that date's weekly rules entirely. It does
  // not merge, and `windows: []` means unavailable.
  const overrides = new Map<LocalDate, LocalWindow[]>();
  for (const o of request.date_overrides ?? []) overrides.set(o.date, o.windows);

  // Busy intervals, normalised. Zero-length intervals are ignored (§3.1).
  const busy: Array<[bigint, bigint]> = [];
  for (const b of request.busy ?? []) {
    const s = ns(inst(b.start));
    const e = ns(inst(b.end));
    if (e > s) busy.push([s, e]);
  }

  const noticeFloor = ns(now) + minutes(minimumNotice);
  const horizonCeiling = ns(now) + BigInt(horizonDays) * 24n * 60n * MINUTE;

  const dates = candidateLocalDates(tz, queryFrom, queryTo);
  const seenDiagnosticDates = new Set<string>();
  const slots: Slot[] = [];

  for (const date of dates) {
    const windowsForDate: LocalWindow[] = overrides.has(date)
      ? overrides.get(date)!
      : request.availability
          .filter((rule) => rule.weekday === weekdayOf(date))
          .map((rule) => ({ start: rule.start, end: rule.end }));

    for (const w of windowsForDate) {
      const result = materializeWindow(tz, date, w.start, w.end);

      if (!result.ok) {
        // S3 · A window whose start does not exist is SKIPPED, loudly. It is
        // not silently shifted forward — silence here is how this bug reaches
        // production. The same treatment is given to a nonexistent end.
        const key = `${date}:${result.reason}`;
        if (!seenDiagnosticDates.has(key)) {
          seenDiagnosticDates.add(key);
          diagnostics.push({
            code: 'NONEXISTENT_LOCAL_TIME',
            detail:
              result.reason === 'nonexistent_start'
                ? `local start time ${w.start} does not occur on ${date} in ${tz}; window skipped`
                : `local end time ${w.end} does not occur at or after the window start on ${date} in ${tz}; window skipped`,
            date,
          });
        }
        continue;
      }

      const window = result.window;

      if (window.ambiguousStart) {
        // S4 · The hour occurs twice and both occurrences are bookable. The
        // window simply spans three absolute hours rather than two.
        const key = `${date}:ambiguous`;
        if (!seenDiagnosticDates.has(key)) {
          seenDiagnosticDates.add(key);
          diagnostics.push({
            code: 'AMBIGUOUS_LOCAL_TIME',
            detail: `local time ${w.start} occurs twice on ${date} in ${tz}; both occurrences are bookable`,
            date,
          });
        }
      }

      collectCandidates(window);
    }
  }

  // Slots sorted ascending by start, then end. They may overlap each other when
  // granularity < duration — they are candidates, not a partition (§3.2).
  slots.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : 0));

  // S9 · Daily cap, counted on the OWNER'S local date. Not UTC's, not the
  // requester's. Applied after generation so the date is derived from the slot.
  const capped =
    maxPerDay == null
      ? slots
      : slots.filter((s) => (perDate[ownerLocalDate(tz, inst(s.start))] ?? 0) < maxPerDay);

  return { slots: capped, diagnostics };

  function collectCandidates(window: MaterializedWindow): void {
    const windowStart = ns(window.start);
    const windowEnd = ns(window.end);
    const step = minutes(granularity);
    const length = minutes(duration);

    // S5 · Starts are window_start + k × granularity in ABSOLUTE time, kept
    // only while start + duration <= window_end. Slots never spill past a
    // window.
    for (let start = windowStart; start + length <= windowEnd; start += step) {
      const end = start + length;

      // S7 · Minimum notice, measured from `now`.
      if (start < noticeFloor) continue;
      // S8 · Horizon, absolute rather than calendar-local.
      if (start > horizonCeiling) continue;
      // S10 · Query clamping. Half-open, both ends.
      if (start < ns(queryFrom) || end > ns(queryTo)) continue;

      // S6 · Buffers are evaluated against busy intervals ONLY, never against
      // window boundaries. A slot flush against the end of the day is bookable
      // even though its trailing buffer extends past it.
      const guardedStart = start - minutes(bufferBefore);
      const guardedEnd = end + minutes(bufferAfter);
      let blocked = false;
      for (const [bs, be] of busy) {
        if (overlaps(guardedStart, guardedEnd, bs, be)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      slots.push({
        start: new Temporal.Instant(start).toString(),
        end: new Temporal.Instant(end).toString(),
      });
    }
  }
}

export type { Interval };
