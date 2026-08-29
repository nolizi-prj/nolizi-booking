-- P7 — automation (PostgreSQL lineage). Mirrors migrations-sqlite/008_automation.sql.

CREATE TABLE IF NOT EXISTS workflows (
  workflow_id TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  trigger     TEXT NOT NULL CHECK (trigger IN
                ('booking_created', 'booking_cancelled', 'booking_rescheduled',
                 'before_event', 'after_event')),
  offset_minutes INTEGER NOT NULL DEFAULT 0,   -- for before/after triggers
  recipient   TEXT NOT NULL DEFAULT 'booker' CHECK (recipient IN ('booker', 'owner')),
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

-- Timed work: reminder/follow-up mails and webhook deliveries with retries.
CREATE TABLE IF NOT EXISTS jobs (
  job_id     TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('workflow_mail', 'webhook')),
  run_at     TEXT NOT NULL,
  payload    TEXT NOT NULL,               -- JSON, kind-specific
  booking_id TEXT,                        -- cancellation clears pending jobs
  attempts   INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed'))
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs (status, run_at);

CREATE TABLE IF NOT EXISTS webhooks (
  webhook_id TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL,
  url        TEXT NOT NULL,
  secret     TEXT NOT NULL,               -- HMAC key for the signature header
  format     TEXT NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'slack')),
  events     TEXT NOT NULL DEFAULT 'all', -- 'all' or comma list of triggers
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  key_hash   TEXT PRIMARY KEY,            -- sha256 of the bearer token
  owner_id   TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);
