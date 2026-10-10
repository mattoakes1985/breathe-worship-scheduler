-- WO-1 songs vault, part 3c: tag rename / remove / create. Catalogue entries
-- are archived rather than removed; songs lose the tag via a normal update so
-- history records it.
alter table song_tags add column archived_at timestamptz;

create or replace function create_song_tag(p_name text, p_color text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (is_any_team_lead(auth.uid()) or is_admin(auth.uid())) then
    raise exception 'Team leads and admins only';
  end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Tag name is empty'; end if;
  select id into v_id from song_tags where lower(name) = lower(btrim(p_name));
  if v_id is not null then
    update song_tags set archived_at = null, color = coalesce(p_color, color) where id = v_id;
  else
    insert into song_tags (name, color, sort_order)
      values (btrim(p_name), p_color, coalesce((select max(sort_order) from song_tags), 0) + 10)
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function rename_song_tag(p_old text, p_new text) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not (is_any_team_lead(auth.uid()) or is_admin(auth.uid())) then
    raise exception 'Team leads and admins only';
  end if;
  if nullif(btrim(p_new), '') is null then raise exception 'New tag name is empty'; end if;
  if exists (select 1 from song_tags where lower(name) = lower(btrim(p_new)) and lower(name) <> lower(p_old)) then
    -- renaming onto an existing tag merges them: archive the old entry
    update song_tags set archived_at = now() where lower(name) = lower(p_old);
    update song_tags set archived_at = null where lower(name) = lower(btrim(p_new));
  else
    update song_tags set name = btrim(p_new) where lower(name) = lower(p_old);
  end if;
  perform set_config('app.song_op', 'tag', true);
  update songs set tags = array_replace_ci(tags, p_old, btrim(p_new))
    where exists (select 1 from unnest(tags) t where lower(t) = lower(p_old));
  get diagnostics v_count = row_count;
  perform set_config('app.song_op', '', true);
  return v_count;
end;
$$;

create or replace function archive_song_tag(p_name text) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not (is_any_team_lead(auth.uid()) or is_admin(auth.uid())) then
    raise exception 'Team leads and admins only';
  end if;
  update song_tags set archived_at = now() where lower(name) = lower(p_name);
  perform set_config('app.song_op', 'tag', true);
  update songs set tags = nullif(array(select t from unnest(tags) t where lower(t) <> lower(p_name)), '{}')
    where exists (select 1 from unnest(tags) t where lower(t) = lower(p_name));
  get diagnostics v_count = row_count;
  perform set_config('app.song_op', '', true);
  return v_count;
end;
$$;

revoke execute on function create_song_tag(text, text) from anon, public;
revoke execute on function rename_song_tag(text, text) from anon, public;
revoke execute on function archive_song_tag(text) from anon, public;
grant execute on function create_song_tag(text, text), rename_song_tag(text, text), archive_song_tag(text) to authenticated;
