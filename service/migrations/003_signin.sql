-- SPEC-0002 I3 — passwordless sign-in.
--
-- A short-lived, single-use bearer link. Nothing here stores a password, so
-- there is no password to leak, reuse, or reset.

CREATE TABLE IF NOT EXISTS sign_in_tokens (
  token       text PRIMARY KEY,
  owner_id    text NOT NULL REFERENCES owners(owner_id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX IF NOT EXISTS sign_in_tokens_owner ON sign_in_tokens (owner_id);
