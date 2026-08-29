-- Booking email verification. See migrations/017_email_verification.sql for why
-- the intent replaces the booking rather than holding a slot beside it.

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
