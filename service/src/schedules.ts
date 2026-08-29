/**
 * SPEC-0002 F1 — the bridge from stored schedule to engine call.
 *
 * This file loads rules and busy intervals and hands them to the engine. It
 * performs NO arithmetic on times: no adjusting, no shifting, no deciding
 * availability. Where it is tempted to, that is a defect in the engine's
 * interface (SPEC.md §1).
 */

import { Temporal } from '@js-temporal/polyfill';
import { computeSlots, periodKey } from '@pumasi/booking-core';
import type {
  ComputeSlotsResponse,
  AvailabilityRule,
  DateOverride,
  Interval,
  BookingLimit,
  LimitPeriod,
  PeriodUsage,
  Slot,
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
  /** Who the booker is meeting — shown on the public page. */
  owner_name: string;
  duration_minutes: number;
  granularity_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  maximum_horizon_days: number;
  max_bookings_per_day: number | null;
  /** S9b · caps over longer periods, and over booked time. */
  max_bookings_per_week: number | null;
  max_bookings_per_month: number | null;
  max_minutes_per_day: number | null;
  max_minutes_per_week: number | null;
  /** P2 · the named availability set this event type draws hours from. */
  availability_set_id: string | null;
  description: string | null;
  color: string | null;
  location_kind: LocationKind;
  location_value: string | null;
  /** P2 · optional fixed date range (owner-local dates, inclusive). */
  available_from: string | null;
  available_until: string | null;
  /** P5 · solo, or a team event drawing on event_hosts. */
  scheduling_kind: 'solo' | 'round_robin' | 'collective';
  /** An RFC 5545 RRULE, when this event type may be booked as a series. */
  recurrence_rule: string | null;
  org_id: string | null;
}

const SCHEDULE_COLS = `sc.schedule_id, sc.owner_id, sc.slug, sc.title, o.timezone AS owner_timezone, o.display_name AS owner_name,
            sc.duration_minutes, sc.granularity_minutes, sc.buffer_before_minutes,
            sc.buffer_after_minutes, sc.minimum_notice_minutes, sc.maximum_horizon_days,
            sc.max_bookings_per_day, sc.max_bookings_per_week, sc.max_bookings_per_month,
            sc.max_minutes_per_day, sc.max_minutes_per_week, sc.availability_set_id, sc.description, sc.color,
            sc.location_kind, sc.location_value, sc.available_from, sc.available_until,
            sc.scheduling_kind, sc.org_id, sc.recurrence_rule`;

