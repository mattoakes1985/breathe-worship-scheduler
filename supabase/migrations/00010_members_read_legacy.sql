-- Past rotas visible to the whole team, including not-yet-signed-up names
-- (Matt, 2026-07-08). Same visibility rule as published rotas (SCHED-6):
-- these names were on the shared spreadsheet the whole team already used.
create policy "members read legacy" on legacy_assignments for select
  using (is_active_profile(auth.uid()));
