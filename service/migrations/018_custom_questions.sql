-- Per-event custom questions.
--
-- This is the first feature that stores personal data the service did not
-- choose the shape of. Until now the booking path took a name and an email and
-- discarded everything else (F3), which made the privacy notice easy to write
-- and easy to keep true. A free-text question an owner writes can ask for
-- anything, so three things are structural rather than cosmetic:
--
--   * `label` is SNAPSHOT onto the answer. An owner who later edits "Your
--     phone number" into "Anything else?" must not silently relabel what
--     people already answered — that rewrites the record of what was asked.
--   * answers are capped in the handler, so one booking cannot become an
--     unbounded store of someone else's text.
--   * answers are deleted wherever the booker's other details are deleted.
--     An answer is the most sensitive thing a booking holds; a deletion path
--     that reached the name and not the answer would make the shipped promise
--     false.
--
-- The owner is the controller for whatever their questions collect. The
-- privacy notice has to say so, and the notice is edited elsewhere.

CREATE TABLE IF NOT EXISTS event_questions (
  question_id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  owner_id    TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  label       TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'text',
  required    INTEGER NOT NULL DEFAULT 0,
  options     TEXT
);

CREATE INDEX IF NOT EXISTS event_questions_schedule
  ON event_questions (schedule_id, position);

CREATE TABLE IF NOT EXISTS booking_answers (
  booking_id  TEXT NOT NULL,
  question_id TEXT NOT NULL,
  label       TEXT NOT NULL,
  answer      TEXT NOT NULL,
  PRIMARY KEY (booking_id, question_id)
);
