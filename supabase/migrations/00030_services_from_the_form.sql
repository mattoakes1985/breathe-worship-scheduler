-- 2026-10-11, Matt: "We probably won't be pre-planning services on here — use
-- the MS form excel import to derive the services (and other events) for the
-- month." The import now decides the month's services:
--  * every date column in the form becomes a service: matched to one that
--    already exists, or created here (Sunday at the template time = the Sunday
--    template; anything else is a one-off event with the same band roles);
--  * services in that month the form doesn't mention can be removed — only if
--    nothing has been planned, chosen or published for them (archived, never
--    deleted).
-- Owner: Agent 1. New function only.

create or replace function prepare_form_services(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_tpl service_templates%rowtype;
  c jsonb;
  v_id uuid;
  v_date date;
  v_time time;
  v_title text;
  v_created jsonb := '[]';
  v_archived int := 0;
  v_kept jsonb := '[]';
  a text;
begin
  if not is_planner(auth.uid()) then raise exception 'Only a team lead or admin can set up services'; end if;
  if jsonb_typeof(coalesce(p->'create', '[]')) <> 'array' or jsonb_array_length(coalesce(p->'create', '[]')) > 60
     or jsonb_typeof(coalesce(p->'archive_ids', '[]')) <> 'array' or jsonb_array_length(coalesce(p->'archive_ids', '[]')) > 60 then
    raise exception 'Too many services in one go';
  end if;

  select id into v_team from teams order by created_at limit 1;
  select * into v_tpl from service_templates where team_id = v_team and is_active order by name limit 1;

  for c in select * from jsonb_array_elements(coalesce(p->'create', '[]')) loop
    v_date := (c->>'date')::date;
    v_time := (c->>'start_time')::time;
    v_title := left(nullif(trim(c->>'title'), ''), 120);
    if v_title is null then raise exception 'Every service needs a name'; end if;

    -- reuse a live service at the same date and time (e.g. a stale screen)
    select id into v_id from services
      where team_id = v_team and service_date = v_date and start_time = v_time and archived_at is null and status <> 'cancelled'
      limit 1;
    if v_id is null then
      insert into services (team_id, template_id, title, service_date, start_time, end_time, status, is_all_in, created_by)
      values (
        v_team,
        case when extract(dow from v_date) = 0 and v_tpl.id is not null and v_time = v_tpl.default_start_time then v_tpl.id end,
        v_title, v_date, v_time,
        case when v_tpl.default_duration_minutes is not null and v_time + make_interval(mins => v_tpl.default_duration_minutes) > v_time
             then v_time + make_interval(mins => v_tpl.default_duration_minutes) end,
        'draft', coalesce((c->>'is_all_in')::boolean, false), auth.uid())
      returning id into v_id;
      if v_tpl.id is not null then
        insert into service_role_requirements (service_id, role_id, quantity_required, is_required)
        select v_id, r.role_id, r.quantity_required, r.is_required from template_role_requirements r where r.template_id = v_tpl.id;
      end if;
    end if;
    v_created := v_created || jsonb_build_object('key', c->>'key', 'id', v_id);
    v_id := null;
  end loop;

  for a in select jsonb_array_elements_text(coalesce(p->'archive_ids', '[]')) loop
    if exists (select 1 from services s where s.id = a::uuid and s.team_id = v_team and s.archived_at is null and s.published_at is null)
       and not exists (select 1 from rota_plan_slots where service_id = a::uuid and person_id is not null)
       and not exists (select 1 from service_songs where service_id = a::uuid)
       and not exists (select 1 from service_song_shortlist where service_id = a::uuid)
       and not exists (select 1 from service_order_items where service_id = a::uuid)
       and not exists (select 1 from legacy_assignments where service_id = a::uuid)
       and not exists (select 1 from assignments where service_id = a::uuid and status in ('invited', 'confirmed', 'needs_substitute')) then
      update services set archived_at = now() where id = a::uuid;
      v_archived := v_archived + 1;
    else
      v_kept := v_kept || to_jsonb(a);
    end if;
  end loop;

  insert into audit_log (actor_profile_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'prepare_form_services', 'services', null,
          jsonb_build_object('created', jsonb_array_length(v_created), 'archived', v_archived, 'kept', v_kept));

  return jsonb_build_object('services', v_created, 'archived', v_archived, 'kept', v_kept);
end;
$$;
revoke execute on function prepare_form_services(jsonb) from anon, public;
grant execute on function prepare_form_services(jsonb) to authenticated;
