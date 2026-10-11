-- 2026-10-11, Matt: "Tim Davies can do keys and BV at the same time (but not
-- keys and lead) — same with Ethan."
-- combinable_role_ids: roles this person can hold at the same time on one
-- service (any two in the set). The planner only doubles someone up when no
-- one else is available, and says so on the slot.
alter table team_people add column combinable_role_ids uuid[] not null default '{}';

-- Ethan isn't listed for Backing Vocals yet; Matt says he does keys + BV.
insert into person_roles (person_id, role_id, rank)
select p.id, r.id, 5 from team_people p, roles r
where p.display_name = 'Ethan Barrett' and r.name = 'Backing Vocals'
on conflict (person_id, role_id) do nothing;

update team_people set combinable_role_ids = array[
  (select id from roles where name = 'Keys/Piano'),
  (select id from roles where name = 'Backing Vocals')]
where display_name in ('Tim Davies', 'Ethan Barrett');
