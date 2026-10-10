-- WO-3: atomic availability import + merging duplicate people in the team list.
-- Both are planner-only (admins and team leads) and never remove rows.
-- Owner: Agent 1. Additive only.

-- One call applies a whole MS Forms import, or nothing at all.
-- p jsonb:
-- { "file_name": text, "month": "YYYY-MM-01", "all_in_service_ids": [uuid],
--   "entries": [ { "raw_name": text, "person_id": uuid|null, "new_person_name": text|null,
--                  "remember": bool, "request": text, "submitted_at": timestamptz|null,
--                  "answers": jsonb, "availability": [ { "service_id": uuid, "response": "yes"|"no"|"maybe" } ] } ] }
create or replace function apply_availability_import(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  v_import uuid;
  e jsonb;
  a jsonb;
  v_pid uuid;
  v_new int := 0; v_aliases int := 0; v_rows int := 0; v_avail int := 0; v_skipped int := 0;
  v_name text;
begin
  if not is_planner(auth.uid()) then raise exception 'Only a team lead or admin can import availability'; end if;
  if jsonb_typeof(p->'entries') <> 'array' or jsonb_array_length(p->'entries') > 500 then
    raise exception 'Import must contain between 0 and 500 entries';
  end if;
  select id into v_team from teams order by created_at limit 1;

  insert into availability_imports (team_id, file_name, month, row_count, imported_by)
  values (v_team, left(coalesce(p->>'file_name', 'import'), 200), (p->>'month')::date,
          jsonb_array_length(p->'entries'), auth.uid())
  returning id into v_import;

  for e in select * from jsonb_array_elements(p->'entries') loop
    v_pid := nullif(e->>'person_id', '')::uuid;
    v_name := nullif(trim(coalesce(e->>'new_person_name', '')), '');

    if v_pid is null and v_name is not null then
      select id into v_pid from team_people
        where team_id = v_team and lower(trim(display_name)) = lower(v_name) and merged_into_id is null;
      if v_pid is null then
        insert into team_people (team_id, display_name) values (v_team, left(v_name, 80)) returning id into v_pid;
        v_new := v_new + 1;
      end if;
    end if;
    if v_pid is not null and not exists (select 1 from team_people where id = v_pid and merged_into_id is null) then
      raise exception 'Unknown or merged person %', v_pid;
    end if;

    if v_pid is not null and coalesce((e->>'remember')::boolean, true) then
      insert into name_aliases (person_id, alias, source) values (v_pid, left(e->>'raw_name', 80), 'form')
      on conflict (alias_key) do nothing;
      if found then v_aliases := v_aliases + 1; end if;
    end if;

    insert into availability_import_rows (import_id, raw_name, person_id, request_note, submitted_at, answers)
    values (v_import, left(e->>'raw_name', 120), v_pid, nullif(left(coalesce(e->>'request', ''), 1000), ''),
            nullif(e->>'submitted_at', '')::timestamptz, coalesce(e->'answers', '{}'));
    v_rows := v_rows + 1;

    if v_pid is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if jsonb_array_length(coalesce(e->'availability', '[]')) > 40 then raise exception 'Too many dates for one person'; end if;
    for a in select * from jsonb_array_elements(coalesce(e->'availability', '[]')) loop
      if not exists (select 1 from services where id = (a->>'service_id')::uuid and archived_at is null) then
        raise exception 'Unknown service %', a->>'service_id';
      end if;
      insert into person_availability (service_id, person_id, response, import_id, submitted_at)
      values ((a->>'service_id')::uuid, v_pid, a->>'response', v_import,
              coalesce(nullif(e->>'submitted_at', '')::timestamptz, now()))
      on conflict (service_id, person_id) do update
        set response = excluded.response, import_id = excluded.import_id, submitted_at = excluded.submitted_at;
      v_avail := v_avail + 1;
    end loop;
  end loop;

  update services set is_all_in = true
  where id in (select (x)::uuid from jsonb_array_elements_text(coalesce(p->'all_in_service_ids', '[]')) x)
    and archived_at is null;

  update availability_imports set summary = jsonb_build_object(
    'new_people', v_new, 'aliases', v_aliases, 'rows', v_rows, 'answers', v_avail, 'skipped', v_skipped)
  where id = v_import;

  insert into audit_log (actor_profile_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'availability_import', 'availability_imports', v_import,
          jsonb_build_object('file', p->>'file_name', 'rows', v_rows, 'answers', v_avail, 'new_people', v_new));

  return jsonb_build_object('import_id', v_import, 'new_people', v_new, 'aliases', v_aliases,
                            'rows', v_rows, 'answers', v_avail, 'skipped', v_skipped);
end;
$$;

-- Merge a duplicate person into another: names, instruments, availability and
-- plan slots move across; the duplicate is kept (inactive, merged_into_id set).
create or replace function merge_team_people(p_keep uuid, p_merge uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_aliases int; v_slots int; v_avail int; v_m record;
begin
  if not is_planner(auth.uid()) then raise exception 'Only a team lead or admin can merge people'; end if;
  if p_keep = p_merge then raise exception 'Choose two different people'; end if;
  if not exists (select 1 from team_people where id = p_keep and merged_into_id is null)
     or not exists (select 1 from team_people where id = p_merge and merged_into_id is null) then
    raise exception 'Both people must exist and not already be merged';
  end if;

  update name_aliases set person_id = p_keep where person_id = p_merge;
  get diagnostics v_aliases = row_count;
  insert into name_aliases (person_id, alias, source)
  select p_keep, display_name, 'manual' from team_people where id = p_merge
  on conflict (alias_key) do nothing;

  insert into person_roles (person_id, role_id, rank)
  select p_keep, role_id, rank from person_roles where person_id = p_merge
  on conflict (person_id, role_id) do update set rank = least(person_roles.rank, excluded.rank);

  update person_availability pa set person_id = p_keep
  where pa.person_id = p_merge
    and not exists (select 1 from person_availability k where k.person_id = p_keep and k.service_id = pa.service_id);
  get diagnostics v_avail = row_count;

  update rota_plan_slots set person_id = p_keep where person_id = p_merge;
  get diagnostics v_slots = row_count;
  update availability_import_rows set person_id = p_keep where person_id = p_merge;

  select profile_id, household_id, max_per_month, full_name into v_m from team_people where id = p_merge;
  -- free the merged person's account link first (profile_id is unique)
  update team_people set merged_into_id = p_keep, is_active = false, profile_id = null where id = p_merge;
  update team_people set
    profile_id = coalesce(profile_id, v_m.profile_id),
    household_id = coalesce(household_id, v_m.household_id),
    max_per_month = coalesce(max_per_month, v_m.max_per_month),
    full_name = coalesce(full_name, v_m.full_name)
  where id = p_keep;

  insert into audit_log (actor_profile_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'merge_team_people', 'team_people', p_keep, jsonb_build_object('merged', p_merge));

  return jsonb_build_object('aliases_moved', v_aliases, 'availability_moved', v_avail, 'plan_slots_moved', v_slots);
end;
$$;

revoke execute on function apply_availability_import(jsonb) from anon, public;
revoke execute on function merge_team_people(uuid, uuid) from anon, public;
grant execute on function apply_availability_import(jsonb), merge_team_people(uuid, uuid) to authenticated;