function toSchedule(r: Record<string, unknown>): Schedule {
  const opt = (v: unknown) => (v === null || v === undefined ? null : s(v));
  return {
    schedule_id: s(r['schedule_id']),
    owner_id: s(r['owner_id']),
    slug: s(r['slug']),
    title: s(r['title']),
    owner_timezone: s(r['owner_timezone']),
    owner_name: s(r['owner_name'] ?? ''),
    duration_minutes: n(r['duration_minutes']),
    granularity_minutes: n(r['granularity_minutes']),
    buffer_before_minutes: n(r['buffer_before_minutes']),
    buffer_after_minutes: n(r['buffer_after_minutes']),
    minimum_notice_minutes: n(r['minimum_notice_minutes']),
    maximum_horizon_days: n(r['maximum_horizon_days']),
    max_bookings_per_day: r['max_bookings_per_day'] === null ? null : n(r['max_bookings_per_day']),
    max_bookings_per_week: r['max_bookings_per_week'] == null ? null : n(r['max_bookings_per_week']),
    max_bookings_per_month: r['max_bookings_per_month'] == null ? null : n(r['max_bookings_per_month']),
    max_minutes_per_day: r['max_minutes_per_day'] == null ? null : n(r['max_minutes_per_day']),
    max_minutes_per_week: r['max_minutes_per_week'] == null ? null : n(r['max_minutes_per_week']),
    availability_set_id: opt(r['availability_set_id']),
    description: opt(r['description']),
    color: opt(r['color']),
    location_kind: (opt(r['location_kind']) ?? 'custom') as LocationKind,
    location_value: opt(r['location_value']),
    available_from: opt(r['available_from']),
    available_until: opt(r['available_until']),
    scheduling_kind: (opt(r['scheduling_kind']) ?? 'solo') as Schedule['scheduling_kind'],
    org_id: opt(r['org_id']),
    recurrence_rule: opt(r['recurrence_rule']),
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
function periodUsage(
  busy: Interval[],
  timezone: string,
): Partial<Record<LimitPeriod, Record<string, PeriodUsage>>> {
  const out: Partial<Record<LimitPeriod, Record<string, PeriodUsage>>> = {};
  for (const period of ['day', 'week', 'month', 'year'] as LimitPeriod[]) {
    const bucket: Record<string, PeriodUsage> = {};
    for (const b of busy) {
      const start = Temporal.Instant.from(b.start);
      const key = periodKey(timezone, start, period);
      const minutes = Math.round(
        Temporal.Instant.from(b.end).since(start).total({ unit: 'minute' }),
      );
      const cur = bucket[key] ?? { bookings: 0, minutes: 0 };
      bucket[key] = { bookings: cur.bookings + 1, minutes: cur.minutes + minutes };
    }
    out[period] = bucket;
  }
  return out;
}

/** The limits this event type declares, in the engine's shape. */
function limitsOf(schedule: Schedule): BookingLimit[] {
  const out: BookingLimit[] = [];
  if (schedule.max_bookings_per_week != null) {
    out.push({ period: 'week', max_bookings: schedule.max_bookings_per_week });
  }
  if (schedule.max_bookings_per_month != null) {
    out.push({ period: 'month', max_bookings: schedule.max_bookings_per_month });
  }
  if (schedule.max_minutes_per_day != null) {
    out.push({ period: 'day', max_minutes: schedule.max_minutes_per_day });
  }
  if (schedule.max_minutes_per_week != null) {
    out.push({ period: 'week', max_minutes: schedule.max_minutes_per_week });
  }
  return out;
}

function dailyCounts(busy: Interval[], timezone: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const b of busy) {
    const d = Temporal.Instant.from(b.start).toZonedDateTimeISO(timezone).toPlainDate().toString();
    counts[d] = (counts[d] ?? 0) + 1;
  }
  return counts;
}

// ── P5 · multi-host ─────────────────────────────────────────────────────────

export interface EventHost {
  owner_id: string;
  priority: number;
  display_name: string;
  email: string;
  timezone: string;
}

export async function loadHosts(sql: SqlClient, scheduleId: string): Promise<EventHost[]> {
  const { rows } = await sql.query(
    `SELECT h.owner_id, h.priority, o.display_name, o.email, o.timezone
       FROM event_hosts h JOIN owners o ON o.owner_id = h.owner_id
      WHERE h.schedule_id = $1 ORDER BY h.priority DESC, h.owner_id`,
    [scheduleId],
  );
  return rows.map((r) => ({
    owner_id: s(r['owner_id']),
    priority: n(r['priority']),
    display_name: s(r['display_name']),
    email: s(r['email']),
    timezone: s(r['timezone']),
  }));
}

/**
 * P5 · one host's answer to the TEAM event's question: the event type's
 * constraints (duration, buffers, notice, horizon) applied to the HOST's own
 * hours (their first availability set), bookings, and calendar busy.
 */
export async function hostSlots(
  sql: SqlClient,
  schedule: Schedule,
  host: EventHost,
  q: SlotQuery,
  externalBusy: Interval[] = [],
): Promise<ComputeSlotsResponse> {
  const setRow = await sql.query(
    `SELECT set_id FROM availability_sets WHERE owner_id = $1 ORDER BY created_at LIMIT 1`,
    [host.owner_id],
  );
  const setId = setRow.rows[0] ? s(setRow.rows[0]['set_id']) : undefined;
  const virtual: Schedule = {
    ...schedule,
    owner_id: host.owner_id,
    owner_timezone: host.timezone,
    availability_set_id: setId ?? null,
  };
  return availableSlots(sql, virtual, q, externalBusy);
}

/** P5 · the slots every listed answer agrees on (collective). */
export function intersectSlots(lists: Slot[][]): Slot[] {
  if (lists.length === 0) return [];
  const [first, ...rest] = lists;
  return first!.filter((slot) =>
    rest.every((l) => l.some((x) => x.start === slot.start && x.end === slot.end)),
  );
}

/** P5 · the slots ANY host can take (round-robin), deduplicated and ordered. */
export function unionSlots(lists: Slot[][]): Slot[] {
  const seen = new Map<string, Slot>();
  for (const l of lists) for (const x of l) if (!seen.has(x.start)) seen.set(x.start, x);
  return [...seen.values()].sort((a, b) => (a.start < b.start ? -1 : 1));
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
  /** Validating a recurring series needs a window longer than the default. */
  maxQuerySpanDays?: number,
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
    booking_limits: limitsOf(schedule),
    booked_by_period: periodUsage(busy, schedule.owner_timezone),
    ...(maxQuerySpanDays ? { max_query_span_days: maxQuerySpanDays } : {}),
    query: { from: q.from, to: q.to },
    // P2b — the clock is supplied here. The engine never reads one.
    now: q.now,
  });
}
