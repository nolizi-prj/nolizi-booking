-- P6 — routing forms and meeting polls (PostgreSQL lineage).
-- Mirrors migrations-sqlite/007_routing_polls.sql.
--
-- Routing stores QUESTIONS and DESTINATIONS, never answers: the answer picks a
-- direction and is gone (F3 — collect nothing that is not needed to meet).
-- Polls store votes, which are personal data on the same basis as a booking:
-- name, email, the times someone said yes to, deletable with the poll.

CREATE TABLE IF NOT EXISTS routing_forms (
  form_id    TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  title      TEXT NOT NULL,
  question   TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

CREATE TABLE IF NOT EXISTS routing_options (
  option_id         TEXT PRIMARY KEY,
  form_id           TEXT NOT NULL REFERENCES routing_forms(form_id) ON DELETE CASCADE,
  position          INTEGER NOT NULL DEFAULT 0,
  label             TEXT NOT NULL,
  destination_kind  TEXT NOT NULL CHECK (destination_kind IN ('event', 'url', 'message')),
  destination_value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS polls (
  poll_id          TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL,
  token            TEXT NOT NULL UNIQUE,   -- the public voting link
  title            TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'booked', 'closed')),
  created_at       TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

CREATE TABLE IF NOT EXISTS poll_options (
  option_id TEXT PRIMARY KEY,
  poll_id   TEXT NOT NULL REFERENCES polls(poll_id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_votes (
  option_id   TEXT NOT NULL REFERENCES poll_options(option_id) ON DELETE CASCADE,
  voter_email TEXT NOT NULL,
  voter_name  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
  PRIMARY KEY (option_id, voter_email)
);
