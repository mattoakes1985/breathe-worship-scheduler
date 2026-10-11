-- 2026-10-11: song planning for the Sunday's leader (Matt: "leads will list
-- out the songs they are considering, search for things (like songs that work
-- in the key)").
--  * service_song_shortlist: the songs a leader is considering for one
--    service, with an optional note. Not part of the set until promoted.
--    Readable/editable by that service's leader (is_service_leader, 00027)
--    and by planners (team leads, admins). Nobody else sees it.
--  * Shared saved song views (e.g. "Slow songs in G") become readable by any
--    active member, so leaders who aren't team leads can use them. They are
--    filter definitions only — no personal data.
-- Owner: Agent 1. Additive only.

create table service_song_shortlist (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  song_id uuid not null references songs(id),
  note text check (note is null or length(note) <= 200),
  added_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (service_id, song_id)
);
create index idx_service_song_shortlist_service on service_song_shortlist (service_id);

alter table service_song_shortlist enable row level security;
revoke all on service_song_shortlist from anon;
grant select, insert, update, delete on service_song_shortlist to authenticated;

create policy "leader or planner reads shortlist" on service_song_shortlist for select
  using (is_planner(auth.uid()) or is_service_leader(auth.uid(), service_id));
create policy "leader or planner adds to shortlist" on service_song_shortlist for insert
  with check (is_planner(auth.uid()) or is_service_leader(auth.uid(), service_id));
create policy "leader or planner edits shortlist" on service_song_shortlist for update
  using (is_planner(auth.uid()) or is_service_leader(auth.uid(), service_id))
  with check (is_planner(auth.uid()) or is_service_leader(auth.uid(), service_id));
create policy "leader or planner removes from shortlist" on service_song_shortlist for delete
  using (is_planner(auth.uid()) or is_service_leader(auth.uid(), service_id));

alter policy "read own or shared views" on song_saved_views
  using (owner_id = auth.uid() or (is_shared and is_active_profile(auth.uid())));
