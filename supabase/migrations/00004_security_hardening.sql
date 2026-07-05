-- Security hardening from Supabase advisor lints (run 2026-07-05).
-- 1) Pin search_path on set_updated_at.
-- 2) Tighten the always-true WITH CHECK on the leads-manage-swaps policy.
-- 3) Trigger/internal functions must not be callable via the RPC API;
--    user-facing RPCs stay executable by authenticated only (each already
--    enforces its own auth checks internally), never by anon.

-- (1)
create or replace function set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- (2)
drop policy "leads manage swaps" on swap_requests;
create policy "leads manage swaps" on swap_requests for update
  using (exists (select 1 from assignments a join services s on s.id = a.service_id
                 where a.id = swap_requests.original_assignment_id
                 and (is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))))
  with check (exists (select 1 from assignments a join services s on s.id = a.service_id
                 where a.id = swap_requests.original_assignment_id
                 and (is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))));

-- (3) Internal-only: not callable through the API by anyone
revoke execute on function audit_row_change() from anon, authenticated, public;
revoke execute on function guard_profile_privileges() from anon, authenticated, public;
revoke execute on function handle_new_user() from anon, authenticated, public;
revoke execute on function notify_on_assignment() from anon, authenticated, public;
revoke execute on function notify_on_service_cancelled() from anon, authenticated, public;
revoke execute on function notify(uuid, text, text, text, uuid) from anon, authenticated, public;
revoke execute on function set_updated_at() from anon, authenticated, public;

-- User-facing RPCs: authenticated only (they self-check admin/lead/ownership)
revoke execute on function claim_swap(uuid) from anon, public;
revoke execute on function resolve_swap(uuid, boolean) from anon, public;
revoke execute on function respond_to_assignment(uuid, text, text) from anon, public;
revoke execute on function generate_services_from_template(uuid, date[]) from anon, public;
revoke execute on function get_my_stats() from anon, public;
revoke execute on function export_profile_data(uuid) from anon, public;
revoke execute on function erase_profile_personal_data(uuid) from anon, public;

-- RLS helper predicates stay executable (policies evaluate them in the
-- caller's context); revoke only from anon where they'd leak information.
revoke execute on function is_admin(uuid) from public;
revoke execute on function is_team_lead(uuid, uuid) from public;
revoke execute on function is_any_team_lead(uuid) from public;
revoke execute on function is_assigned_to_service(uuid, uuid) from public;
revoke execute on function is_active_profile(uuid) from public;
grant execute on function is_admin(uuid), is_team_lead(uuid, uuid), is_any_team_lead(uuid),
  is_assigned_to_service(uuid, uuid), is_active_profile(uuid) to anon, authenticated;

-- Future functions: no execute for public/anon by default
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
