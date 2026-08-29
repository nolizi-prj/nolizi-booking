-- P8 — enterprise identity: per-org OIDC SSO, SCIM provisioning, audit.

CREATE TABLE IF NOT EXISTS org_sso (
  org_id          TEXT PRIMARY KEY REFERENCES orgs(org_id) ON DELETE CASCADE,
  issuer          TEXT NOT NULL,           -- OIDC issuer, discovery at /.well-known
  client_id       TEXT NOT NULL,
  client_secret   TEXT NOT NULL,
  email_domain    TEXT,                    -- log-ins @domain are steered to this IdP
  scim_token_hash TEXT                     -- sha256 of the org's SCIM bearer token
);

-- Accounts created by SCIM are marked, so deprovisioning may remove them.
ALTER TABLE owners ADD COLUMN provisioned_by TEXT;

CREATE TABLE IF NOT EXISTS audit_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   TEXT,                         -- whose account the event touches
  org_id     TEXT,
  actor      TEXT NOT NULL,                -- who did it: an email, 'scim', 'system'
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS audit_by_owner ON audit_events (owner_id, created_at);
