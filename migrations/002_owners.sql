-- SPEC-0002 §4.1 identity, §4.6 data protection.

CREATE TABLE IF NOT EXISTS owners (
  owner_id      text PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  display_name  text NOT NULL,
  timezone      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- D2 · The documented fields and no others. Every column here is named in
-- SPEC.md D2; adding one is a change to that clause, not an implementation
-- detail.
CREATE TABLE IF NOT EXISTS schedules (
  schedule_id            text PRIMARY KEY,
  owner_id               text NOT NULL REFERENCES owners(owner_id) ON DELETE CASCADE,
  slug                   text NOT NULL UNIQUE,
  title                  text NOT NULL,
  duration_minutes       int  NOT NULL CHECK (duration_minutes > 0),
  granularity_minutes    int  NOT NULL CHECK (granularity_minutes > 0),
  buffer_before_minutes  int  NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes   int  NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0),
  minimum_notice_minutes int  NOT NULL DEFAULT 0 CHECK (minimum_notice_minutes >= 0),
  maximum_horizon_days   int  NOT NULL DEFAULT 60 CHECK (maximum_horizon_days >= 0),
  max_bookings_per_day   int  CHECK (max_bookings_per_day IS NULL OR max_bookings_per_day > 0),
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Weekly rules, in the owner's local wall clock. The engine turns these into
-- absolute intervals; nothing here does timezone arithmetic.
CREATE TABLE IF NOT EXISTS availability_rules (
  id           bigserial PRIMARY KEY,
  schedule_id  text NOT NULL REFERENCES schedules(schedule_id) ON DELETE CASCADE,
  weekday      text NOT NULL CHECK (weekday IN ('MO','TU','WE','TH','FR','SA','SU')),
  starts_local text NOT NULL,
  ends_local   text NOT NULL
);

CREATE TABLE IF NOT EXISTS date_overrides (
  id           bigserial PRIMARY KEY,
  schedule_id  text NOT NULL REFERENCES schedules(schedule_id) ON DELETE CASCADE,
  local_date   date NOT NULL,
  starts_local text,           -- NULL row set = unavailable that date (S11)
  ends_local   text
);

-- I1 · Single-use, consumed atomically with account creation. The unique
-- constraint is what makes two concurrent redemptions produce one account;
-- checking `consumed_by IS NULL` first would be a race.
CREATE TABLE IF NOT EXISTS invites (
  code         text PRIMARY KEY,
  consumed_by  text REFERENCES owners(owner_id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  consumed_at  timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS invites_one_consumer
  ON invites (code) WHERE consumed_by IS NOT NULL;

-- I3 · Opaque server-side references. The cookie carries this id and nothing
-- else -- no claims, no account identifier.
CREATE TABLE IF NOT EXISTS sessions (
  session_id  text PRIMARY KEY,
  owner_id    text NOT NULL REFERENCES owners(owner_id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

-- I6 · Rate limiting on unauthenticated surfaces, with the numbers in SPEC.md.
CREATE TABLE IF NOT EXISTS rate_events (
  id        bigserial PRIMARY KEY,
  bucket    text NOT NULL,
  seen_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rate_events_bucket ON rate_events (bucket, seen_at);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS schedule_id text;
CREATE INDEX IF NOT EXISTS bookings_schedule ON bookings (schedule_id, starts_at);
