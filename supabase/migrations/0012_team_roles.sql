-- 0012_team_roles.sql
-- Adds two new selectable team roles: `coach` and `dietician`.
--
-- These are added to the `team_role` enum so owners can assign them when
-- inviting staff. No RLS policy references them yet, so — like `support` —
-- members with these roles currently get read-only (team-member) access.
-- Their write permissions are intentionally left to a later decision; adding
-- them to the `owner,manager` policy arrays is all that's needed to elevate.

alter type team_role add value if not exists 'coach';
alter type team_role add value if not exists 'dietician';
