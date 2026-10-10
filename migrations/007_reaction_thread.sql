-- The thread a reaction sits under: its own id for a reaction on a thread, the
-- reply's thread for a reaction on a reply.
--
-- Deleting a thread removes its replies and reactions through
-- `manifest.delete_cascades`, which reaches a parent's direct children only.
-- A reaction on a reply is a grandchild of the thread, reachable from it only
-- through the reply, so it would be left behind. Naming the thread on every
-- reaction makes all of them direct children.
--
-- The thread's reaction count is keyed by this column too (manifest
-- `write_effects.reactions`): it counts the reactions that name the thread as
-- both their thread and their target, and is recomputed for the thread a
-- reaction names here. The hub admits a cascade into this table only on that
-- footing, since the cascade and the count must agree on which thread a
-- reaction belongs to. Counts already stored are unchanged by it: after the
-- backfill below, a reaction on a thread names that thread in both columns.
--
-- The backfill reads id columns only, which are stored as written.
ALTER TABLE app_forum__reactions ADD COLUMN thread_id TEXT;

UPDATE app_forum__reactions SET thread_id = COALESCE(
  (SELECT r.thread_id FROM app_forum__replies r WHERE r.id = app_forum__reactions.target_id),
  target_id
);

CREATE INDEX IF NOT EXISTS idx_reactions_thread
  ON app_forum__reactions (thread_id);
