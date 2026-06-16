CREATE TABLE IF NOT EXISTS app_forum__categories (
  id           TEXT NOT NULL,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#6b7280',
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app_forum__threads (
  id           TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  category_id  TEXT,
  author_id    TEXT NOT NULL,
  author_name  TEXT NOT NULL,
  pinned       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS app_forum__replies (
  id           TEXT NOT NULL,
  thread_id    TEXT NOT NULL,
  body         TEXT NOT NULL,
  author_id    TEXT NOT NULL,
  author_name  TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (id)
);

-- UNIQUE scoped to household so two households can each react with the same emoji
-- on app_forum__threads that happen to have the same UUID (astronomically unlikely but safe).
CREATE TABLE IF NOT EXISTS app_forum__reactions (
  id           TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  target_type  TEXT NOT NULL,
  emoji        TEXT NOT NULL,
  author_id    TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (target_id, emoji, author_id)
);

CREATE TABLE IF NOT EXISTS app_forum__forum_settings (
  key          TEXT NOT NULL,
  value        TEXT NOT NULL,
  PRIMARY KEY (key)
);
