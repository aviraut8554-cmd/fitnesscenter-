-- 0011_team_profiles.sql
-- Display-only profile fields for team members (Team page revamp).
--
-- These columns are purely presentational — avatar, specialty chips, short bio,
-- and an active/inactive status flag used only to render a badge. They do NOT
-- introduce new permission levels and do NOT change any RLS policy: role-based
-- access (owner/manager/support) is unchanged. `is_active` is a display flag;
-- it is not consulted by any policy and does not block sign-in.

alter table team_members
  add column profile_photo_url text
    check (profile_photo_url is null or length(trim(profile_photo_url)) > 0),
  add column specialty_tags text[] not null default '{}'::text[],
  add column bio text
    check (bio is null or length(bio) <= 1000),
  add column is_active boolean not null default true;
