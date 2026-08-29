-- Blocked sources: addresses and domains an owner will not take bookings from.
--
-- Deliberately NOT the same table as contact_exclusions. That one answers "do
-- not keep this person in my address book" and never affects the booking; this
-- one answers "do not let this person book me at all". Sharing a table would
-- mean an owner tidying their contacts silently locked someone out, which is
-- the sort of coupling that only shows up as a support ticket.
--
-- `pattern` is either a full address or a bare domain, both lowercased, matched
-- exactly — no wildcards. A wildcard language here would need its own parser
-- and its own tests, and "block acme.com" is what owners actually ask for.

CREATE TABLE IF NOT EXISTS booking_blocks (
  owner_id   TEXT NOT NULL,
  pattern    TEXT NOT NULL,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  PRIMARY KEY (owner_id, pattern)
);
