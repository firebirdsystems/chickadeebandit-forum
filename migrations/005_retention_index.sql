-- Thread retention moved from a client-side sweep (runAutoDelete, run by
-- whoever happened to open the page) to the hub's `retain_days` runner. That
-- runner selects expiring rows with `WHERE created_at < ? ... ORDER BY
-- created_at ASC`, so it needs an index LEADING on created_at — the existing
-- pair (idx_threads_pinned_created, idx_threads_category_pinned_created) lead
-- on pinned/category_id and cannot serve it.
--
-- `pinned` rides along as the second column because the sweep also carries the
-- exempt_when guard (pinned threads are kept however old), so the whole
-- predicate is answered from the index.
CREATE INDEX IF NOT EXISTS idx_threads_created_pinned
  ON app_forum__threads (created_at, pinned);
