-- Booking email verification: prove the address before the meeting exists.
--
-- The intent is stored INSTEAD of the booking, not alongside it. Holding a slot
-- for an address nobody has proven would make this feature a denial-of-service
-- tool: submit a booking per slot with a fabricated address and the calendar is
-- full without a single verified person. Verification exists to raise the cost
-- of abuse, so it must not create a cheaper way to do it. The slot therefore
-- stays open until someone proves the address, and the booking is created by
-- the ordinary booking path at that moment — same checks, same races, same
-- 409 when the time went.
--
-- `payload` is the submitted form, verbatim JSON. Replaying the real form
-- through the real handler is what keeps the verified path from drifting into
-- a second, less-checked way to create a booking.
--
-- INTEGER rather than BOOLEAN so the column reads back as the same JavaScript
-- value under both dialects; SQLite has no boolean and would hand back 0/1
-- while Postgres handed back true/false.

ALTER TABLE schedules ADD COLUMN require_email_verification INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS booking_intents (
  token       TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  owner_id    TEXT NOT NULL,
  email       TEXT NOT NULL,
  payload     TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  used_at     TEXT
);

CREATE INDEX IF NOT EXISTS booking_intents_owner ON booking_intents (owner_id);
