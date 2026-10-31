-- Outputs shown in the public museum (art.kacperochnik.eu). See docs/museum-plan.md.
-- The museum generates its building from these rows in (wing, position) order, so positions are only
-- ever appended: a new exhibit never moves the rooms of older ones.
CREATE TABLE exhibits (
  id TEXT PRIMARY KEY,
  output_id TEXT NOT NULL REFERENCES outputs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  wing TEXT NOT NULL DEFAULT 'Main',
  title TEXT NOT NULL,
  statement TEXT NOT NULL DEFAULT '',
  hero INTEGER NOT NULL DEFAULT 0,
  live INTEGER NOT NULL DEFAULT 1,
  medium TEXT NOT NULL DEFAULT '2d',
  size TEXT NOT NULL,
  assets TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX exhibits_wing ON exhibits(wing, position);
CREATE UNIQUE INDEX exhibits_output ON exhibits(output_id);
