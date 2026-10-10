-- WO-2 part 2 — RUN BY HAND in the Supabase SQL editor (the connector
-- refuses migrations containing row-removing statements, and this GDPR
-- function has always removed blockouts/preferences/notifications).
-- Change vs 00003: also anonymises profile_contact and kills the calendar link.
create or replace function erase_profile_personal_data(p_profile_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Admin only'; end if;
  update profiles set full_name = 'Former volunteer', preferred_name = null, email = '', phone = null,
    avatar_url = null, notes = null, is_active = false
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
revoke execute on function erase_profile_personal_data(uuid) from anon, public;
