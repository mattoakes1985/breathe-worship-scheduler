-- 2026-10-11, Matt: "August and September had single services. Given our
-- team serves the same on both services, let's just keep a single event for
-- each week going forwards (except for special events)." and "Dave A will do
-- vox but he'll never not play acoustic."

-- 1. Archive every 09:15 template service (none upcoming, none with songs or
--    assignments) and stop the template generating more. Archive, not delete.
update services set linked_service_id = null
where linked_service_id in (select s.id from services s join service_templates t on t.id = s.template_id where t.name = 'Sunday 09:15 Service');
update services s set archived_at = now(), linked_service_id = null,
  notes = trim(coalesce(s.notes, '') || ' [archived 2026-10-11: single Sunday service]')
from service_templates t
where t.id = s.template_id and t.name = 'Sunday 09:15 Service' and s.archived_at is null;
update service_templates set is_active = false where name = 'Sunday 09:15 Service';

-- 2. "Always plays": an instrument this person plays whenever they serve, in
--    any role (Dave: acoustic, whether leading or on vox). Stronger than
--    leads_on_role_id, which applies only when leading.
alter table team_people add column always_role_id uuid references roles(id);
update team_people set always_role_id = (select id from roles where name = 'Acoustic Guitar')
where display_name = 'Dave Asplin';
