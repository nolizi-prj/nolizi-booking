-- S9b — booking limits (PostgreSQL lineage). Mirrors migrations-sqlite/010_limits.sql.
--
-- Counted across the owner's whole calendar, exactly as the existing daily cap
-- already is: these express "I do not want more than this much of my week in
-- meetings", which is a fact about the person, not about one booking page.

ALTER TABLE schedules ADD COLUMN IF NOT EXISTS max_bookings_per_week INTEGER;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS max_bookings_per_month INTEGER;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS max_minutes_per_day INTEGER;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS max_minutes_per_week INTEGER;
