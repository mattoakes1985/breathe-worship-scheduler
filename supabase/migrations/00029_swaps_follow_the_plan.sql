-- 2026-10-11 review: swaps and the planner disagreed.
--  * An approved swap only moved the app assignment. The plan (rota_plan_slots)
--    and the band shown on the service page (published_rota) still named the
--    old person, they kept leader rights, and publishing the month again
--    undid the swap. Now an approved swap also moves the plan slot (locked,
--    so re-planning keeps it) and refreshes the published band.
--  * claim_swap only accepted the old role_eligibility list, which the team
--    list doesn't use. It now also accepts the instruments on the person's
--    team-list entry.
-- Owner: Agent 1. Function replacements only; no data changed.

-- Rebuild a service's published band from its plan (same shape as publish_month).
create or replace function refresh_published_rota(p_service_id uuid) returns void
language sql security definer set search_path = public as $$
  update services set published_rota = coalesce((
    select jsonb_agg(jsonb_build_object('role', ro.name, 'slot', r.slot_index, 'name', p.display_name) order by ro.sort_order, r.slot_index)
    from rota_plan_slots r
    join team_people p on p.id = r.person_id
    join roles ro on ro.id = r.role_id
    where r.service_id = p_service_id), '[]')
  where id = p_service_id and published_at is not null;
$$;
revoke execute on function refresh_published_rota(uuid) from anon, authenticated, public;

create or replace function claim_swap(p_swap_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_swap swap_requests%rowtype;
  v_assignment assignments%rowtype;
  v_service services%rowtype;
  r record;
begin
  select * into v_swap from swap_requests where id = p_swap_id for update;
  if not found then raise exception 'Swap not found'; end if;
  if v_swap.status <> 'open' then raise exception 'Swap already claimed or closed'; end if;
  if v_swap.requested_by = auth.uid() then raise exception 'Cannot claim your own swap'; end if;

  select * into v_assignment from assignments where id = v_swap.original_assignment_id;
  if not exists (select 1 from role_eligibility
                 where profile_id = auth.uid() and role_id = v_assignment.role_id and is_active)
     and not exists (select 1 from person_roles pr join team_people tp on tp.id = pr.person_id
                     where tp.profile_id = auth.uid() and tp.is_active and pr.role_id = v_assignment.role_id) then
    raise exception 'You are not eligible for this role';
  end if;
  select * into v_service from services where id = v_assignment.service_id;
  if exists (
    select 1 from assignments a join services s on s.id = a.service_id
    where a.profile_id = auth.uid() and a.status in ('invited','confirmed')
      and s.service_date = v_service.service_date
      and s.id <> v_service.id
      and (s.start_time, coalesce(s.end_time, s.start_time + interval '2 hours'))
          overlaps (v_service.start_time, coalesce(v_service.end_time, v_service.start_time + interval '2 hours'))
  ) then
    raise exception 'You are already serving at an overlapping service';
  end if;

  update swap_requests
    set status = 'claimed', claimed_by_profile_id = auth.uid(), claimed_at = now()
    where id = p_swap_id;

  perform notify(v_swap.requested_by, 'swap_claimed', 'Your swap was claimed',
    'Someone offered to take your slot — awaiting Team Lead approval.', v_assignment.service_id);
  for r in select tm.profile_id from team_memberships tm
           where tm.team_id = v_service.team_id and tm.is_team_lead and tm.is_active loop
    perform notify(r.profile_id, 'swap_claimed', 'Swap awaiting approval',
      'A swap for ' || v_service.title || ' has been claimed and needs your approval.', v_service.id);
  end loop;
end;
$$;

create or replace function resolve_swap(p_swap_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_swap swap_requests%rowtype;
  v_assignment assignments%rowtype;
  v_service services%rowtype;
  v_from uuid; v_to uuid;
begin
  select * into v_swap from swap_requests where id = p_swap_id for update;
  if not found then raise exception 'Swap not found'; end if;
  if v_swap.status <> 'claimed' then raise exception 'Swap is not awaiting approval'; end if;

  select * into v_assignment from assignments where id = v_swap.original_assignment_id;
  select * into v_service from services where id = v_assignment.service_id;
  if not (is_team_lead(auth.uid(), v_service.team_id) or is_admin(auth.uid())) then
    raise exception 'Only a Team Lead or Admin can resolve a swap';
  end if;

  if p_approve then
    update assignments set status = 'substituted' where id = v_assignment.id;
    insert into assignments (service_id, role_id, profile_id, status, assigned_by, responded_at, substitute_for_assignment_id)
    values (v_assignment.service_id, v_assignment.role_id, v_swap.claimed_by_profile_id,
            'confirmed', auth.uid(), now(), v_assignment.id);
    update swap_requests set status = 'approved', approved_by = auth.uid(), approved_at = now()
      where id = p_swap_id;

    -- keep the plan and the published band in step with the swap
    select id into v_from from team_people where profile_id = v_swap.requested_by;
    select id into v_to from team_people where profile_id = v_swap.claimed_by_profile_id;
    if v_from is not null and v_to is not null then
      update rota_plan_slots
        set person_id = v_to, locked = true, source = 'manual',
            reasons = array_append(reasons, 'Swap approved')
        where service_id = v_assignment.service_id and role_id = v_assignment.role_id and person_id = v_from;
      perform refresh_published_rota(v_assignment.service_id);
    end if;

    perform notify(v_swap.requested_by, 'swap_approved', 'Swap approved',
      'Your slot at ' || v_service.title || ' has been transferred.', v_service.id);
    perform notify(v_swap.claimed_by_profile_id, 'swap_approved', 'Swap approved — you''re on',
      'You are now serving at ' || v_service.title || ' on ' ||
      to_char(v_service.service_date, 'DD Mon YYYY') || '.', v_service.id);
  else
    perform notify(v_swap.claimed_by_profile_id, 'swap_rejected', 'Swap not approved',
      'Your claim for the slot at ' || v_service.title || ' was not approved.', v_service.id);
    update swap_requests
      set status = 'open', claimed_by_profile_id = null, claimed_at = null
      where id = p_swap_id;
  end if;
end;
$$;
