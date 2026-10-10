-- WO-3: when did each person last serve? Feeds the team list's "Possibly
-- left" prompt and the archive decision. Combines the imported rota history
-- (matched through remembered names) with the planner's own slots.
-- security_invoker: callers only see rows their RLS allows (planners only).
create view team_people_activity with (security_invoker = on) as
with serves as (
  select a.person_id, s.service_date
  from legacy_assignments l
  join name_aliases a on a.alias_key = lower(regexp_replace(trim(l.person_name), '\s+', ' ', 'g'))
  join services s on s.id = l.service_id
  union all
  select r.person_id, s.service_date
  from rota_plan_slots r
  join services s on s.id = r.service_id and s.archived_at is null
  where r.person_id is not null and s.service_date <= current_date
)
select p.id as person_id,
       max(sv.service_date) as last_served,
       count(distinct sv.service_date) filter (where sv.service_date > current_date - 365) as serves_last_year,
       count(distinct sv.service_date) as serves_total
from team_people p
left join serves sv on sv.person_id = p.id
group by p.id;

revoke all on team_people_activity from anon;
grant select on team_people_activity to authenticated;
