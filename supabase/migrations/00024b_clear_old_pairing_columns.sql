-- Apply AFTER the app version that reads team_people.role_links is live.
-- role_links (00024) is now the only source for pairings; empty the three
-- columns it replaced. Columns stay for now; drop them in a later cleanup.
update team_people set always_role_id = null, leads_on_role_id = null, combinable_role_ids = '{}'
where always_role_id is not null or leads_on_role_id is not null or cardinality(combinable_role_ids) > 0;
