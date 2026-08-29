-- An owner's logo. See migrations/019_branding.sql for why it is a data URL
-- rather than bytes, and why the size cap is small.

CREATE TABLE IF NOT EXISTS org_branding (
  owner_id   TEXT PRIMARY KEY,
  logo       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
