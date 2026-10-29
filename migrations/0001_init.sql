CREATE TABLE sketches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  code TEXT NOT NULL,
  seed TEXT NOT NULL,
  param_values TEXT NOT NULL DEFAULT '{}',
  width INTEGER NOT NULL DEFAULT 1000,
  height INTEGER NOT NULL DEFAULT 1000,
  visibility TEXT NOT NULL DEFAULT 'private',
  forked_from TEXT,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sketches_user ON sketches(user_id, updated_at DESC);

CREATE TABLE versions (
  id TEXT PRIMARY KEY,
  sketch_id TEXT NOT NULL REFERENCES sketches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  code TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX versions_sketch ON versions(sketch_id, created_at DESC);

CREATE TABLE outputs (
  id TEXT PRIMARY KEY,
  sketch_id TEXT NOT NULL REFERENCES sketches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  code TEXT NOT NULL,
  seed TEXT NOT NULL,
  param_values TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX outputs_sketch ON outputs(sketch_id, created_at DESC);
CREATE INDEX outputs_user ON outputs(user_id, created_at DESC);

CREATE TABLE lesson_progress (
  user_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  completed_at INTEGER,
  PRIMARY KEY (user_id, lesson_id)
);
