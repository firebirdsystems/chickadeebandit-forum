-- Denormalized reply/reaction counters on the thread row, maintained by
-- `manifest.write_effects` — the un-revert of the counters 004/005 refused.
--
-- The original attempt failed because replying and reacting are CROSS-MEMBER
-- acts while `threads` is owner_or_visibility: a non-supervisor's UPDATE gets
-- `AND author_id = <caller>` appended, so the bump against another member's
-- thread matched no row and the badge froze while the reply itself landed.
-- Write effects close exactly that: the hub appends the recompute below to the
-- same transaction as the reply/reaction write, running it with hub authority,
-- so no member ever writes these columns (they are `writable_by: []` in
-- row_policies.threads.column_write_acls) and no member needs to.
--
-- Both columns are in `db_plaintext_columns`: they hold derived integers, and
-- an effect may not assign a derived value to an encrypted column.
--
-- Recompute, not increment (the 007-migration lesson): `SET c = (SELECT
-- COUNT(*) …)` lands on the same value however often it runs, so it self-heals
-- the two lanes that delete rows WITHOUT firing effects —
--   * retention: threads carries retain_days 90 and sweeps replies/reactions as
--     `dependent_tables`; those sweeps fire no effects, but the parent thread
--     goes with them in the same sweep, so a stale count on a deleted row is
--     not observable. (A pinned thread is exempt, and so are its dependents —
--     the sweep resolves children from the parents it selected.)
--   * member_references.reactions on_removed "delete": removing a member drops
--     their reaction rows through a hub lane that fires no effects, so a
--     thread's reaction_count reads high until the next reaction on that
--     thread recomputes it. replies/threads are on_removed "keep", so
--     reply_count has no such lane.
--
-- Declaring the effects is not retroactive, so the backfill below is a copy of
-- the effect statements over every existing row. The counting subqueries are
-- served by idx_replies_thread_created and by reactions' UNIQUE (target_id,
-- emoji, author_id) leftmost prefix, so this is not a nested scan.

ALTER TABLE app_forum__threads ADD COLUMN reply_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_forum__threads ADD COLUMN reaction_count INTEGER NOT NULL DEFAULT 0;

UPDATE app_forum__threads SET
  reply_count = (SELECT COUNT(*) FROM app_forum__replies r WHERE r.thread_id = app_forum__threads.id),
  reaction_count = (SELECT COUNT(*) FROM app_forum__reactions x WHERE x.target_id = app_forum__threads.id);
