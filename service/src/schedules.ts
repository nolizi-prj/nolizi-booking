/**
 * SPEC-0002 F1 — the bridge from stored schedule to engine call.
 *
 * This file loads rules and busy intervals and hands them to the engine. It
 * performs NO arithmetic on times: no adjusting, no shifting, no deciding
 * availability. Where it is tempted to, that is a defect in the engine's
 * interface (SPEC.md §1).
 */

import { Temporal } from '@js-temporal/polyfill';
import { computeSlots } from '@pumasi/booking-core';
import type {
  ComputeSlotsResponse,
  AvailabilityRule,
  DateOverride,
  Interval,
  Weekday,
} from '@pumasi/booking-core';
import type { SqlClient } from './store.ts';

export type LocationKind = 'custom' | 'phone' | 'in_person' | 'meet';

export interface Schedule {
  schedule_id: string;
  owner_id: string;
  slug: string;
  title: string;
  owner_timezone: string;
  duration_minutes: number;
  granularity_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  maximum_horizon_days: number;
  max_bookings_per_day: number | null;
  /** P2 · the named availability set this event type draws hours from. */
  availability_set_id: string | null;
  description: string | null;
  color: string | null;
  location_kind: LocationKind;
  location_value: string | null;
  /** P2 · optional fixed date range (owner-local dates, inclusive). */
  available_from: string | null;
  available_until: string | null;
}

const SCHEDULE_COLS = `sc.schedule_id, sc.owner_id, sc.slug, sc.title, o.timezone AS owner_timezone,
            sc.duration_minutes, sc.granularity_minutes, sc.buffer_before_minutes,
            sc.buffer_after_minutes, sc.minimum_notice_minutes, sc.maximum_horizon_days,
            sc.max_bookings_per_day, sc.availability_set_id, sc.description, sc.color,
            sc.location_kind, sc.location_value, sc.available_from, sc.available_until`;

function toSchedule(r: Record<string, unknown>): Schedule {
  const opt = (v: unknown) => (v === null || v === undefined ? null : s(v));
  return {
    schedule_id: s(r['schedule_id']),
    owner_id: s(r['owner_id']),
    slug: s(r['slug']),
    title: s(r['title']),
    owner_timezone: s(r['owner_timezone']),
    duration_minutes: n(r['duration_minutes']),
    granularity_minutes: n(r['granularity_minutes']),
    buffer_before_minutes: n(r['buffer_before_minutes']),
    buffer_after_minutes: n(r['buffer_after_minutes']),
    minimum_notice_minutes: n(r['minimum_notice_minutes']),
    maximum_horizon_days: n(r['maximum_horizon_days']),
    max_bookings_per_day: r['max_bookings_per_day'] === null ? null : n(r['max_bookings_per_day']),
    availability_set_id: opt(r['availability_set_id']),
    description: opt(r['description']),
    color: opt(r['color']),
    location_kind: (opt(r['location_kind']) ?? 'custom') as LocationKind,
    location_value: opt(r['location_value']),
    available_from: opt(r['available_from']),
    available_until: opt(r['available_until']),
  };
}

const s = (v: unknown) => String(v);
const n = (v: unknown) => Number(v);
const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString().replace('.000Z', 'Z') : String(v);

export async function findScheduleBySlug(
  sql: SqlClient,
  slug: string,
): Promise<Schedule | undefined> {
  const { rows } = await sql.query(
    `SELECT ${SCHEDULE_COLS}
       FROM schedules sc JOIN owners o ON o.owner_id = sc.owner_id
      WHERE sc.slug = $1`,
    [slug],
  );
  return rows[0] ? toSchedule(rows[0]) : undefined;
}

/** P2 · /:owner/:event — the parity route. */
export async function findScheduleByOwnerSlug(
  sql: SqlClient,
  linkSlug: string,
  eventSlug: string,
): Promise<Schedule | undefined> {
  const { rows } = await sql.query(
    `SELECT ${SCHEDULE_COLS}
       FROM schedules sc JOIN owners o ON o.owner_id = sc.owner_id
      WHERE o.link_slug = $1 AND sc.slug = $2`,
    [linkSlug, eventSlug],
  );
  return rows[0] ? toSchedule(rows[0]) : undefined;
}

export async function findScheduleById(
  sql: SqlClient,
  scheduleId: string,
): Promise<Schedule | undefined> {
  const { rows } = await sql.query(
    `SELECT ${SCHEDULE_COLS}
       FROM schedules sc JOIN owners o ON o.owner_id = sc.owner_id
      WHERE sc.schedule_id = $1`,
    [scheduleId],
  );
  return rows[0] ? toSchedule(rows[0]) : undefined;
}

/** Hours come from the event type's availability SET (P2); the legacy
 *  schedule-keyed rows still answer for event types never migrated to one. */
