-- Blocked sources: addresses and domains an owner will not take bookings from.
-- See migrations/016_blocked_sources.sql for why this is not contact_exclusions.

CREATE TABLE IF NOT EXISTS booking_blocks (
  owner_id   TEXT NOT NULL,
  pattern    TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (owner_id, pattern)
);
