-- WO-1 songs vault, part 3b: merge duplicate songs. Nothing is removed: every
-- setlist/order reference is repointed to the kept song, the duplicate is
-- archived with merged_into_id, and services that now list the song twice are
-- reported back for a human to tidy.
create or replace function merge_songs(p_keep uuid, p_merge uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k songs;
  m songs;
  v_twice uuid[];
  v_moved int;
  v_items int;
begin
  if not (is_any_team_lead(auth.uid()) or is_admin(auth.uid())) then
    raise exception 'Team leads and admins only';
  end if;
  if p_keep = p_merge then raise exception 'Pick two different songs'; end if;
  perform 1 from songs where id in (p_keep, p_merge) order by id for update;
  select * into k from songs where id = p_keep;
  select * into m from songs where id = p_merge;
  if k.id is null or m.id is null then raise exception 'Song not found'; end if;
  if k.merged_into_id is not null then raise exception 'The song to keep was itself merged away'; end if;
  if m.merged_into_id is not null then raise exception 'That song has already been merged'; end if;

  select coalesce(array_agg(distinct a.service_id), '{}') into v_twice
  from service_songs a join service_songs b on b.service_id = a.service_id
  where a.song_id = p_keep and b.song_id = p_merge;

  update service_songs set song_id = p_keep where song_id = p_merge;
  get diagnostics v_moved = row_count;
  update service_order_items set linked_song_id = p_keep where linked_song_id = p_merge;
  get diagnostics v_items = row_count;
  update song_review_items set song_id = p_keep
    where song_id = p_merge and status = 'open'
      and not exists (select 1 from song_review_items o
                      where o.song_id = p_keep and o.kind = song_review_items.kind and o.status = 'open');
  update song_review_items set status = 'info', resolution_note = 'Song merged into ' || k.title
    where song_id = p_merge and status = 'open';

  perform set_config('app.song_op', 'merge', true);
  update songs set
    artist = coalesce(k.artist, m.artist),
    ccli_number = coalesce(k.ccli_number, m.ccli_number),
    default_key = coalesce(k.default_key, m.default_key),
    male_key = coalesce(k.male_key, m.male_key),
    tempo_bpm = coalesce(k.tempo_bpm, m.tempo_bpm),
    bpm_feel = coalesce(k.bpm_feel, m.bpm_feel),
    time_signature = coalesce(k.time_signature, m.time_signature),
    duration_seconds = coalesce(k.duration_seconds, m.duration_seconds),
    chord_chart_url = coalesce(k.chord_chart_url, m.chord_chart_url),
    audio_url = coalesce(k.audio_url, m.audio_url),
    notes = case when k.notes is not null and m.notes is not null and k.notes <> m.notes
                 then k.notes || E'\n' || m.notes else coalesce(k.notes, m.notes) end,
    tags = (select nullif(array_agg(distinct t), '{}')
            from unnest(coalesce(k.tags, '{}') || coalesce(m.tags, '{}')) t),
    legacy_played_keys = (select coalesce(array_agg(distinct t), '{}')
            from unnest(k.legacy_played_keys || m.legacy_played_keys) t),
    is_active = true
  where id = p_keep;
  update songs set is_active = false, merged_into_id = p_keep where id = p_merge;
  perform set_config('app.song_op', '', true);

  return jsonb_build_object('setlist_rows_moved', v_moved, 'order_items_moved', v_items,
                            'services_listing_song_twice', to_jsonb(v_twice));
end;
$$;
revoke execute on function merge_songs(uuid, uuid) from anon, public;
grant execute on function merge_songs(uuid, uuid) to authenticated;
