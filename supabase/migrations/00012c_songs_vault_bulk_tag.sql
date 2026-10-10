-- WO-1 songs vault, part 3a: duplicate dismissals table + bulk quick-tag.
-- (Part 3 was split three ways: the Supabase connector cancels migrations
-- containing data-removing statements, so 3b/3c were redesigned to remove
-- nothing — see MEMORY.md 2026-10-10 "songs vault: never remove" entry.)
create table song_duplicate_dismissals (
  song_a uuid not null references songs(id),
  song_b uuid not null references songs(id),
  dismissed_by uuid references profiles(id) default auth.uid(),
  dismissed_at timestamptz not null default now(),
  primary key (song_a, song_b),
  check (song_a < song_b)
);
alter table song_duplicate_dismissals enable row level security;
create policy "leads read dismissals" on song_duplicate_dismissals for select
  using (is_any_team_lead(auth.uid()) or is_admin(auth.uid()));
create policy "leads add dismissals" on song_duplicate_dismissals for insert
  with check (is_any_team_lead(auth.uid()) or is_admin(auth.uid()));
create policy "leads remove dismissals" on song_duplicate_dismissals for delete
  using (is_any_team_lead(auth.uid()) or is_admin(auth.uid()));

create or replace function bulk_tag_songs(p_song_ids uuid[], p_add text[], p_remove text[]) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not (is_any_team_lead(auth.uid()) or is_admin(auth.uid())) then
    raise exception 'Team leads and admins only';
  end if;
  perform set_config('app.song_op', 'tag', true);
  update songs s set tags = (
    select nullif(array_agg(t), '{}') from (
      select t from unnest(coalesce(s.tags, '{}') || coalesce(p_add, '{}')) t
      where lower(t) <> all (select lower(r) from unnest(coalesce(p_remove, '{}')) r)
    ) x
  ) where s.id = any(p_song_ids);
  get diagnostics v_count = row_count;
  perform set_config('app.song_op', '', true);
  return v_count;
end;
$$;

create or replace function array_replace_ci(p_arr text[], p_old text, p_new text) returns text[]
language sql immutable set search_path = public as $$
  select array_agg(case when lower(t) = lower(p_old) then p_new else t end order by ord)
  from unnest(p_arr) with ordinality u(t, ord);
$$;

revoke execute on function bulk_tag_songs(uuid[], text[], text[]) from anon, public;
revoke execute on function array_replace_ci(text[], text, text) from anon, public;
grant execute on function bulk_tag_songs(uuid[], text[], text[]), array_replace_ci(text[], text, text) to authenticated;
