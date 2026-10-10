-- WO-2 final step — run by hand in the Supabase SQL editor once the new
-- contact/calendar screens have been checked (the connector blocks DROP).
-- The data already lives in profile_contact / calendar_tokens (00014), and
-- 00014c already makes these columns unreadable through the API.
-- Afterwards: move this file into migrations/ as 00015_drop_legacy_profile_columns.sql
-- and regenerate src/lib/supabase/database.types.ts.
alter table profiles
  drop column email,
  drop column phone,
  drop column notes,
  drop column calendar_token;

-- The erase function must stop touching the dropped columns:
create or replace function erase_profile_personal_data(p_profile_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Admin only'; end if;
  update profiles set full_name = 'Former volunteer', preferred_name = null, avatar_url = null, is_active = false
    where id = p_profile_id;
  update profile_contact set email = 'erased@invalid.local', phone = null, notes = null where profile_id = p_profile_id;
  update calendar_tokens set token = gen_random_uuid(), rotated_at = now() where profile_id = p_profile_id;
  delete from blockout_dates where profile_id = p_profile_id;
  delete from serving_preferences where profile_id = p_profile_id;
  delete from notifications where profile_id = p_profile_id;
  update availability_responses set note = null where profile_id = p_profile_id;
  update assignments set decline_reason = null where profile_id = p_profile_id;
end;
$$;
