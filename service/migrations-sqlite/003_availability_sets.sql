-- SPEC-0002/P2 — availability decoupled from event types.
--
-- Calendly's model, adopted deliberately: a named availability set ("Working
-- hours") is defined once and referenced by many event types. Sets carry their
-- own rules/overrides tables (set_rules, set_overrides); the legacy
-- schedule-keyed tables remain for event types never migrated to a set. This
-- migration creates one set per existing schedule and copies its rows, so no
-- behaviour changes on upgrade day.

CREATE TABLE IF NOT EXISTS availability_sets (
  set_id     TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS set_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id       TEXT NOT NULL REFERENCES availability_sets(set_id) ON DELETE CASCADE,
  weekday      TEXT NOT NULL CHECK (weekday IN ('MO','TU','WE','TH','FR','SA','SU')),
  starts_local TEXT NOT NULL,
  ends_local   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS set_overrides (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  set_id       TEXT NOT NULL REFERENCES availability_sets(set_id) ON DELETE CASCADE,
  local_date   TEXT NOT NULL,
  starts_local TEXT,           -- NULL row set = unavailable that date (S11)
  ends_local   TEXT
);

ALTER TABLE schedules ADD COLUMN availability_set_id TEXT;

-- Event-type parity fields.
ALTER TABLE schedules ADD COLUMN description TEXT;
ALTER TABLE schedules ADD COLUMN color TEXT;
ALTER TABLE schedules ADD COLUMN location_kind TEXT NOT NULL DEFAULT 'custom';
ALTER TABLE schedules ADD COLUMN location_value TEXT;
ALTER TABLE schedules ADD COLUMN available_from TEXT;
ALTER TABLE schedules ADD COLUMN available_until TEXT;

-- The owner's public link: booking.pumasi.ai/<link_slug> lists their pages.
ALTER TABLE owners ADD COLUMN link_slug TEXT;

-- Per-booking conference link (Google Meet), minted at write-back.
ALTER TABLE bookings ADD COLUMN meet_url TEXT;

-- Backfill: one set per schedule, named after it; rules and overrides follow.
INSERT INTO availability_sets (set_id, owner_id, name)
  SELECT lower(hex(randomblob(16))), owner_id, title || ' hours' FROM schedules;
UPDATE schedules SET availability_set_id =
  (SELECT s.set_id FROM availability_sets s
    WHERE s.owner_id = schedules.owner_id AND s.name = schedules.title || ' hours');
INSERT INTO set_rules (set_id, weekday, starts_local, ends_local)
  SELECT sc.availability_set_id, r.weekday, r.starts_local, r.ends_local
    FROM availability_rules r JOIN schedules sc ON sc.schedule_id = r.schedule_id;
INSERT INTO set_overrides (set_id, local_date, starts_local, ends_local)
  SELECT sc.availability_set_id, o.local_date, o.starts_local, o.ends_local
    FROM date_overrides o JOIN schedules sc ON sc.schedule_id = o.schedule_id;

UPDATE owners SET link_slug = lower(replace(replace(substr(email, 1, instr(email, '@') - 1), '.', '-'), '+', '-'))
  WHERE link_slug IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS owners_link_slug ON owners (link_slug);

-- Event slugs stay globally unique until P4's per-owner sharding makes them
-- per-owner structurally (each owner's Durable Object owns its own tables).
