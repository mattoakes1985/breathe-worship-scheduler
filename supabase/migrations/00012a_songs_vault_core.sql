-- WO-1 songs vault, part 1 of 4: columns, checks, tag catalogue, versioning, history
-- Split from one migration because the Supabase connector cancels large
-- schema calls; each part is atomic and additive, and carries its own RLS.
-- Owner: Agent 1. Backwards compatible with the deployed frontend.

-- ---------------------------------------------------------------------------
-- 1. New song columns
-- ---------------------------------------------------------------------------
alter table songs
  add column updated_at timestamptz not null default now(),
  add column updated_by uuid references profiles(id),
  add column version int not null default 1,
  -- Half/double-time is a property of how the band counts the song, not a
  -- different tempo: keep tempo_bpm and annotate rather than overwrite.
  add column bpm_feel text,
  -- Keys the song was actually played in, from the 2021-26 setlist history
  -- (most frequent first). New services add to song_stats.played_keys.
  add column legacy_played_keys text[] not null default '{}',
  add column merged_into_id uuid references songs(id);

-- Clean anything that would violate the new constraints (none expected).
update songs set title = btrim(title) where title <> btrim(title);
update songs set time_signature = null
  where time_signature is not null and time_signature !~ '^[0-9]{1,2}/[0-9]{1,2}$';

alter table songs
  add constraint songs_title_not_blank check (length(btrim(title)) > 0 and length(title) <= 200),
  add constraint songs_bpm_range check (tempo_bpm is null or tempo_bpm between 20 and 300),
  add constraint songs_bpm_feel check (bpm_feel is null or bpm_feel in ('half-time', 'double-time')),
  add constraint songs_duration_range check (duration_seconds is null or duration_seconds between 1 and 3600),
  add constraint songs_time_sig_format check (time_signature is null or time_signature ~ '^[0-9]{1,2}/[0-9]{1,2}$'),
  add constraint songs_key_length check (coalesce(length(default_key), 0) <= 40 and coalesce(length(male_key), 0) <= 40),
  add constraint songs_artist_length check (coalesce(length(artist), 0) <= 200),
  add constraint songs_links_http check (
    (chord_chart_url is null or chord_chart_url ~* '^https?://') and
    (audio_url is null or audio_url ~* '^https?://')),
  add constraint songs_tags_no_nulls check (tags is null or array_position(tags, null) is null),
  add constraint songs_merge_not_self check (merged_into_id is null or merged_into_id <> id),
  add constraint songs_merged_is_archived check (merged_into_id is null or not is_active);

create index idx_songs_active_title on songs (lower(title)) where is_active;
create index idx_service_songs_song on service_songs (song_id);

-- ---------------------------------------------------------------------------
-- 2. Tag catalogue (genre/theme tags). songs.tags stays a text[] of names so
--    filtering is a simple array operation; the catalogue gives names a
--    canonical spelling, colour and order.
-- ---------------------------------------------------------------------------
create table song_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 40 and name !~ ','),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  description text check (description is null or length(description) <= 200),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index song_tags_name_ci on song_tags (lower(name));

insert into song_tags (name, color, sort_order) values
  ('Fast', '#E8590C', 10), ('Slow', '#1971C2', 20), ('Communion', '#862E9C', 30),
  ('Prayer', '#2F9E44', 40), ('Response', '#0C8599', 50), ('Kids-exit', '#F08C00', 60),
  ('Christmas', '#C92A2A', 70), ('Easter', '#D6336C', 80), ('Rarely used', '#868E96', 90);

-- Canonicalise existing tag spellings ('rarely used' -> 'Rarely used') before
-- history triggers exist, so the baseline snapshot is already clean.
update songs s set tags = (
  select array_agg(coalesce(t.name, btrim(x)) order by ord)
  from unnest(s.tags) with ordinality u(x, ord)
  left join song_tags t on lower(t.name) = lower(btrim(x))
) where s.tags is not null and cardinality(s.tags) > 0;
update songs set tags = null where tags = '{}';

