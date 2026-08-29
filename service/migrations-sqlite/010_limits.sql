-- S9b — booking limits over longer periods, and over booked time.
--
-- Counted across the owner's whole calendar, exactly as the existing daily cap
-- already is: these express "I do not want more than this much of my week in
-- meetings", which is a fact about the person, not about one booking page.

ALTER TABLE schedules ADD COLUMN max_bookings_per_week INTEGER;
ALTER TABLE schedules ADD COLUMN max_bookings_per_month INTEGER;
ALTER TABLE schedules ADD COLUMN max_minutes_per_day INTEGER;
ALTER TABLE schedules ADD COLUMN max_minutes_per_week INTEGER;
