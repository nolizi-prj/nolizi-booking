-- An invite must stay SPENT even if the person who spent it deletes their
-- account.
--
-- consumed_by referenced owners, so deleting an owner was refused by the
-- foreign key -- D3 could not run at all. Cascading the delete would have been
-- worse than the bug: the invite row would vanish, or consumed_by would clear
-- and `consumed_by IS NULL` would make a spent invite reusable, so leaving
-- would mint a fresh way in.
--
-- Spentness now lives in consumed_at, which nothing else references and no
-- deletion can clear. consumed_by records WHO, and is allowed to become NULL
-- when that person is gone -- which is also the right privacy answer: an
-- account that is deleted should not remain named here.

ALTER TABLE invites DROP CONSTRAINT IF EXISTS invites_consumed_by_fkey;
ALTER TABLE invites ADD CONSTRAINT invites_consumed_by_fkey
  FOREIGN KEY (consumed_by) REFERENCES owners(owner_id) ON DELETE SET NULL;

DROP INDEX IF EXISTS invites_one_consumer;
UPDATE invites SET consumed_at = now() WHERE consumed_by IS NOT NULL AND consumed_at IS NULL;
