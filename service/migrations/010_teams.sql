-- P5 — organizations and multi-host scheduling (PostgreSQL lineage).
-- Mirrors migrations-sqlite/006_teams.sql.

CREATE TABLE IF NOT EXISTS orgs (
  org_id     TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

CREATE TABLE IF NOT EXISTS org_members (
  org_id   TEXT NOT NULL REFERENCES orgs(org_id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  role     TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  PRIMARY KEY (org_id, owner_id)
);

CREATE TABLE IF NOT EXISTS event_hosts (
  schedule_id TEXT NOT NULL REFERENCES schedules(schedule_id) ON DELETE CASCADE,
  owner_id    TEXT NOT NULL,
  priority    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (schedule_id, owner_id)
);

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS scheduling_kind TEXT NOT NULL DEFAULT 'solo';
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS org_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS group_id TEXT;
