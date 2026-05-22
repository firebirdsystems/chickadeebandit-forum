CREATE TABLE IF NOT EXISTS categories (
  household_id UUID NOT NULL DEFAULT current_setting('app.household_id', true)::uuid,
  id           TEXT NOT NULL,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#6b7280',
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (household_id, id)
);

CREATE TABLE IF NOT EXISTS threads (
  household_id UUID NOT NULL DEFAULT current_setting('app.household_id', true)::uuid,
  id           TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  category_id  TEXT,
  author_id    TEXT NOT NULL,
  author_name  TEXT NOT NULL,
  pinned       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (household_id, id)
);

CREATE TABLE IF NOT EXISTS replies (
  household_id UUID NOT NULL DEFAULT current_setting('app.household_id', true)::uuid,
  id           TEXT NOT NULL,
  thread_id    TEXT NOT NULL,
  body         TEXT NOT NULL,
  author_id    TEXT NOT NULL,
  author_name  TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (household_id, id)
);

-- UNIQUE scoped to household so two households can each react with the same emoji
-- on threads that happen to have the same UUID (astronomically unlikely but safe).
CREATE TABLE IF NOT EXISTS reactions (
  household_id UUID NOT NULL DEFAULT current_setting('app.household_id', true)::uuid,
  id           TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  target_type  TEXT NOT NULL,
  emoji        TEXT NOT NULL,
  author_id    TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  UNIQUE (household_id, target_id, emoji, author_id)
);

CREATE TABLE IF NOT EXISTS forum_settings (
  household_id UUID NOT NULL DEFAULT current_setting('app.household_id', true)::uuid,
  key          TEXT NOT NULL,
  value        TEXT NOT NULL,
  PRIMARY KEY (household_id, key)
);