-- ---------------------------------------------------------------------------
-- 3. Version + normalisation trigger (optimistic concurrency: clients update
--    with `.eq('version', v)`; zero rows back = someone else saved first).
-- ---------------------------------------------------------------------------
create or replace function songs_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.title := btrim(new.title);
  new.artist := nullif(btrim(new.artist), '');
  new.default_key := nullif(btrim(new.default_key), '');
  new.male_key := nullif(btrim(new.male_key), '');
  new.time_signature := nullif(btrim(new.time_signature), '');
  -- tags: trim, remove blanks, de-duplicate case-insensitively, catalogue spelling
  if new.tags is not null then
    new.tags := (
      select array_agg(name order by first_ord)
      from (
        select (array_agg(coalesce(t.name, btrim(x)) order by ord))[1] as name, min(ord) as first_ord
        from unnest(new.tags) with ordinality u(x, ord)
        left join song_tags t on lower(t.name) = lower(btrim(x))
        where btrim(coalesce(x, '')) <> ''
        group by lower(btrim(x))
      ) d
    );
  end if;

  if tg_op = 'UPDATE' then
    -- No content change -> no version bump, no history row.
    if (to_jsonb(new) - array['version','updated_at','updated_by'])
       = (to_jsonb(old) - array['version','updated_at','updated_by']) then
      new.version := old.version;
      new.updated_at := old.updated_at;
      new.updated_by := old.updated_by;
      return new;
    end if;
    new.version := old.version + 1;
  else
    new.version := 1;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger trg_songs_before_write before insert or update on songs
  for each row execute function songs_before_write();

-- Soft-delete only: hard DELETE is refused for signed-in users (archive or
-- merge instead). SQL editor / service role (auth.uid() is null) is trusted.
create or replace function songs_block_delete() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    raise exception 'Songs are never deleted — archive or merge instead';
  end if;
  return old;
end;
$$;
create trigger trg_songs_block_delete before delete on songs
  for each row execute function songs_block_delete();

-- ---------------------------------------------------------------------------
-- 4. Versioned history
-- ---------------------------------------------------------------------------
create table songs_history (
  id bigint generated always as identity primary key,
  song_id uuid not null references songs(id),
  version int not null,
  op text not null check (op in ('baseline', 'insert', 'update', 'restore', 'merge', 'review', 'import', 'tag')),
  snapshot jsonb not null,
  changed_fields text[] not null default '{}',
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now(),
  unique (song_id, version)
);
create index idx_songs_history_song on songs_history (song_id, version desc);

create or replace function songs_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_fields text[];
  v_op text := coalesce(nullif(current_setting('app.song_op', true), ''), lower(tg_op));
begin
  if tg_op = 'UPDATE' then
    if new.version = old.version then return new; end if;
    select coalesce(array_agg(k order by k), '{}') into v_fields
    from jsonb_each(to_jsonb(new) - array['version','updated_at','updated_by']) n(k, v)
    where n.v is distinct from (to_jsonb(old) -> n.k);
  else
    v_fields := '{}';
  end if;
  insert into songs_history (song_id, version, op, snapshot, changed_fields, changed_by)
  values (new.id, new.version, v_op, to_jsonb(new), v_fields, auth.uid());
  return new;
end;
$$;
create trigger trg_songs_after_write after insert or update on songs
  for each row execute function songs_after_write();

-- Baseline: every existing song gets version 1 in history.
insert into songs_history (song_id, version, op, snapshot)
select id, version, 'baseline', to_jsonb(s) from songs s;

-- ---------------------------------------------------------------------------
-- RLS for this part
-- ---------------------------------------------------------------------------
-- songs: the existing permissive "leads manage songs" (FOR ALL) stays; a
-- RESTRICTIVE policy denies DELETE for every API caller on top of it, so
-- soft-delete is enforced by RLS as well as by trg_songs_block_delete.
-- (Additive on purpose, so nothing the live app relies on is removed.)
create policy "songs are never hard-deleted" on songs as restrictive for delete
  using (false);

alter table songs_history enable row level security;
create policy "leads read song history" on songs_history for select
  using (is_any_team_lead(auth.uid()) or is_admin(auth.uid()));
-- (no write policies: only the security-definer trigger writes history)

alter table song_tags enable row level security;
create policy "members read song tags" on song_tags for select
  using (is_active_profile(auth.uid()));
create policy "leads manage song tags" on song_tags for insert
  with check (is_any_team_lead(auth.uid()) or is_admin(auth.uid()));
create policy "leads update song tags" on song_tags for update
  using (is_any_team_lead(auth.uid()) or is_admin(auth.uid()))
  with check (is_any_team_lead(auth.uid()) or is_admin(auth.uid()));
-- (delete only via delete_song_tag so songs are updated in the same step)


revoke execute on function songs_before_write() from anon, authenticated, public;
revoke execute on function songs_after_write() from anon, authenticated, public;
revoke execute on function songs_block_delete() from anon, authenticated, public;
