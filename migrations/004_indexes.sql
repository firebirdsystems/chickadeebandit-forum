-- The forum shipped with no indexes, on the highest-cardinality table set in the
-- general catalog: every thread open scanned all replies, every thread list
-- scanned all threads.
--
-- `reactions` deliberately gets nothing new: UNIQUE (target_id, emoji, author_id)
-- from 001_init already backs the `WHERE target_id IN (...)` and
-- `WHERE target_id = ? AND emoji = ? AND author_id = ?` paths on its leftmost
-- prefix, so an extra index would be redundant write cost.

-- Thread view: WHERE thread_id = ? ORDER BY created_at ASC
-- Also the reply-count fan-in: WHERE thread_id IN (...)
CREATE INDEX IF NOT EXISTS idx_replies_thread_created
  ON app_forum__replies (thread_id, created_at);

-- Thread list filtered by category: ORDER BY pinned DESC, created_at DESC
CREATE INDEX IF NOT EXISTS idx_threads_category_pinned_created
  ON app_forum__threads (category_id, pinned, created_at);

-- Unfiltered thread list (same ORDER BY), and the retention sweep's
-- WHERE created_at < ? AND pinned = 0.
CREATE INDEX IF NOT EXISTS idx_threads_pinned_created
  ON app_forum__threads (pinned, created_at);
