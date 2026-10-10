-- WO-3 prerequisite (2026-10-10, approved by Matt): fix service dates.
-- 1. The Templates screen built dates with toISOString(), which converts local
--    midnight to UTC and lands on the previous day during British Summer Time.
--    Upcoming template services dated on a Saturday are moved to the Sunday.
--    Past services are left as they are (history only; out of scope).
-- 2. The 11:15 template was generated twice for 2026-09-05 onwards (any date). One copy
--    of each pair is ARCHIVED (archived_at), never deleted; anything that
--    linked to the archived copy is repointed to the kept one.
-- 3. The generator now skips dates that already have a live service from the
--    same template, and a unique index stops duplicates at the source.
-- Owner: Agent 1. Additive / reversible (archive, not delete).

-- (2) archive duplicates first, so the date move can't create new clashes
create temp table _svc_dups on commit drop as
with scored as (
  select s.id, s.template_id, s.service_date, s.start_time, s.created_at,
         ((select count(*) from assignments a where a.service_id = s.id)
              + (select count(*) from service_songs x where x.service_id = s.id)
              + (select count(*) from service_order_items o where o.service_id = s.id)
              + (select count(*) from availability_responses r where r.service_id = s.id)
              + (select count(*) from services l where l.linked_service_id = s.id)) as weight
  from services s
  where s.archived_at is null and s.template_id is not null
), ranked as (
  select id,
         row_number() over w as rn,
         first_value(id) over w as keep_id
  from scored
  window w as (partition by template_id, service_date, start_time
               order by weight desc, created_at, id)
)
select id, keep_id from ranked where rn > 1;

update services s set linked_service_id = d.keep_id
from _svc_dups d where s.linked_service_id = d.id
  and s.id not in (select id from _svc_dups);

update services s set archived_at = now(), linked_service_id = null,
  notes = trim(coalesce(s.notes, '') || ' [archived 2026-10-10: duplicate of ' || d.keep_id || ']')
from _svc_dups d where s.id = d.id;

-- a kept service must not link to itself after repointing
update services set linked_service_id = null where linked_service_id = id;

-- (1) move upcoming Saturday-dated template services to the Sunday
update services set service_date = service_date + 1, updated_at = now()
where archived_at is null and template_id is not null
  and service_date >= date '2026-10-10'
  and extract(dow from service_date) = 6;

-- (3) prevent recurrence
create unique index if not exists uq_services_template_date_time
  on services (template_id, service_date, start_time)
  where archived_at is null and template_id is not null;

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
    -- idempotent: re-running a range never creates a second copy
    if exists (select 1 from services where template_id = v_template.id and service_date = v_date
               and start_time = coalesce(v_template.default_start_time, time '10:30')
               and archived_at is null) then
      continue;
    end if;
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
revoke execute on function generate_services_from_template(uuid, date[]) from anon, public;
grant execute on function generate_services_from_template(uuid, date[]) to authenticated;
