-- An owner's logo, shown on their booking pages.
--
-- Stored as a data URL rather than as bytes, and that is a deliberate trade.
--
-- Serving an image properly means a route that returns a binary body, and this
-- codebase has two runtimes behind one reply type whose body is a string. A
-- binary body squeezed through a string is the kind of thing that works in
-- Node, silently corrupts under Workers' UTF-8 encoding, and is discovered by
-- a customer with a logo that renders as noise. Inlining the image into the
-- page costs bytes on every render and buys correctness in both runtimes with
-- no new plumbing, so the size cap is small (32 KB decoded, enforced in the
-- handler) and the cost is bounded.
--
-- The trade is worth revisiting if logos ever need to be large, but the fix
-- then is a real object store, not a cleverer string.

CREATE TABLE IF NOT EXISTS org_branding (
  owner_id   TEXT PRIMARY KEY,
  logo       TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
