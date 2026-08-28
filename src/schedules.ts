/**
 * SPEC-0002 F1 — the bridge from stored schedule to engine call.
 *
 * This file loads rules and busy intervals and hands them to the engine. It
 * performs NO arithmetic on times: no adjusting, no shifting, no deciding
 * availability. Where it is tempted to, that is a defect in the engine's
 * interface (SPEC.md §1).
 */

import { computeSlots } from '@pumasi/scheduling-core';
import type {
  ComputeSlotsResponse,
  AvailabilityRule,
  DateOverride,
  Interval,
  Weekday,
} from '@pumasi/scheduling-core';
import type { SqlClient } from './store.ts';

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
    `SELECT sc.schedule_id, sc.owner_id, sc.slug, sc.title, o.timezone AS owner_timezone,
            sc.duration_minutes, sc.granularity_minutes, sc.buffer_before_minutes,
            sc.buffer_after_minutes, sc.minimum_notice_minutes, sc.maximum_horizon_days,
            sc.max_bookings_per_day
       FROM schedules sc JOIN owners o ON o.owner_id = sc.owner_id
      WHERE sc.slug = $1`,
    [slug],
  );
  const r = rows[0];
  if (!r) return undefined;
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
    max_bookings_per_day:
      r['max_bookings_per_day'] === null ? null : n(r['max_bookings_per_day']),
  };
}

export async function findScheduleById(
  sql: SqlClient,
  scheduleId: string,
): Promise<Schedule | undefined> {
  const { rows } = await sql.query(
    `SELECT sc.schedule_id, sc.owner_id, sc.slug, sc.title, o.timezone AS owner_timezone,
            sc.duration_minutes, sc.granularity_minutes, sc.buffer_before_minutes,
            sc.buffer_after_minutes, sc.minimum_notice_minutes, sc.maximum_horizon_days,
            sc.max_bookings_per_day
       FROM schedules sc JOIN owners o ON o.owner_id = sc.owner_id
      WHERE sc.schedule_id = $1`,
    [scheduleId],
  );
  const r = rows[0];
  if (!r) return undefined;
  return {
    schedule_id: s(r['schedule_id']), owner_id: s(r['owner_id']), slug: s(r['slug']),
    title: s(r['title']), owner_timezone: s(r['owner_timezone']),
    duration_minutes: n(r['duration_minutes']), granularity_minutes: n(r['granularity_minutes']),
    buffer_before_minutes: n(r['buffer_before_minutes']),
    buffer_after_minutes: n(r['buffer_after_minutes']),
    minimum_notice_minutes: n(r['minimum_notice_minutes']),
    maximum_horizon_days: n(r['maximum_horizon_days']),
    max_bookings_per_day: r['max_bookings_per_day'] === null ? null : n(r['max_bookings_per_day']),
  };
}

async function loadRules(sql: SqlClient, scheduleId: string): Promise<AvailabilityRule[]> {
  const { rows } = await sql.query(
    `SELECT weekday, starts_local, ends_local FROM availability_rules
      WHERE schedule_id = $1 ORDER BY weekday, starts_local`,
    [scheduleId],
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
async function loadOverrides(sql: SqlClient, scheduleId: string): Promise<DateOverride[]> {
  const { rows } = await sql.query(
    `SELECT local_date, starts_local, ends_local FROM date_overrides
      WHERE schedule_id = $1 ORDER BY local_date, starts_local`,
    [scheduleId],
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

/** S9 · Counts per OWNER-local date. The owner's date, not UTC's, not the booker's. */
async function loadDailyCounts(
  sql: SqlClient,
  ownerId: string,
  timezone: string,
): Promise<Record<string, number>> {
  const { rows } = await sql.query(
    `SELECT to_char(starts_at AT TIME ZONE $2, 'YYYY-MM-DD') AS d, count(*)::int AS c
       FROM bookings WHERE owner_id = $1 AND status = 'confirmed'
      GROUP BY 1`,
    [ownerId, timezone],
  );
  return Object.fromEntries(rows.map((r) => [s(r['d']), n(r['c'])]));
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
): Promise<ComputeSlotsResponse> {
  const [availability, dateOverrides, busy, counts] = await Promise.all([
    loadRules(sql, schedule.schedule_id),
    loadOverrides(sql, schedule.schedule_id),
    loadBusy(sql, schedule.owner_id),
    loadDailyCounts(sql, schedule.owner_id, schedule.owner_timezone),
  ]);

  return computeSlots({
    owner_timezone: schedule.owner_timezone,
    availability,
    date_overrides: dateOverrides,
    busy,
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
