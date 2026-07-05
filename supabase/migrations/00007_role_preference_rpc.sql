-- Change request #5: volunteers rank their own instruments (1 = first choice).
-- role_eligibility rows are lead/admin-managed; this RPC lets a volunteer
-- update ONLY the preference_rank on their own rows — nothing else.
create or replace function set_my_role_preference(p_role_id uuid, p_rank int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_rank < 1 or p_rank > 10 then raise exception 'Rank must be 1–10'; end if;
  update role_eligibility
    set preference_rank = p_rank
    where profile_id = auth.uid() and role_id = p_role_id;
  if not found then raise exception 'You are not eligible for that role'; end if;
end;
$$;
revoke execute on function set_my_role_preference(uuid, int) from anon, public;
