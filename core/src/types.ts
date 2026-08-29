/**
 * SPEC-0001 §3 — interface contract. Field names are normative.
 * Instants are RFC 3339 with `Z`. Local times are `HH:MM`, 24-hour.
 */

export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

/** An absolute instant, RFC 3339 with `Z`. */
export type Instant = string;
/** A local wall-clock time, `HH:MM`. */
export type LocalTime = string;
/** A local calendar date, `YYYY-MM-DD`. */
export type LocalDate = string;

export interface AvailabilityRule {
  weekday: Weekday;
  start: LocalTime;
  end: LocalTime;
}

export interface LocalWindow {
  start: LocalTime;
  end: LocalTime;
}

export interface DateOverride {
  date: LocalDate;
  /** Replaces that date's weekly rules entirely. `[]` means unavailable (S11). */
  windows: LocalWindow[];
}

export interface Interval {
  start: Instant;
  end: Instant;
}

/** The query window (§3.1). Absolute, half-open. Note `from`/`to`, not start/end. */
export interface QueryRange {
  from: Instant;
  to: Instant;
}

export interface ComputeSlotsRequest {
  owner_timezone: string;
  availability: AvailabilityRule[];
  date_overrides?: DateOverride[];
  busy?: Interval[];
  duration_minutes: number;
  granularity_minutes: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  minimum_notice_minutes?: number;
  maximum_horizon_days?: number;
  max_bookings_per_day?: number | null;
  bookings_per_local_date?: Record<LocalDate, number>;
  max_query_span_days?: number;
  query: QueryRange;
  /** Required. Injected clock — the engine never reads one (S12). */
  now: Instant;
}

export type DiagnosticCode =
  | 'NONEXISTENT_LOCAL_TIME'
  | 'AMBIGUOUS_LOCAL_TIME'
  | 'QUERY_RANGE_TOO_LARGE';

export interface Diagnostic {
  code: DiagnosticCode;
  detail: string;
  /** Present when the diagnostic concerns a specific owner-local date (§3.2). */
  date?: LocalDate;
}

export interface Slot {
  start: Instant;
  end: Instant;
}

export interface ComputeSlotsResponse {
  slots: Slot[];
  diagnostics: Diagnostic[];
}

/** SPEC-0001 §5.1 — booking verbs. */
export type BookingStatus =
  | 'confirmed'
  | 'conflict'
  | 'expired'
  | 'cancelled'
  | 'not_found';

export interface BookRequest {
  start?: Instant;
  end?: Instant;
  /** Alternative to start/end: a slot returned by compute_slots (§5.1). */
  slot?: Slot;
  idempotency_key: string;
  now: Instant;
  minimum_notice_minutes?: number;
}

export interface CancelRequest {
  booking_id: string;
  idempotency_key: string;
  now: Instant;
}

export interface RescheduleRequest {
  booking_id: string;
  new_start: Instant;
  new_end: Instant;
  idempotency_key: string;
  now: Instant;
  minimum_reschedule_notice_minutes?: number;
}

export interface BookResult {
  status: BookingStatus;
  booking_id?: string;
}

export interface CancelResult {
  status: BookingStatus;
}

export const DEFAULTS = {
  buffer_before_minutes: 0,
  buffer_after_minutes: 0,
  minimum_notice_minutes: 0,
  maximum_horizon_days: 3650,
  max_bookings_per_day: null,
  max_query_span_days: 31,
} as const;
