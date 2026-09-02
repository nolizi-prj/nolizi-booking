-- SQLite cannot widen a CHECK constraint in place. Preserve every workflow
-- while replacing only the constrained table definition.
CREATE TABLE workflows_phase2 (
  workflow_id TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  title       TEXT NOT NULL,
  trigger     TEXT NOT NULL CHECK (trigger IN
                ('booking_created', 'booking_cancelled', 'booking_rescheduled',
                 'booking_no_show', 'before_event', 'after_event')),
  offset_minutes INTEGER NOT NULL DEFAULT 0,
  recipient   TEXT NOT NULL DEFAULT 'booker' CHECK (recipient IN ('booker', 'owner')),
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT INTO workflows_phase2
  (workflow_id, owner_id, title, trigger, offset_minutes, recipient, subject, body, enabled, created_at)
SELECT workflow_id, owner_id, title, trigger, offset_minutes, recipient, subject, body, enabled, created_at
  FROM workflows;
DROP TABLE workflows;
ALTER TABLE workflows_phase2 RENAME TO workflows;
