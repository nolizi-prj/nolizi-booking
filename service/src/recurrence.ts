/**
 * Recurring bookings — RFC 5545 expansion, done by the standard's own library.
 *
 * DUPLICATION.md §5.1 forbids hand-rolling an RRULE expander, and rightly: the
 * rule language has corners nobody guesses correctly. So `rrule` decides WHICH
 * occurrences exist, and this file decides WHEN each one happens — because the
 * two questions have different right answers.
 *
 * The split matters at a DST boundary. "Every Monday at 09:00" means 09:00 in
 * the owner's calendar, on both sides of a clock change, which is not the same
 * as "every 168 hours". So the rule is expanded over LOCAL wall time, and each
 * occurrence is then mapped back to an instant in the owner's zone. An
 * occurrence whose local time does not exist that day (the spring-forward gap)
 * is reported rather than silently shifted; the booking path refuses the series
 * instead of quietly moving someone's meeting.
 */

import { Temporal } from '@js-temporal/polyfill';
// `rrule` ships both a CommonJS and an ESM build, and the two runtimes this
// file must serve resolve DIFFERENT ones: Node picks CJS (so a named import
// fails — its exports are not statically detectable), while wrangler's esbuild
// picks ESM (so a default import fails — there is no default). A namespace
// import is legal against both; the function is then read from whichever shape
// arrived. Getting this wrong breaks one runtime silently while the other
// passes its tests, which is exactly what happened once.
import * as rruleNs from 'rrule';
// Reflect.get keeps the CommonJS compatibility path runtime-only. Directly
// spelling `rruleNs.default` makes esbuild warn while bundling the ESM build,
// even though Node needs that property when it loads rrule's CommonJS entry.
const rruleDefault = Reflect.get(rruleNs, 'default') as
  | { rrulestr?: typeof import('rrule').rrulestr }
  | undefined;
const rrulestr: typeof import('rrule').rrulestr =
  (rruleNs as { rrulestr?: typeof import('rrule').rrulestr }).rrulestr ??
  rruleDefault?.rrulestr ??
  (() => { throw new Error('rrule did not expose rrulestr'); })();

export interface Occurrence {
  start: string;
  end: string;
}

export interface ExpansionResult {
  occurrences: Occurrence[];
  /** Local times the rule asked for that do not exist in the owner's zone. */
  skipped: string[];
}

/** A sane ceiling: a booker may not create an unbounded series in one click. */
export const MAX_OCCURRENCES = 12;

/**
 * Expand `rule` from `firstStart`, keeping the owner-local wall time of the
 * first occurrence. `firstStart` is an instant; everything else is calendar
 * arithmetic in `timezone`.
 */
export function expandRecurrence(opts: {
  rule: string;
  firstStart: string;
  durationMinutes: number;
  timezone: string;
  max?: number;
}): ExpansionResult {
  const max = Math.min(opts.max ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const local = Temporal.Instant.from(opts.firstStart).toZonedDateTimeISO(opts.timezone);
  const wall = local.toPlainDateTime();

  // rrule works in JS Dates. Feeding it the wall-clock components as if they
  // were UTC makes it a floating-time expander, which is exactly what we want:
  // no zone maths happens inside it, so none of it can be wrong.
  const dtstart = new Date(Date.UTC(
    wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0, 0,
  ));
  const parsed = rrulestr(opts.rule.startsWith('RRULE:') ? opts.rule : `RRULE:${opts.rule}`, {
    dtstart,
  });

  const occurrences: Occurrence[] = [];
  const skipped: string[] = [];
  for (const d of parsed.all((_, i) => i < max)) {
    const plain = Temporal.PlainDateTime.from({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
    });
    // 'reject' rather than 'compatible': a meeting silently moved by an hour is
    // the bug this project exists to not have.
    let zoned: Temporal.ZonedDateTime;
    try {
      zoned = plain.toZonedDateTime(opts.timezone, { disambiguation: 'reject' });
    } catch {
      skipped.push(plain.toString());
      continue;
    }
    const start = zoned.toInstant();
    occurrences.push({
      start: start.toString(),
      end: start.add({ minutes: opts.durationMinutes }).toString(),
    });
  }
  return { occurrences, skipped };
}

/** Plain-language description of a rule, for the booking page. */
export function describeRecurrence(rule: string): string {
  try {
    const r = rrulestr(rule.startsWith('RRULE:') ? rule : `RRULE:${rule}`, {
      dtstart: new Date(Date.UTC(2026, 0, 5, 9, 0, 0)),
    });
    return r.toText();
  } catch {
    return rule;
  }
}

/** Refuse a rule we cannot parse, rather than storing something unusable. */
export function isValidRecurrence(rule: string): boolean {
  try {
    const r = rrulestr(rule.startsWith('RRULE:') ? rule : `RRULE:${rule}`, {
      dtstart: new Date(Date.UTC(2026, 0, 5, 9, 0, 0)),
    });
    return r.all((_, i) => i < 2).length > 0;
  } catch {
    return false;
  }
}
