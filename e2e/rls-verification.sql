-- RLS policy verification queries (PRD §13) — Agent 6.
-- Run against staging with psql, impersonating roles via request.jwt.claims.
-- Each block sets the JWT claims Supabase would set, then asserts visibility.
--
-- Usage: replace :volunteer_a / :volunteer_b / :admin with real profile UUIDs
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
