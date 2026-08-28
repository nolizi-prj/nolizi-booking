-- SPEC-0002 P1 — the SQLite lineage of the schema.
--
-- This is a consolidated port of migrations/001..005 for SQLite-backed
-- deployments (Cloudflare Durable Objects, or DATABASE_URL=sqlite:...). It is a
-- NEW lineage, not a translation history: no SQLite database predates it, so it
-- states the final schema directly instead of replaying five PostgreSQL
-- migrations that partly exist to repair earlier PostgreSQL decisions.
--
-- The invariants are the same ones, enforced by the database, not by reading
-- rows and deciding:
--
--   P1a  no two confirmed bookings for one owner overlap   (trigger, below)
--   P1b  one booking holds at most one confirmed interval  (partial unique index)
--   B1   an idempotency key belongs to the first booking that used it
--
-- Timestamps are TEXT, ISO-8601 UTC. Every writer in this codebase produces
-- them via Temporal instants, so lexicographic comparison is chronological
-- comparison. SQLite has no timestamptz; uniform format is the contract.

CREATE TABLE IF NOT EXISTS bookings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id    TEXT NOT NULL,
  owner_id      TEXT NOT NULL,
  starts_at     TEXT NOT NULL,
  ends_at       TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
  booker_name   TEXT,
  booker_email  TEXT,
  booker_tz     TEXT,
  token         TEXT,
  schedule_id   TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  CHECK (ends_at > starts_at)
);

-- P1a · PostgreSQL enforces this with an EXCLUDE USING gist constraint. SQLite
-- has no exclusion constraints; a trigger raising ABORT is the same thing in
-- the only place it can live — inside the database, atomic with the write.
-- The RAISE message deliberately contains 'violates exclusion constraint' so
-- the store's conflict translation recognises it without a dialect switch.
CREATE TRIGGER IF NOT EXISTS bookings_no_overlap_insert
BEFORE INSERT ON bookings
FOR EACH ROW WHEN NEW.status = 'confirmed'
BEGIN
  SELECT RAISE(ABORT, 'conflicting key value violates exclusion constraint "bookings_no_overlap"')
  WHERE EXISTS (
    SELECT 1 FROM bookings
     WHERE owner_id = NEW.owner_id
       AND status = 'confirmed'
       AND starts_at < NEW.ends_at
       AND ends_at   > NEW.starts_at
  );
END;

-- Nothing in the service promotes a row to 'confirmed' or moves its interval in
-- place, but "nothing does" is an observation, not a guarantee.
CREATE TRIGGER IF NOT EXISTS bookings_no_overlap_update
BEFORE UPDATE OF status, starts_at, ends_at, owner_id ON bookings
FOR EACH ROW WHEN NEW.status = 'confirmed'
BEGIN
  SELECT RAISE(ABORT, 'conflicting key value violates exclusion constraint "bookings_no_overlap"')
  WHERE EXISTS (
    SELECT 1 FROM bookings
     WHERE id <> NEW.id
       AND owner_id = NEW.owner_id
       AND status = 'confirmed'
       AND starts_at < NEW.ends_at
       AND ends_at   > NEW.starts_at
  );
END;

-- P1b · Not redundant with P1a: a reschedule that inserted before demoting
-- would hold two NON-OVERLAPPING confirmed rows.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_confirmed_per_booking
  ON bookings (booking_id) WHERE status = 'confirmed';

-- B1 · An idempotency key belongs to the booking that first used it.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         TEXT PRIMARY KEY,
  booking_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX IF NOT EXISTS bookings_by_booking_id ON bookings (booking_id);

-- 004 · The management token identifies a BOOKING, not a row: superseded rows
-- keep their token for provenance, only the confirmed row must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_token_confirmed
  ON bookings (token) WHERE token IS NOT NULL AND status = 'confirmed';

CREATE INDEX IF NOT EXISTS bookings_schedule ON bookings (schedule_id, starts_at);

-- §4.1 identity, §4.6 data protection.

CREATE TABLE IF NOT EXISTS owners (
  owner_id      TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  timezone      TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- D2 · The documented fields and no others.
CREATE TABLE IF NOT EXISTS schedules (
  schedule_id            TEXT PRIMARY KEY,
  owner_id               TEXT NOT NULL REFERENCES owners(owner_id) ON DELETE CASCADE,
  slug                   TEXT NOT NULL UNIQUE,
  title                  TEXT NOT NULL,
  duration_minutes       INTEGER NOT NULL CHECK (duration_minutes > 0),
  granularity_minutes    INTEGER NOT NULL CHECK (granularity_minutes > 0),
  buffer_before_minutes  INTEGER NOT NULL DEFAULT 0 CHECK (buffer_before_minutes >= 0),
  buffer_after_minutes   INTEGER NOT NULL DEFAULT 0 CHECK (buffer_after_minutes >= 0),
  minimum_notice_minutes INTEGER NOT NULL DEFAULT 0 CHECK (minimum_notice_minutes >= 0),
  maximum_horizon_days   INTEGER NOT NULL DEFAULT 60 CHECK (maximum_horizon_days >= 0),
  max_bookings_per_day   INTEGER CHECK (max_bookings_per_day IS NULL OR max_bookings_per_day > 0),
  created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS availability_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id  TEXT NOT NULL REFERENCES schedules(schedule_id) ON DELETE CASCADE,
  weekday      TEXT NOT NULL CHECK (weekday IN ('MO','TU','WE','TH','FR','SA','SU')),
  starts_local TEXT NOT NULL,
  ends_local   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS date_overrides (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id  TEXT NOT NULL REFERENCES schedules(schedule_id) ON DELETE CASCADE,
  local_date   TEXT NOT NULL,
  starts_local TEXT,           -- NULL row set = unavailable that date (S11)
  ends_local   TEXT
);

-- I1 · Single-use invites. 005 applied from the start: spentness lives in
-- consumed_at, which no account deletion can clear; consumed_by records WHO and
-- may become NULL when that person is gone.
CREATE TABLE IF NOT EXISTS invites (
  code         TEXT PRIMARY KEY,
  consumed_by  TEXT REFERENCES owners(owner_id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  consumed_at  TEXT
);

-- I3 · Opaque server-side session references.
CREATE TABLE IF NOT EXISTS sessions (
  session_id  TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES owners(owner_id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at  TEXT NOT NULL
);

-- I6 · Rate limiting on unauthenticated surfaces.
CREATE TABLE IF NOT EXISTS rate_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  bucket    TEXT NOT NULL,
  seen_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS rate_events_bucket ON rate_events (bucket, seen_at);

-- I3 · Passwordless sign-in: short-lived, single-use bearer links.
CREATE TABLE IF NOT EXISTS sign_in_tokens (
  token       TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES owners(owner_id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);
CREATE INDEX IF NOT EXISTS sign_in_tokens_owner ON sign_in_tokens (owner_id);
