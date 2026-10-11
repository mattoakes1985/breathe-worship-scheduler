-- 2026-10-11: one per-person "pairings" list replaces always_role_id,
-- leads_on_role_id and combinable_role_ids (all three added today), because
-- Matt keeps meeting new combinations:
--   Dave:  lead and vox only with acoustic ("he'll never not play acoustic")
--   Peter: vox only with acoustic
--   Tim Davies, Ethan Barrett: on BV they also play keys, unless there's
--             already another keys player (then just BV); never keys + lead
-- role_links: [{ "role": uuid, "with": uuid, "mode": "requires" | "also" | "can" }]
--   requires ("only with"):    whenever they're on `role` they're on `with`
--                              too, and they aren't put on `role` if `with`
--                              is taken by someone else
--   also ("usually with"):     on `role` they also take `with` if it's still
--                              free; if it's taken they just do `role`
--   can ("can also do"):       they may hold both at once; the planner only
--                              doubles them up when no one else is free
alter table team_people add column role_links jsonb not null default '[]'
  check (jsonb_typeof(role_links) = 'array' and jsonb_array_length(role_links) <= 20);
-- (an earlier draft today used combinable_role_ids for Tim and Ethan; replaced below)

-- carry over today's settings
update team_people p set role_links = coalesce((
  select jsonb_agg(jsonb_build_object('role', x.role_id, 'with', p.always_role_id, 'mode', 'requires'))
  from person_roles x where x.person_id = p.id and x.role_id <> p.always_role_id), '[]')
where p.always_role_id is not null;

update team_people p set role_links = p.role_links || jsonb_build_array(jsonb_build_object(
  'role', (select id from roles where name = 'Worship Leader'), 'with', p.leads_on_role_id, 'mode', 'requires'))
where p.leads_on_role_id is not null and p.always_role_id is null;

-- Tim Davies, Ethan Barrett: BV usually with keys
update team_people set role_links = role_links || jsonb_build_array(jsonb_build_object(
  'role', (select id from roles where name = 'Backing Vocals'), 'with', (select id from roles where name = 'Keys/Piano'), 'mode', 'also'))
where display_name in ('Tim Davies', 'Ethan Barrett');

-- Peter: vox only while on acoustic
update team_people set role_links = role_links || jsonb_build_array(jsonb_build_object(
  'role', (select id from roles where name = 'Vocalist'), 'with', (select id from roles where name = 'Acoustic Guitar'), 'mode', 'requires'))
where display_name = 'Peter';

-- The old columns are emptied in 00024b, after the app that reads role_links
-- is live (so Dave's rule never lapses in the deployed app).
