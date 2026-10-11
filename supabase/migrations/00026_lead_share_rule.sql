-- 2026-10-11, Matt: "We'd ideally have the leads share out the month - so
-- everyone usually gets a week to lead - availability dependent."
-- New soft rule kind lead_share (priority 25: after the monthly limit, before
-- the rest week; reorderable in the Rules screen).
alter table scheduling_rules drop constraint scheduling_rules_kind_check;
alter table scheduling_rules add constraint scheduling_rules_kind_check
  check (kind in ('core_roles', 'rest_gap', 'monthly_cap', 'households', 'fairness', 'all_in', 'planned_roles', 'lead_share'));
insert into scheduling_rules (team_id, kind, label, params, priority)
select id, 'lead_share', 'Share leading across the month: each leader usually leads once', '{}'::jsonb, 25
from teams order by created_at limit 1
on conflict (team_id, kind) do nothing;
