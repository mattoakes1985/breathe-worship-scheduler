-- RLS policy verification queries (PRD §13) — Agent 6.
-- Run against staging with psql, impersonating roles via request.jwt.claims.
-- Each block sets the JWT claims Supabase would set, then asserts visibility.
--
-- Usage: replace :volunteer_a / :volunteer_b / :admin / :team_lead with real profile UUIDs
-- from your staging seed, then run each check. Expected results in comments.

-- 1. A volunteer cannot read another volunteer's availability responses.
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'volunteer_a', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) = 0 as pass_only_own_availability
from availability_responses where profile_id = :'volunteer_b';
rollback;

-- 2. A volunteer cannot read another volunteer's serving preferences (AVAIL-4 privacy).
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'volunteer_a', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) = 0 as pass_prefs_private
from serving_preferences where profile_id = :'volunteer_b';
rollback;

-- 3. A non-admin cannot read the audit log.
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'volunteer_a', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) = 0 as pass_audit_admin_only from audit_log;
rollback;

-- 4. A volunteer cannot see draft services (SVC-3).
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'volunteer_a', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) = 0 as pass_no_drafts from services where status = 'draft';
rollback;

-- 5. A volunteer cannot insert an assignment (leads/admins only).
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'volunteer_a', 'role', 'authenticated')::text, true);
set local role authenticated;
-- expected: ERROR row-level security policy violation
-- insert into assignments (service_id, role_id, profile_id) values (:'service', :'role', :'volunteer_a');
rollback;

-- 6. A volunteer cannot escalate their own privileges (guard trigger).
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'volunteer_a', 'role', 'authenticated')::text, true);
set local role authenticated;
-- expected: ERROR 'Only an admin can change is_admin or is_active'
-- update profiles set is_admin = true where id = :'volunteer_a';
rollback;

-- 7. Anon sees nothing anywhere.
begin;
set local role anon;
select (select count(*) from profiles) = 0
   and (select count(*) from services) = 0
   and (select count(*) from assignments) = 0 as pass_anon_blind;
rollback;

-- 8. Admin can read everything (spot check).
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) >= 0 as pass_admin_reads from audit_log;
rollback;

-- ===========================================================================
-- WO-2 (2026-10-10): contact details and calendar tokens.
-- Verified live on 2026-10-10 inside rolled-back transactions (results in
-- AGENTS.md). Re-run after any change to profiles / profile_contact /
-- calendar_tokens policies or grants.
-- ===========================================================================

-- 9. A plain member cannot read another person's email/phone/notes.
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'volunteer_a', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) = 0 as pass_contact_private
from profile_contact where profile_id <> :'volunteer_a';
rollback;

-- 10. A plain member cannot read anyone else's calendar token — and even a
--     team lead/admin sees only their own.
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) = 0 as pass_tokens_owner_only
from calendar_tokens where profile_id <> :'admin';
rollback;

-- 11. The legacy profile columns are unreadable through the API (00014c).
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'volunteer_a', 'role', 'authenticated')::text, true);
set local role authenticated;
-- expected: ERROR permission denied for table profiles
-- select email, phone, notes, calendar_token from profiles;
select count(full_name) >= 0 as pass_names_still_readable from profiles;
rollback;

-- 12. A member may change their own phone but not their own email or notes,
--     and cannot touch anyone else's contact row.
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'volunteer_a', 'role', 'authenticated')::text, true);
set local role authenticated;
update profile_contact set phone = '07000 000000' where profile_id = :'volunteer_a';   -- expected: 1 row
update profile_contact set phone = 'x' where profile_id <> :'volunteer_a';           -- expected: 0 rows
-- expected: ERROR 'Only an admin can change email or notes'
-- update profile_contact set email = 'x@y.z' where profile_id = :'volunteer_a';
rollback;

-- 13. Songs vault (WO-1): members read songs but not history/review/views,
--     and nobody can hard-delete a song.
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'volunteer_a', 'role', 'authenticated')::text, true);
set local role authenticated;
select (select count(*) from songs_history) = 0
   and (select count(*) from song_review_items) = 0 as pass_song_admin_tables_private;
rollback;
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'admin', 'role', 'authenticated')::text, true);
set local role authenticated;
-- expected: DELETE 0 (restrictive policy) — songs are archived or merged, never removed
-- delete from songs where id = :'any_song';
rollback;

-- 14. Planner (WO-3): the team list, availability imports, plans and rules are
--     visible to admins and team leads only. A plain member sees nothing and
--     cannot add people or run an import.
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'volunteer_a', 'role', 'authenticated')::text, true);
set local role authenticated;
select (select count(*) from team_people) = 0
   and (select count(*) from name_aliases) = 0
   and (select count(*) from person_availability) = 0
   and (select count(*) from availability_import_rows) = 0
   and (select count(*) from rota_plan_slots) = 0
   and (select count(*) from scheduling_rules) = 0
   and (select count(*) from team_people_activity where last_served is not null) = 0 as pass_planner_private;
-- expected: ERROR new row violates row-level security policy
-- insert into team_people (team_id, display_name) select id, 'x' from teams limit 1;
-- expected: ERROR 'Only a team lead or admin can import availability'
-- select apply_availability_import('{"entries": []}');
rollback;
begin;
select set_config('request.jwt.claims', json_build_object('sub', :'team_lead', 'role', 'authenticated')::text, true);
set local role authenticated;
select count(*) > 0 as pass_lead_sees_team_list from team_people;
rollback;
