-- P8 — enterprise identity (PostgreSQL lineage). Mirrors migrations-sqlite/009_enterprise.sql.

CREATE TABLE IF NOT EXISTS org_sso (
  org_id          TEXT PRIMARY KEY REFERENCES orgs(org_id) ON DELETE CASCADE,
  issuer          TEXT NOT NULL,           -- OIDC issuer, discovery at /.well-known
  client_id       TEXT NOT NULL,
  client_secret   TEXT NOT NULL,
  email_domain    TEXT,                    -- log-ins @domain are steered to this IdP
  scim_token_hash TEXT                     -- sha256 of the org's SCIM bearer token
);

-- Accounts created by SCIM are marked, so deprovisioning may remove them.
ALTER TABLE owners ADD COLUMN IF NOT EXISTS provisioned_by TEXT;

CREATE TABLE IF NOT EXISTS audit_events (
  id         SERIAL PRIMARY KEY,
  owner_id   TEXT,                         -- whose account the event touches
  org_id     TEXT,
  actor      TEXT NOT NULL,                -- who did it: an email, 'scim', 'system'
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
);
CREATE INDEX IF NOT EXISTS audit_by_owner ON audit_events (owner_id, created_at);
