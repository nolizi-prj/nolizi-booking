-- SPEC-0002 P1 — the clause the whole service turns on.
--
-- Two constraints, each enforcing a DIFFERENT invariant. Dropping either one
-- leaves a service that passes every non-concurrent test and is wrong.

CREATE EXTENSION IF NOT EXISTS btree_gist;   -- required for `WITH =` in GiST

CREATE TABLE IF NOT EXISTS bookings (
  id            bigserial PRIMARY KEY,
  booking_id    text        NOT NULL,
  owner_id      text        NOT NULL,
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  status        text        NOT NULL CHECK (status IN ('confirmed', 'cancelled')),
  booker_name   text,
  booker_email  text,
  booker_tz     text,
  token         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

-- P1a · No two confirmed bookings for one owner overlap.       (SPEC-0001 B2)
-- The obvious implementation -- query for a conflict, then insert if none --
-- is a time-of-check-to-time-of-use race. Only the database can hold this.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    owner_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status = 'confirmed');

-- P1b · One booking holds at most one confirmed interval.      (SPEC-0001 B6)
-- NOT redundant with P1a. A reschedule that inserts the new interval before
-- demoting the old one holds two NON-OVERLAPPING confirmed rows: P1a stays
-- satisfied while "never both" is violated and the database reports nothing.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_confirmed_per_booking
  ON bookings (booking_id) WHERE (status = 'confirmed');

-- B1 · An idempotency key belongs to the booking that first used it. A later
-- operation must never rebind it, or a replay reports a different booking.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key         text PRIMARY KEY,
  booking_id  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_by_booking_id ON bookings (booking_id);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_token ON bookings (token) WHERE token IS NOT NULL;