async function loadRules(sql: SqlClient, schedule: Schedule): Promise<AvailabilityRule[]> {
  const { rows } = schedule.availability_set_id
    ? await sql.query(
        `SELECT weekday, starts_local, ends_local FROM set_rules
          WHERE set_id = $1 ORDER BY weekday, starts_local`,
        [schedule.availability_set_id],
      )
    : await sql.query(
        `SELECT weekday, starts_local, ends_local FROM availability_rules
          WHERE schedule_id = $1 ORDER BY weekday, starts_local`,
        [schedule.schedule_id],
      );
  return rows.map((r) => ({
    weekday: s(r['weekday']) as Weekday,
    start: s(r['starts_local']),
    end: s(r['ends_local']),
  }));
}

/**
 * S11 · An override replaces that local date's weekly rules entirely. A date
 * present with no windows means unavailable — which is why the rows are grouped
 * by date rather than filtered to non-null.
 */
async function loadOverrides(sql: SqlClient, schedule: Schedule): Promise<DateOverride[]> {
  const { rows } = schedule.availability_set_id
    ? await sql.query(
        `SELECT local_date, starts_local, ends_local FROM set_overrides
          WHERE set_id = $1 ORDER BY local_date, starts_local`,
        [schedule.availability_set_id],
      )
    : await sql.query(
        `SELECT local_date, starts_local, ends_local FROM date_overrides
          WHERE schedule_id = $1 ORDER BY local_date, starts_local`,
        [schedule.schedule_id],
      );
  const byDate = new Map<string, { start: string; end: string }[]>();
  for (const r of rows) {
    const date = iso(r['local_date']).slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    if (r['starts_local'] !== null && r['ends_local'] !== null) {
      byDate.get(date)!.push({ start: s(r['starts_local']), end: s(r['ends_local']) });
    }
  }
  return [...byDate.entries()].map(([date, windows]) => ({ date, windows }));
}

/** Confirmed bookings become busy intervals. Cancelled ones do not (B5). */
async function loadBusy(sql: SqlClient, ownerId: string): Promise<Interval[]> {
  const { rows } = await sql.query(
    `SELECT starts_at, ends_at FROM bookings
      WHERE owner_id = $1 AND status = 'confirmed' ORDER BY starts_at`,
    [ownerId],
  );
  return rows.map((r) => ({ start: iso(r['starts_at']), end: iso(r['ends_at']) }));
}

/**
 * S9 · Counts per OWNER-local date. The owner's date, not UTC's, not the
 * booker's. The UTC→local conversion happens here in Temporal rather than in
 * SQL: `AT TIME ZONE` is PostgreSQL-only and broke the SQLite deployment the
 * first time a page was viewed. One dialect-neutral query, one converter.
 */
function dailyCounts(busy: Interval[], timezone: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const b of busy) {
    const d = Temporal.Instant.from(b.start).toZonedDateTimeISO(timezone).toPlainDate().toString();
    counts[d] = (counts[d] ?? 0) + 1;
  }
  return counts;
}

/** P2 · what "where" means for an event type, rendered for people. */
export function locationText(schedule: Schedule, meetUrl?: string): string | undefined {
  switch (schedule.location_kind) {
    case 'phone':
      return schedule.location_value ? `Phone — ${schedule.location_value}` : 'Phone call';
    case 'in_person':
      return schedule.location_value ?? undefined;
    case 'meet':
      return meetUrl ?? 'Google Meet — link arrives with the confirmation';
    default:
      return schedule.location_value ?? undefined;
  }
}

export interface SlotQuery {
  from: string;
  to: string;
  now: string;
}

/**
 * The only place this service asks "when is this person free". Everything it
 * passes is stored data; everything it gets back is the engine's answer,
 * unmodified.
 */
export async function availableSlots(
  sql: SqlClient,
  schedule: Schedule,
  q: SlotQuery,
  /** SPEC-0003: calendar busy intervals arrive as plain intervals, nothing more. */
  externalBusy: Interval[] = [],
): Promise<ComputeSlotsResponse> {
  const [availability, dateOverrides, busy] = await Promise.all([
    loadRules(sql, schedule),
    loadOverrides(sql, schedule),
    loadBusy(sql, schedule.owner_id),
  ]);
  // Counted from the service's own bookings only — calendar busy (externalBusy)
  // blocks time but is not a booking this service took (S9).
  const counts = dailyCounts(busy, schedule.owner_timezone);

  return computeSlots({
    owner_timezone: schedule.owner_timezone,
    availability,
    date_overrides: dateOverrides,
    busy: [...busy, ...externalBusy],
    duration_minutes: schedule.duration_minutes,
    granularity_minutes: schedule.granularity_minutes,
    buffer_before_minutes: schedule.buffer_before_minutes,
    buffer_after_minutes: schedule.buffer_after_minutes,
    minimum_notice_minutes: schedule.minimum_notice_minutes,
    maximum_horizon_days: schedule.maximum_horizon_days,
    max_bookings_per_day: schedule.max_bookings_per_day,
    bookings_per_local_date: counts,
    query: { from: q.from, to: q.to },
    // P2b — the clock is supplied here. The engine never reads one.
    now: q.now,
  });
}
