-- WO-4 month grid (2026-10-11): the fields the master sheet has that the app
-- didn't, plus where running-order lines sit between songs, plus the row
-- layout of the grid. Additive only.

-- Sheet rows: Theme, Other Items, Preach, Events (free text per service).
alter table services
  add column theme text check (theme is null or length(theme) <= 200),
  add column other_items text check (other_items is null or length(other_items) <= 500),
  add column preacher text check (preacher is null or length(preacher) <= 120),
  add column events_note text check (events_note is null or length(events_note) <= 500);

-- Running-order lines (Welcome, Communion, Kids Exit, Offering, Preach,
-- Response, Close…) are service_order_items. after_song places a line in the
-- song list: 0 = before song 1, 1 = after song 1, … ; null = at the end.
-- Songs themselves stay in service_songs (unchanged; history and stats use it).
alter table service_order_items
  add column after_song integer check (after_song is null or after_song between 0 and 30);

-- Grid row layout per team, e.g. two Lead rows and two Vox rows.
-- grid_rows: [{ "label": "Lead", "role_id": uuid, "slot": 0 }, ...]
create table team_settings (
  team_id uuid primary key references teams(id),
  grid_rows jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
alter table team_settings enable row level security;
create policy "planners read team_settings" on team_settings for select using (is_planner(auth.uid()));
create policy "planners add team_settings" on team_settings for insert with check (is_planner(auth.uid()));
create policy "planners change team_settings" on team_settings for update using (is_planner(auth.uid())) with check (is_planner(auth.uid()));
revoke all on team_settings from anon;
grant select, insert, update on team_settings to authenticated;
create trigger trg_team_settings_touch before update on team_settings for each row execute function touch_updated();

-- Default layout = the master sheet's rows.
insert into team_settings (team_id, grid_rows)
select t.id, jsonb_build_array(
  jsonb_build_object('label', 'Lead', 'role_id', (select id from roles where name = 'Worship Leader'), 'slot', 0),
  jsonb_build_object('label', 'Lead', 'role_id', (select id from roles where name = 'Worship Leader'), 'slot', 1),
  jsonb_build_object('label', 'Vox', 'role_id', (select id from roles where name = 'Vocalist'), 'slot', 0),
  jsonb_build_object('label', 'Vox', 'role_id', (select id from roles where name = 'Vocalist'), 'slot', 1),
  jsonb_build_object('label', 'Acoustic', 'role_id', (select id from roles where name = 'Acoustic Guitar'), 'slot', 0),
  jsonb_build_object('label', 'Electric', 'role_id', (select id from roles where name = 'Electric Guitar'), 'slot', 0),
  jsonb_build_object('label', 'Keys', 'role_id', (select id from roles where name = 'Keys/Piano'), 'slot', 0),
  jsonb_build_object('label', 'Bass', 'role_id', (select id from roles where name = 'Bass'), 'slot', 0),
  jsonb_build_object('label', 'Drums', 'role_id', (select id from roles where name = 'Drums'), 'slot', 0),
  jsonb_build_object('label', 'PA', 'role_id', (select id from roles where name = 'Sound Engineer'), 'slot', 0)
)
from (select id from teams order by created_at limit 1) t
on conflict (team_id) do nothing;
