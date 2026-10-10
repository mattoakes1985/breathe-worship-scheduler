-- WO-1 songs vault, part 2 of 4: Needs-checking review queue and restore
-- Split from one migration because the Supabase connector cancels large
-- schema calls; each part is atomic and additive, and carries its own RLS.
-- Owner: Agent 1. Backwards compatible with the deployed frontend.

-- ---------------------------------------------------------------------------
-- 5. Review queue ("Needs checking") — data the app is not sure about is
--    queued for a human, never silently applied.
-- ---------------------------------------------------------------------------
create table song_review_items (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references songs(id),
  kind text not null check (kind in (
    'bpm_conflict', 'bpm_half_double', 'time_signature',
    'artist_suggestion', 'added_from_history', 'bpm_filled_from_history')),
  field text check (field in ('tempo_bpm', 'bpm_feel', 'time_signature', 'artist', 'is_active')),
  current_value text,
  suggested_value text,
  evidence text,
  source text not null default 'setlist history 2021-26',
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected', 'info')),
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create unique index song_review_one_open on song_review_items (song_id, kind) where status = 'open';
create index idx_song_review_status on song_review_items (status);

-- Accept (optionally with a corrected value) or reject one item. Accepting
-- writes the value through the normal song update path, so history records it.
create or replace function resolve_song_review(p_item_id uuid, p_accept boolean, p_value text default null, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_item song_review_items%rowtype;
  v_value text;
begin
  if not (is_any_team_lead(auth.uid()) or is_admin(auth.uid())) then
    raise exception 'Team leads and admins only';
  end if;
  select * into v_item from song_review_items where id = p_item_id for update;
  if not found then raise exception 'Review item not found'; end if;
  if v_item.status <> 'open' then raise exception 'This item has already been resolved'; end if;

  if p_accept and v_item.field is not null then
    v_value := nullif(btrim(coalesce(p_value, v_item.suggested_value)), '');
    perform set_config('app.song_op', 'review', true);
    case v_item.field
      when 'tempo_bpm' then update songs set tempo_bpm = v_value::int where id = v_item.song_id;
      when 'bpm_feel' then update songs set bpm_feel = v_value where id = v_item.song_id;
      when 'time_signature' then update songs set time_signature = v_value where id = v_item.song_id;
      when 'artist' then update songs set artist = v_value where id = v_item.song_id;
      when 'is_active' then update songs set is_active = v_value::boolean where id = v_item.song_id;
    end case;
    perform set_config('app.song_op', '', true);
  end if;

  update song_review_items set
    status = case when p_accept then 'accepted' else 'rejected' end,
    resolved_by = auth.uid(), resolved_at = now(),
    resolution_note = coalesce(p_note, case when p_accept and p_value is not null
                                         and p_value is distinct from v_item.suggested_value
                                       then 'Accepted with corrected value ' || p_value end)
  where id = p_item_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Restore any earlier version (creates a new version; nothing is lost)
-- ---------------------------------------------------------------------------
create or replace function restore_song_version(p_song_id uuid, p_version int) returns int
language plpgsql security definer set search_path = public as $$
declare
  v songs;
  v_new int;
begin
  if not (is_any_team_lead(auth.uid()) or is_admin(auth.uid())) then
    raise exception 'Team leads and admins only';
  end if;
  select (jsonb_populate_record(null::songs, snapshot)).* into v
  from songs_history where song_id = p_song_id and version = p_version;
  if not found then raise exception 'That version does not exist'; end if;

  perform set_config('app.song_op', 'restore', true);
  update songs set
    title = v.title, artist = v.artist, ccli_number = v.ccli_number,
    default_key = v.default_key, male_key = v.male_key,
    tempo_bpm = v.tempo_bpm, bpm_feel = v.bpm_feel, time_signature = v.time_signature,
    duration_seconds = v.duration_seconds, tags = v.tags,
    chord_chart_url = v.chord_chart_url, audio_url = v.audio_url, notes = v.notes,
    is_active = case when merged_into_id is not null then false else v.is_active end
  where id = p_song_id
  returning version into v_new;
  perform set_config('app.song_op', '', true);
  return v_new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS for this part
-- ---------------------------------------------------------------------------
alter table song_review_items enable row level security;
create policy "leads read song review" on song_review_items for select
  using (is_any_team_lead(auth.uid()) or is_admin(auth.uid()));
create policy "leads add song review" on song_review_items for insert
  with check (is_any_team_lead(auth.uid()) or is_admin(auth.uid()));
-- (resolution only via resolve_song_review)


revoke execute on function resolve_song_review(uuid, boolean, text, text) from anon, public;
revoke execute on function restore_song_version(uuid, int) from anon, public;
grant execute on function resolve_song_review(uuid, boolean, text, text), restore_song_version(uuid, int) to authenticated;
