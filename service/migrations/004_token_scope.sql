-- The management token identifies a BOOKING, not a row.
--
-- P4 keeps history: a reschedule demotes the old row and inserts a new one, and
-- both carry the same token because the booker's link must keep working across
-- a move. A unique index over every row therefore made the second insert
-- collide with the row it had just superseded -- and because the collision is a
-- unique violation, it surfaced to the caller as "someone just took that time",
-- which was untrue and unactionable.
--
-- Scoping uniqueness to the CONFIRMED row says what is actually meant: at most
-- one live booking answers to a token, and superseded rows keep theirs for
-- provenance.
DROP INDEX IF EXISTS bookings_token;
CREATE UNIQUE INDEX IF NOT EXISTS bookings_token_confirmed
  ON bookings (token) WHERE token IS NOT NULL AND status = 'confirmed';
