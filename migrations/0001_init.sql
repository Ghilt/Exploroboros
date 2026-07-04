-- Community gallery: one row per uploaded creation.
-- The compact display image lives in R2 under `image_key`; `recipe_json` is the normalised recipe
-- (validated server-side by parseRecipe) that regenerates the creation on "Import to canvas".
-- `id` is the tiebreaker in every sort index so keyset pagination is totally ordered (no dup/skip
-- across ties). `created_at` is unix epoch ms (UTC) — used both for sort and the 10/day cap.

CREATE TABLE creations (
  id          TEXT PRIMARY KEY,           -- crypto.randomUUID(), server-minted
  name        TEXT NOT NULL,              -- grid label (1..60 chars)
  message     TEXT NOT NULL DEFAULT '',   -- spotlight message (<=280 chars)
  tiling_id   TEXT NOT NULL,              -- one of the allow-listed tiling ids
  recipe_json TEXT NOT NULL,              -- normalised recipe JSON (re-serialised from parseRecipe)
  image_key   TEXT NOT NULL,              -- R2 object key, "img/<id>.webp"
  width       INTEGER NOT NULL,           -- compact image size in px (grid aspect / layout stability)
  height      INTEGER NOT NULL,
  upvotes     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL            -- unix epoch ms (UTC)
);

-- Sort: newest first.
CREATE INDEX idx_creations_created ON creations (created_at DESC, id DESC);
-- Sort: most upvoted (created_at/id break ties for stable keyset paging).
CREATE INDEX idx_creations_upvotes ON creations (upvotes DESC, created_at DESC, id DESC);
-- Sort: by name, case-insensitive.
CREATE INDEX idx_creations_name    ON creations (name COLLATE NOCASE ASC, id ASC);
-- Filter by tiling, newest first within it.
CREATE INDEX idx_creations_tiling  ON creations (tiling_id, created_at DESC, id DESC);
