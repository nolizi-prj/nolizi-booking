-- P4 — profile fields (PostgreSQL lineage). Mirrors migrations-sqlite/005_profile.sql.

ALTER TABLE owners ADD COLUMN IF NOT EXISTS welcome_message TEXT;
ALTER TABLE owners ADD COLUMN IF NOT EXISTS brand_color TEXT;
