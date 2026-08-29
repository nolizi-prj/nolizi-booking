-- P3 — meetings, contacts, sharing (PostgreSQL lineage).
-- Mirrors migrations-sqlite/004_meetings.sql.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS no_show INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS owner_note TEXT;

CREATE TABLE IF NOT EXISTS contacts (
  owner_id       TEXT NOT NULL,
  email          TEXT NOT NULL,
  name           TEXT NOT NULL,
  times_booked   INTEGER NOT NULL DEFAULT 1,
  last_booked_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, email)
);

CREATE TABLE IF NOT EXISTS contact_exclusions (
  owner_id TEXT NOT NULL,
  pattern  TEXT NOT NULL,
  PRIMARY KEY (owner_id, pattern)
);

CREATE TABLE IF NOT EXISTS single_use_links (
  token       TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  used_at     TEXT
);
