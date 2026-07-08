-- Pre-deploy hardening (advisor sweep, 2026-07-08).
-- 1) The is_* RLS helpers were executable by anon via /rest/v1/rpc — no data
--    leak (booleans over unguessable UUIDs) but no reason to allow it either.
--    Anon makes no table queries in this app, so policies never evaluate
--    these functions for anon.
revoke execute on function is_admin(uuid) from anon;
revoke execute on function is_team_lead(uuid, uuid) from anon;
revoke execute on function is_any_team_lead(uuid) from anon;
revoke execute on function is_assigned_to_service(uuid, uuid) from anon;
revoke execute on function is_active_profile(uuid) from anon;

-- 2) Two duplicate (service, song) setlist rows from the historical import
--    (same-day double services) — keep the lowest order_index of each pair.
delete from service_songs ss using service_songs dup
  where ss.service_id = dup.service_id
    and ss.song_id = dup.song_id
    and ss.id > dup.id;
