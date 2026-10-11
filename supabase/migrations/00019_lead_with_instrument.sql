-- WO-3 rule from Matt (2026-10-11): "If someone leads and plays acoustic, they
-- do both at the same time — if someone leads and plays a different
-- instrument, they don't." Stored per person so it can be switched off for
-- anyone who sometimes leads without a guitar.
-- leads_on_role_id = the instrument this person also plays whenever they lead.
-- Default: Acoustic Guitar for everyone listed for both Lead and Acoustic.
alter table team_people add column leads_on_role_id uuid references roles(id);

update team_people p set leads_on_role_id = ac.id
from roles ac
where ac.name = 'Acoustic Guitar'
  and exists (select 1 from person_roles x join roles r on r.id = x.role_id where x.person_id = p.id and r.name = 'Worship Leader')
  and exists (select 1 from person_roles x where x.person_id = p.id and x.role_id = ac.id);
