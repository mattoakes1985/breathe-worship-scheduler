-- WO-1 songs vault, part 4 of 4: saved views and usage stats (applied as 00012f)
-- Split from one migration because the Supabase connector cancels large
-- schema calls; each part is atomic and additive, and carries its own RLS.
-- Owner: Agent 1. Backwards compatible with the deployed frontend.

-- ---------------------------------------------------------------------------
-- 9. Saved views (find/sort/filter presets). Private by default; a lead can
--    share a view with the other leads.
-- ---------------------------------------------------------------------------
create table song_saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references profiles(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  filters jsonb not null default '{}'::jsonb,
  is_shared boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index idx_song_views_owner on song_saved_views (owner_id);

-- ---------------------------------------------------------------------------
-- 10. Usage stats per song (times sung, last sung, next planned, keys used).
--     security_invoker: callers only aggregate setlists RLS lets them see.
-- ---------------------------------------------------------------------------
create view song_stats with (security_invoker = on) as
select
  s.id as song_id,
  count(ss.id) filter (where sv.service_date <= current_date and sv.status <> 'cancelled')::int as times_sung,
  max(sv.service_date) filter (where sv.service_date <= current_date and sv.status <> 'cancelled') as last_sung,
  min(sv.service_date) filter (where sv.service_date > current_date and sv.status <> 'cancelled') as next_planned,
  coalesce(array_agg(distinct ss.key_override) filter (where ss.key_override is not null), '{}') as played_keys
from songs s
left join service_songs ss on ss.song_id = s.id
left join services sv on sv.id = ss.service_id
group by s.id;

-- ---------------------------------------------------------------------------
-- RLS for this part
-- ---------------------------------------------------------------------------
alter table song_saved_views enable row level security;
create policy "read own or shared views" on song_saved_views for select
  using (owner_id = auth.uid()
         or (is_shared and (is_any_team_lead(auth.uid()) or is_admin(auth.uid()))));
create policy "create own views" on song_saved_views for insert
  with check (owner_id = auth.uid() and (is_any_team_lead(auth.uid()) or is_admin(auth.uid())));
create policy "edit own views" on song_saved_views for update
  using (owner_id = auth.uid() or is_admin(auth.uid()))
  with check (owner_id = auth.uid() or is_admin(auth.uid()));
create policy "remove own views" on song_saved_views for delete
  using (owner_id = auth.uid() or is_admin(auth.uid()));


revoke all on song_stats from anon;
grant select on song_stats to authenticated;
