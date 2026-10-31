-- Collections: named groups of exhibits with a theme color. Each collection gets its own wing in
-- the museum; exhibits without one hang in the main hall (the 'main' row holds its name and color).
CREATE TABLE collections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX collections_user ON collections(user_id, position);

-- Existing wings become collections ('Main' was the default wing: those go to the main hall).
INSERT INTO collections (id, user_id, name, color, position, updated_at, created_at)
  SELECT lower(hex(randomblob(8))), user_id, wing, '#6fd3e0', 1, MIN(created_at), MIN(created_at)
  FROM exhibits WHERE wing != 'Main' GROUP BY user_id, wing;

ALTER TABLE exhibits ADD COLUMN collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL;
UPDATE exhibits SET collection_id = (
  SELECT c.id FROM collections c WHERE c.user_id = exhibits.user_id AND c.name = exhibits.wing
) WHERE wing != 'Main';
-- `wing` stays as a legacy column; nothing reads it any more.
