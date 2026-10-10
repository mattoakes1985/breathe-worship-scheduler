-- WO-3 seed (2026-10-10): build the team list from the names already in the
-- imported rota history, plus the default planner rules. Idempotent.
-- No new personal data enters the database: every name here already exists
-- in legacy_assignments.

-- 1. One person per distinct history name (case/space-insensitive)
insert into team_people (team_id, display_name)
select (select id from teams order by created_at limit 1), min(trim(person_name))
from legacy_assignments
where trim(person_name) <> ''
group by lower(regexp_replace(trim(person_name), '\s+', ' ', 'g'))
on conflict do nothing;

-- 2. The history spelling becomes a remembered alias
insert into name_aliases (person_id, alias, source)
select p.id, p.display_name, 'legacy' from team_people p
on conflict do nothing;

-- 3. Instruments from history, ranked by how often they played each
insert into person_roles (person_id, role_id, rank)
select person_id, role_id, least(rank, 10)::int from (
  select a.person_id, l.role_id,
         row_number() over (partition by a.person_id order by count(*) desc) as rank
  from legacy_assignments l
  join name_aliases a on a.alias_key = lower(regexp_replace(trim(l.person_name), '\s+', ' ', 'g'))
  where l.role_id is not null
  group by a.person_id, l.role_id
) x
on conflict do nothing;

-- 4. Link people whose history was already claimed by an app account
update team_people p set profile_id = c.profile_id
from (
  select a.person_id, min(l.claimed_profile_id::text)::uuid as profile_id
  from legacy_assignments l
  join name_aliases a on a.alias_key = lower(regexp_replace(trim(l.person_name), '\s+', ' ', 'g'))
  where l.claimed_profile_id is not null
  group by a.person_id
  having count(distinct l.claimed_profile_id) = 1
) c
where p.id = c.person_id and p.profile_id is null
  and not exists (select 1 from team_people q where q.profile_id = c.profile_id);

-- 5. Default rules (editable in the app). Lower priority number = applied first.
with t as (select id from teams order by created_at limit 1),
r as (select name, id from roles where is_active)
insert into scheduling_rules (team_id, kind, label, params, priority)
select (select id from t), kind, label, params, priority from (values
  ('planned_roles', 'Roles the planner fills',
     jsonb_build_object('role_ids', (select jsonb_agg(id) from r where name in
       ('Worship Leader', 'Vocalist', 'Acoustic Guitar', 'Electric Guitar', 'Keys/Piano', 'Bass', 'Drums', 'Sound Engineer'))), 0),
  ('all_in', 'On an All-in Sunday, schedule everyone who is available', '{}'::jsonb, 5),
  ('core_roles', 'Always fill Lead, Drums, Sound and one of Acoustic / Electric / Keys first',
     jsonb_build_object('groups', jsonb_build_array(
       jsonb_build_object('label', 'Lead', 'role_ids', (select jsonb_agg(id) from r where name = 'Worship Leader')),
       jsonb_build_object('label', 'Drums', 'role_ids', (select jsonb_agg(id) from r where name = 'Drums')),
       jsonb_build_object('label', 'Sound', 'role_ids', (select jsonb_agg(id) from r where name = 'Sound Engineer')),
       jsonb_build_object('label', 'Acoustic, Electric or Keys', 'role_ids',
         (select jsonb_agg(id) from r where name in ('Acoustic Guitar', 'Electric Guitar', 'Keys/Piano')))
     )), 10),
  ('monthly_cap', 'Respect each person''s monthly maximum', jsonb_build_object('default_max', null), 20),
  ('rest_gap', 'Avoid the same person two Sundays in a row', jsonb_build_object('weeks', 1), 30),
  ('households', 'Keep households together', '{}'::jsonb, 40),
  ('fairness', 'Share the load: whoever served longest ago goes first', '{}'::jsonb, 50)
) v(kind, label, params, priority)
on conflict (team_id, kind) do nothing;
