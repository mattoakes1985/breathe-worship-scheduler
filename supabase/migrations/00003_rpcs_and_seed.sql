-- Breathe Worship Scheduler — RPCs, notification triggers, GDPR paths, seed
-- Owner: Agent 1. RPC signatures here are the frontend contract (PRD §18.2).

-- ---------------------------------------------------------------------------
-- In-app notification helper (email/push fan-out is an Edge Function concern;
-- per §8.5 a failed send must never block the core action)
-- ---------------------------------------------------------------------------
create or replace function notify(
  p_profile_id uuid, p_type text, p_title text, p_body text, p_service_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (profile_id, type, title, body, related_service_id, sent_via)
  values (p_profile_id, p_type, p_title, p_body, p_service_id, 'in_app');
exception when others then null; -- notification failure must not block the action
end;
$$;

-- Notify volunteer when assigned (§12: assignment made → immediately)
create or replace function notify_on_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  select s.title || ' — ' || to_char(s.service_date, 'DD Mon YYYY') into v_title
    from services s where s.id = new.service_id;
  perform notify(new.profile_id, 'assignment_made', 'You''ve been scheduled',
    'You have been assigned to serve at ' || coalesce(v_title, 'a service') || '. Please confirm or decline.',
    new.service_id);
  return new;
end;
$$;
create trigger trg_notify_assignment after insert on assignments
  for each row execute function notify_on_assignment();

-- Notify all assigned volunteers when a service is cancelled (§12)
create or replace function notify_on_service_cancelled() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for r in select distinct profile_id from assignments where service_id = new.id loop
      perform notify(r.profile_id, 'service_cancelled', 'Service cancelled',
        new.title || ' on ' || to_char(new.service_date, 'DD Mon YYYY') || ' has been cancelled.',
        new.id);
    end loop;
  end if;
  return new;
end;
$$;
create trigger trg_notify_service_cancelled after update on services
  for each row execute function notify_on_service_cancelled();

-- ---------------------------------------------------------------------------
-- SCHED-4: volunteer confirms/declines their assignment (controlled transition)
-- ---------------------------------------------------------------------------
create or replace function respond_to_assignment(
  p_assignment_id uuid, p_response text, p_decline_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_assignment assignments%rowtype;
  v_service services%rowtype;
  r record;
begin
  select * into v_assignment from assignments where id = p_assignment_id;
  if not found or v_assignment.profile_id <> auth.uid() then
    raise exception 'Not your assignment';
  end if;
  if v_assignment.status not in ('invited','confirmed') then
    raise exception 'Assignment can no longer be changed';
  end if;
  if p_response = 'confirmed' then
    update assignments set status = 'confirmed', responded_at = now()
      where id = p_assignment_id;
  elsif p_response = 'declined' then
    if p_decline_reason is null or length(trim(p_decline_reason)) = 0 then
      raise exception 'Declining requires a reason';
    end if;
    update assignments
      set status = 'needs_substitute', responded_at = now(), decline_reason = p_decline_reason
      where id = p_assignment_id;
    select * into v_service from services where id = v_assignment.service_id;
    for r in select tm.profile_id from team_memberships tm
             where tm.team_id = v_service.team_id and tm.is_team_lead and tm.is_active loop
      perform notify(r.profile_id, 'assignment_declined', 'Slot needs a substitute',
        'A volunteer declined their assignment for ' || v_service.title || ' (' ||
        to_char(v_service.service_date, 'DD Mon YYYY') || '). Reason: ' || p_decline_reason,
        v_service.id);
    end loop;
  else
    raise exception 'Response must be confirmed or declined';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- SWAP-2: atomic claim (row lock prevents double-claims)
-- ---------------------------------------------------------------------------
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
                 where profile_id = auth.uid() and role_id = v_assignment.role_id and is_active) then
    raise exception 'You are not eligible for this role';
  end if;
  -- clash guard (SCHED-3): claimer must not already serve elsewhere at that time
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

-- ---------------------------------------------------------------------------
-- SWAP-3: Team Lead approves or rejects a claimed swap
-- ---------------------------------------------------------------------------
create or replace function resolve_swap(p_swap_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_swap swap_requests%rowtype;
  v_assignment assignments%rowtype;
  v_service services%rowtype;
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

-- ---------------------------------------------------------------------------
-- SVC-2: generate services from a template for a set of dates (bounded queries)
-- ---------------------------------------------------------------------------
create or replace function generate_services_from_template(
  p_template_id uuid, p_dates date[]
) returns setof services language plpgsql security definer set search_path = public as $$
declare
  v_template service_templates%rowtype;
  v_date date;
  v_service services%rowtype;
begin
  select * into v_template from service_templates where id = p_template_id;
  if not found then raise exception 'Template not found'; end if;
  if not (is_team_lead(auth.uid(), v_template.team_id) or is_admin(auth.uid())) then
    raise exception 'Only a Team Lead or Admin can generate services';
  end if;
  foreach v_date in array p_dates loop
    insert into services (team_id, template_id, title, service_date, start_time, end_time, created_by)
    values (
      v_template.team_id, v_template.id, v_template.name, v_date,
      coalesce(v_template.default_start_time, time '10:30'),
      coalesce(v_template.default_start_time, time '10:30')
        + make_interval(mins => coalesce(v_template.default_duration_minutes, 90)),
      auth.uid()
    ) returning * into v_service;
    insert into service_role_requirements (service_id, role_id, quantity_required, is_required)
    select v_service.id, role_id, quantity_required, is_required
    from template_role_requirements where template_id = v_template.id;
    return next v_service;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- STAT-1/2: personal stats, computed at read time (PRD §7.2 note), own data only
-- ---------------------------------------------------------------------------
create or replace function get_my_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_served_month int; v_served_quarter int; v_served_year int; v_served_total int;
  v_declined_late int; v_streak int := 0;
  v_first date;
  v_pref record;
  r record;
begin
  select count(*) filter (where s.service_date >= date_trunc('month', current_date)),
         count(*) filter (where s.service_date >= date_trunc('quarter', current_date)),
         count(*) filter (where s.service_date >= date_trunc('year', current_date)),
         count(*),
         min(s.service_date)
    into v_served_month, v_served_quarter, v_served_year, v_served_total, v_first
    from assignments a join services s on s.id = a.service_id
    where a.profile_id = v_uid and a.status in ('confirmed','substituted')
      and s.service_date <= current_date and s.status in ('published','completed');

  select count(*) into v_declined_late
    from assignments a where a.profile_id = v_uid and a.status = 'needs_substitute';

  for r in
    select a.status from assignments a join services s on s.id = a.service_id
    where a.profile_id = v_uid and s.service_date <= current_date
      and s.status in ('published','completed')
    order by s.service_date desc
  loop
    exit when r.status not in ('confirmed');
    v_streak := v_streak + 1;
  end loop;

  select sp.max_services_per_period, sp.period_type into v_pref
    from serving_preferences sp where sp.profile_id = v_uid
    order by sp.team_id nulls last limit 1;

  return jsonb_build_object(
    'served_this_month', coalesce(v_served_month, 0),
    'served_this_quarter', coalesce(v_served_quarter, 0),
    'served_this_year', coalesce(v_served_year, 0),
    'served_total', coalesce(v_served_total, 0),
    'first_served_on', v_first,
    'current_streak', v_streak,
    'declined_late_count', coalesce(v_declined_late, 0),
    'reliability_pct',
      case when coalesce(v_served_total,0) + coalesce(v_declined_late,0) = 0 then null
           else round(100.0 * v_served_total / (v_served_total + v_declined_late)) end,
    'preferred_max_per_period', v_pref.max_services_per_period,
    'preferred_period_type', v_pref.period_type
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- UK GDPR (§8.3, must-have): subject-access export + anonymizing erasure
-- ---------------------------------------------------------------------------
create or replace function export_profile_data(p_profile_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Admin only'; end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) from profiles p where p.id = p_profile_id),
    'memberships', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from team_memberships t where t.profile_id = p_profile_id),
    'role_eligibility', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from role_eligibility t where t.profile_id = p_profile_id),
    'serving_preferences', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from serving_preferences t where t.profile_id = p_profile_id),
    'availability_responses', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from availability_responses t where t.profile_id = p_profile_id),
    'blockout_dates', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from blockout_dates t where t.profile_id = p_profile_id),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from assignments t where t.profile_id = p_profile_id),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from notifications t where t.profile_id = p_profile_id)
  );
