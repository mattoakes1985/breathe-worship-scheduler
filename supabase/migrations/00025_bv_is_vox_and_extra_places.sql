-- 2026-10-11, Matt:
--  * "we use BV/Vox together" -> Backing Vocals is the same as Vocalist.
--    Merge it: instruments, pairings and planned roles move to Vocalist and
--    the Backing Vocals role is switched off (not deleted; history untouched).
--  * "All in is just a service where kids church isn't on ... your all in rule
--    should really apply to every service, but taking into account the other
--    rules wherever possible." -> services.is_all_in is now only a label; the
--    old all_in planner rule becomes "use everyone available": extra places
--    (2nd Lead / co-lead, 2nd Vox… from the grid rows) are filled each week
--    with anyone else who said yes, without breaking any rule.

-- instruments: anyone on BV gets Vocalist (keeping their better rank)
insert into person_roles (person_id, role_id, rank)
select x.person_id, (select id from roles where name = 'Vocalist'), x.rank
from person_roles x where x.role_id = (select id from roles where name = 'Backing Vocals')
on conflict (person_id, role_id) do update set rank = least(person_roles.rank, excluded.rank);

-- pairings: BV -> Vocalist
update team_people p set role_links = (
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'role', case when l->>'role' = bv.id::text then vox.id::text else l->>'role' end,
      'with', case when l->>'with' = bv.id::text then vox.id::text else l->>'with' end,
      'mode', l->>'mode')), '[]')
  from jsonb_array_elements(p.role_links) l)
from (select id from roles where name = 'Backing Vocals') bv, (select id from roles where name = 'Vocalist') vox
where p.role_links::text like '%' || bv.id::text || '%';

-- planned roles: drop BV
update scheduling_rules set params = jsonb_build_object('role_ids',
  coalesce((select jsonb_agg(r) from jsonb_array_elements(params->'role_ids') r
            where r #>> '{}' <> (select id::text from roles where name = 'Backing Vocals')), '[]'))
where kind = 'planned_roles';

update roles set is_active = false where name = 'Backing Vocals';

-- the all_in rule now means "use everyone available in the extra places"
update scheduling_rules
set label = 'Use everyone available: fill extra places (co-lead, 2nd Vox…) with anyone else who said yes, without breaking a rule',
    enabled = true
where kind = 'all_in';
