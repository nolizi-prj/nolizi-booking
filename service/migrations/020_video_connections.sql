-- SPEC-0005 Z6a — stored video-conferencing connections (PostgreSQL lineage).
--
-- Mirrors migrations-sqlite/016_video_connections.sql. Before this table the
-- Zoom OAuth callback threw its tokens away and stamped the owner's personal
-- meeting URL onto every zoom event type instead, which the public booking
-- page then printed to strangers (SPEC-0005 §0, D-b1/D-c2). The credential
-- belongs here; nothing about it belongs on a schedule.
--
-- refresh_token and access_token are AES-GCM sealed (src/seal.ts) exactly as
-- calendar_connections are: a copy of the database alone reveals no credential.
-- fallback_url is deliberately NOT sealed -- it is not a credential, and Z2
-- keeps it off every public surface by other means.
--
-- Timestamps are TEXT ISO-8601 UTC, the one representation this lineage uses
-- in both dialects.

CREATE TABLE IF NOT EXISTS video_connections (
  connection_id     TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  provider          TEXT NOT NULL CHECK (provider IN ('zoom')),
  account_email     TEXT NOT NULL,
  refresh_token     TEXT NOT NULL,
  access_token      TEXT,
  access_expires_at TEXT,
  -- The account's personal meeting room, as captured at connect. Step 5 of the
  -- Z3d chain and never a public rendering.
  fallback_url      TEXT,
  display_name      TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error')),
  error_reason      TEXT,
  created_at        TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  UNIQUE (owner_id, provider, account_email)
);

CREATE INDEX IF NOT EXISTS video_connections_owner ON video_connections (owner_id, provider);
