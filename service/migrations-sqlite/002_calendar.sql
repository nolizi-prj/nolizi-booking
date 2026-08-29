-- SPEC-0003 — calendar connections.
--
-- refresh_token and access_token are AES-GCM sealed (src/seal.ts); the rows
-- are useless without the deployment's TOKEN_KEY. Timestamps TEXT ISO-8601 UTC
-- as everywhere in this lineage.

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
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (owner_id, provider, account_email)
);

-- Which calendars are consulted for conflicts, and which one receives events.
-- check_conflicts / is_destination are 0/1 integers so the SQL stays
-- dialect-neutral with PostgreSQL.
CREATE TABLE IF NOT EXISTS connection_calendars (
  connection_id   TEXT NOT NULL,
  calendar_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  check_conflicts INTEGER NOT NULL DEFAULT 1,
  is_destination  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (connection_id, calendar_id)
);

ALTER TABLE bookings ADD COLUMN calendar_event_id TEXT;
ALTER TABLE bookings ADD COLUMN calendar_connection_id TEXT;
