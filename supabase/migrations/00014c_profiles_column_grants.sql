-- WO-2 part 3 (apply AFTER the frontend that stops selecting profiles.* is
-- live): signed-in users may read and write only the non-sensitive profile
-- columns. RLS stays row-level as before; this adds the missing column-level
-- boundary, so email/phone/notes/calendar_token on profiles are unreadable
-- through the API even though the legacy data is still physically present
-- (removed later by migrations_pending/drop_legacy_profile_columns.sql).
-- SECURITY DEFINER functions (auth hook, GDPR export/erase, reminders) and
-- the service role are unaffected.
revoke select, insert, update on profiles from authenticated, anon;
grant select (id, full_name, preferred_name, avatar_url, is_admin, is_active, created_at, updated_at)
  on profiles to authenticated;
grant update (full_name, preferred_name, avatar_url, is_admin, is_active)
  on profiles to authenticated;
-- (is_admin/is_active writes remain guarded by trg_guard_profile_privileges;
--  inserts only ever happen via handle_new_user.)
