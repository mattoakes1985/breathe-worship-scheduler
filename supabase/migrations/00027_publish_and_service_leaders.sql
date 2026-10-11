-- 2026-10-11: join the planner to the rest of the app (leaders-only scope,
-- no confirmations — Matt).
--  * publish_month(): marks the month's services published (visible to
--    signed-in members), snapshots the band onto the service
--    (published_rota: names only, the same thing the month grid shows), and
--    copies slots for people linked to an app account into assignments (as
--    confirmed), so leaders see their Sundays on Home and in their calendar.
--    Re-publishing updates it; people taken off are marked 'substituted'
--    (never deleted). Assignments for past services are never touched.
--  * Whoever is planned to lead a service may edit that service's songs and
--    running order (plus team leads and admins, as before).
-- Owner: Agent 1. Additive only.

alter table services
  add column published_rota jsonb not null default '[]',
  add column published_at timestamptz;

-- Is this user down to lead this service (in the plan, or in assignments)?
create or replace function is_service_leader(uid uuid, p_service_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid is not null and (
    exists (
      select 1 from rota_plan_slots r
      join team_people p on p.id = r.person_id
      join roles ro on ro.id = r.role_id and ro.name = 'Worship Leader'
      where r.service_id = p_service_id and p.profile_id = uid)
    or exists (
      select 1 from assignments a join roles ro on ro.id = a.role_id and ro.name = 'Worship Leader'
      where a.service_id = p_service_id and a.profile_id = uid and a.status in ('invited', 'confirmed'))
  );
$$;
revoke execute on function is_service_leader(uuid, uuid) from anon, public;
grant execute on function is_service_leader(uuid, uuid) to authenticated;

-- For the app: "am I leading this one?"
create or replace function am_i_leading(p_service_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_service_leader(auth.uid(), p_service_id);
$$;
revoke execute on function am_i_leading(uuid) from anon, public;
grant execute on function am_i_leading(uuid) to authenticated;

create policy "service leader manages songs" on service_songs for all
  using (is_service_leader(auth.uid(), service_id))
  with check (is_service_leader(auth.uid(), service_id));
create policy "service leader manages order items" on service_order_items for all
  using (is_service_leader(auth.uid(), service_id))
  with check (is_service_leader(auth.uid(), service_id));
-- leaders edit the service's theme / preacher / other items too (grid fields)
create policy "service leader updates service notes" on services for update
  using (is_service_leader(auth.uid(), id))
  with check (is_service_leader(auth.uid(), id));

-- …but only those four fields: anything else needs a team lead or admin.
create or replace function guard_service_leader_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or is_admin(auth.uid()) or is_team_lead(auth.uid(), old.team_id) then return new; end if;
  if (new.team_id, new.template_id, new.title, new.service_date, new.start_time, new.end_time, new.location, new.notes,
      new.status, new.availability_locked, new.scheduling_locked, new.archived_at, new.linked_service_id, new.is_all_in,
      new.published_rota, new.published_at)
     is distinct from
     (old.team_id, old.template_id, old.title, old.service_date, old.start_time, old.end_time, old.location, old.notes,
      old.status, old.availability_locked, old.scheduling_locked, old.archived_at, old.linked_service_id, old.is_all_in,
      old.published_rota, old.published_at) then
    raise exception 'A service leader can only change the theme, preacher, other items and events';
  end if;
  return new;
end;
$$;
revoke execute on function guard_service_leader_update() from anon, authenticated, public;
create trigger trg_guard_service_leader_update before update on services
  for each row execute function guard_service_leader_update();

create or replace function publish_month(p_month date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_services int := 0; v_added int := 0; v_removed int := 0; n int;
  s record;
begin
  if not is_planner(auth.uid()) then raise exception 'Only a team lead or admin can publish'; end if;

  for s in select id, service_date from services where archived_at is null and status <> 'cancelled' and service_date between v_from and v_to loop
    v_services := v_services + 1;

    -- band snapshot in grid-row order (role order, then slot)
    update services set
      status = 'published',
      published_at = now(),
      published_rota = coalesce((
        select jsonb_agg(jsonb_build_object('role', ro.name, 'slot', r.slot_index, 'name', p.display_name) order by ro.sort_order, r.slot_index)
        from rota_plan_slots r
        join team_people p on p.id = r.person_id
        join roles ro on ro.id = r.role_id
        where r.service_id = s.id), '[]')
    where id = s.id;

    -- assignments are only synced for services still to come; the past is history
    continue when s.service_date < current_date;

    -- linked accounts: add what's new…
    insert into assignments (service_id, role_id, profile_id, status, assigned_by)
    select distinct r.service_id, r.role_id, p.profile_id, 'confirmed', auth.uid()
    from rota_plan_slots r join team_people p on p.id = r.person_id
    where r.service_id = s.id and p.profile_id is not null
      and not exists (select 1 from assignments a where a.service_id = r.service_id and a.role_id = r.role_id
                      and a.profile_id = p.profile_id and a.status in ('invited', 'confirmed', 'needs_substitute'));
    get diagnostics n = row_count;
    v_added := v_added + n;

    -- …and mark anyone no longer in the plan as substituted (kept for history)
    update assignments a set status = 'substituted'
    where a.service_id = s.id and a.status in ('invited', 'confirmed', 'needs_substitute')
      and not exists (
        select 1 from rota_plan_slots r join team_people p on p.id = r.person_id
        where r.service_id = a.service_id and r.role_id = a.role_id and p.profile_id = a.profile_id);
    get diagnostics n = row_count;
    v_removed := v_removed + n;
  end loop;

  insert into audit_log (actor_profile_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'publish_month', 'services', null, jsonb_build_object('month', v_from, 'services', v_services, 'added', v_added, 'removed', v_removed));

  return jsonb_build_object('services', v_services, 'month', v_from, 'assignments_added', v_added, 'assignments_removed', v_removed);
end;
$$;
revoke execute on function publish_month(date) from anon, public;
grant execute on function publish_month(date) to authenticated;
