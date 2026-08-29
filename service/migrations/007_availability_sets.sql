-- SPEC-0002/P2 — availability decoupled from event types (PostgreSQL lineage).
-- Mirrors migrations-sqlite/003_availability_sets.sql.

CREATE TABLE IF NOT EXISTS availability_sets (
  set_id     TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
);

CREATE TABLE IF NOT EXISTS set_rules (
  id           SERIAL PRIMARY KEY,
  set_id       TEXT NOT NULL REFERENCES availability_sets(set_id) ON DELETE CASCADE,
  weekday      TEXT NOT NULL CHECK (weekday IN ('MO','TU','WE','TH','FR','SA','SU')),
  starts_local TEXT NOT NULL,
  ends_local   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS set_overrides (
  id           SERIAL PRIMARY KEY,
  set_id       TEXT NOT NULL REFERENCES availability_sets(set_id) ON DELETE CASCADE,
  local_date   TEXT NOT NULL,
  starts_local TEXT,
  ends_local   TEXT
);

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS availability_set_id TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS location_kind TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS location_value TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS available_from TEXT;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS available_until TEXT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS link_slug TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS meet_url TEXT;

INSERT INTO availability_sets (set_id, owner_id, name)
  SELECT md5(random()::text || schedule_id), owner_id, title || ' hours' FROM schedules;
UPDATE schedules SET availability_set_id =
  (SELECT s.set_id FROM availability_sets s
    WHERE s.owner_id = schedules.owner_id AND s.name = schedules.title || ' hours');
INSERT INTO set_rules (set_id, weekday, starts_local, ends_local)
  SELECT sc.availability_set_id, r.weekday, r.starts_local, r.ends_local
    FROM availability_rules r JOIN schedules sc ON sc.schedule_id = r.schedule_id;
INSERT INTO set_overrides (set_id, local_date, starts_local, ends_local)
  SELECT sc.availability_set_id, o.local_date, o.starts_local, o.ends_local
    FROM date_overrides o JOIN schedules sc ON sc.schedule_id = o.schedule_id;

UPDATE owners SET link_slug = lower(replace(replace(split_part(email, '@', 1), '.', '-'), '+', '-'))
  WHERE link_slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS owners_link_slug ON owners (link_slug);