end;
$$;

create or replace function erase_profile_personal_data(p_profile_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Admin only'; end if;
  -- Anonymize, never cascade-delete: rota history stays intact (§8.3)
  update profiles set
    full_name = 'Former volunteer', preferred_name = null, email = 'erased@invalid.local',
    phone = null, avatar_url = null, notes = null, is_active = false
    where id = p_profile_id;
  delete from blockout_dates where profile_id = p_profile_id;
  delete from serving_preferences where profile_id = p_profile_id;
  delete from notifications where profile_id = p_profile_id;
  update availability_responses set note = null where profile_id = p_profile_id;
  update assignments set decline_reason = null where profile_id = p_profile_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seed data (PPL-2, D2): one team, the exact v1 role list, encouragement bank
-- ---------------------------------------------------------------------------
insert into teams (name, description, color)
values ('Breathe Worship', 'Breathe New Life Church worship team', '#000000');

insert into roles (team_id, name, sort_order)
select t.id, r.name, r.sort_order
from teams t,
(values
  ('Worship Leader', 1), ('Vocalist', 2), ('Backing Vocals', 3),
  ('Acoustic Guitar', 4), ('Electric Guitar', 5), ('Bass', 6),
  ('Keys/Piano', 7), ('Drums', 8), ('Sound Engineer', 9),
  ('ProPresenter/Slides', 10), ('Livestream/Camera', 11)
) as r(name, sort_order)
where t.name = 'Breathe Worship';

-- STAT-3/4 default copy — admin-editable; the church should rewrite in its own voice.
insert into encouragement_messages (trigger_type, threshold, message_template) values
  ('milestone_count', 10, 'That''s your 10th time serving with Breathe Worship — thank you for showing up again and again.'),
  ('milestone_count', 50, '50 services. Half a hundred Sundays of faithfulness. Thank you.'),
  ('milestone_count', 100, '100 services with Breathe Worship. What a legacy of quiet faithfulness.'),
  ('anniversary', 1, 'One year serving with Breathe Worship this month — thank you for a year of faithfulness.'),
  ('hit_preferred_frequency', null, 'You''ve served as often as you wanted to this period — enjoy being in the congregation this week.'),
  ('streak', 5, '5 services in a row without a hitch. Your consistency carries the team.');
