-- P5 — organizations and multi-host scheduling.
--
-- A team event type carries hosts. Round-robin assigns one host per booking
-- (the booking row lives under that host, so the per-owner exclusivity trigger
-- keeps guarding it unchanged). Collective books EVERY host: one row per host,
-- distinct booking_ids joined by group_id, inserted in one transaction — any
-- host's conflict rolls back the whole group. B2 stays a per-owner invariant;
-- what changed is how many owners one meeting occupies.

CREATE TABLE IF NOT EXISTS orgs (
  org_id     TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
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

ALTER TABLE schedules ADD COLUMN scheduling_kind TEXT NOT NULL DEFAULT 'solo';
ALTER TABLE schedules ADD COLUMN org_id TEXT;
ALTER TABLE bookings ADD COLUMN group_id TEXT;
