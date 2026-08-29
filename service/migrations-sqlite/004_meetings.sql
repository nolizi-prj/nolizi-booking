-- P3 — the owner's working day: meeting annotations, contacts, sharing.

ALTER TABLE bookings ADD COLUMN no_show INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN owner_note TEXT;

-- Contacts accrete from bookings (D-105 note: same data the booking already
-- holds, organised per owner; deleting an owner cascades in app code with the
-- rest of their data).
CREATE TABLE IF NOT EXISTS contacts (
  owner_id       TEXT NOT NULL,
  email          TEXT NOT NULL,
  name           TEXT NOT NULL,
  times_booked   INTEGER NOT NULL DEFAULT 1,
  last_booked_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, email)
);

-- Addresses or whole domains the owner excludes from contact creation.
CREATE TABLE IF NOT EXISTS contact_exclusions (
  owner_id TEXT NOT NULL,
  pattern  TEXT NOT NULL,     -- 'person@x.com' or 'x.com'
  PRIMARY KEY (owner_id, pattern)
);

-- A single-use link: one booking, then dead. Sharing without a standing page.
CREATE TABLE IF NOT EXISTS single_use_links (
  token       TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  used_at     TEXT
);
