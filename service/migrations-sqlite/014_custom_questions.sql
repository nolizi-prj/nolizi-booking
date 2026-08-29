-- Per-event custom questions. See migrations/018_custom_questions.sql for why
-- the label is snapshot onto the answer, and why every deletion path that
-- reaches a booker's name must also reach their answers.

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
