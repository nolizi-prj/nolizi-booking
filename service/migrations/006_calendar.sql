-- SPEC-0003 — calendar connections (PostgreSQL lineage).
--
-- Mirrors migrations-sqlite/002_calendar.sql. Timestamps here are TEXT ISO-8601
-- UTC deliberately, not timestamptz: these columns are only ever compared to
-- strings the service itself wrote, and one representation across both
-- dialects keeps every query identical.

CREATE TABLE IF NOT EXISTS calendar_connections (
  connection_id     TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  provider          TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  account_email     TEXT NOT NULL,
  refresh_token     TEXT NOT NULL,
  access_token      TEXT,
  access_expires_at TEXT,
  scope_level       TEXT NOT NULL CHECK (scope_level IN ('freebusy', 'events')),
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error')),
  error_reason      TEXT,
  created_at        TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  UNIQUE (owner_id, provider, account_email)
);

CREATE TABLE IF NOT EXISTS connection_calendars (
  connection_id   TEXT NOT NULL,
  calendar_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  check_conflicts INTEGER NOT NULL DEFAULT 1,
  is_destination  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (connection_id, calendar_id)
);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS calendar_connection_id TEXT;
