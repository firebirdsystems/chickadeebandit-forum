-- Reactions are now governed by an `owner_or_visibility` policy so that any member
-- can read reaction counts (everyone-visible) while only the reaction's author may
-- write/remove their own row — closing the forgery hole where a member could insert
-- a reaction under someone else's author_id or delete another member's reactions.
-- `visibility` defaults to 'everyone'; it is in the platform encryption skip-list so
-- the policy can compare it. Adults retain the owner_or_visibility write bypass, so
-- adult-driven thread deletion can still clean up everyone's reactions.
ALTER TABLE app_forum__reactions ADD COLUMN visibility TEXT NOT NULL DEFAULT 'everyone';
