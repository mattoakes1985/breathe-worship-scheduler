-- Fix: guard_profile_privileges blocked ALL is_admin/is_active changes unless
-- the caller was an app-authenticated admin — including the dashboard SQL
-- editor and service-role operations (auth.uid() is null there), which made
-- bootstrapping the first admin impossible. The guard exists to stop a
-- signed-in non-admin *user* escalating themselves; direct DB/service-role
-- access is already trusted and must bypass it.
create or replace function guard_profile_privileges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.is_admin is distinct from old.is_admin or new.is_active is distinct from old.is_active)
     and auth.uid() is not null            -- null = SQL editor / service role: trusted
     and not is_admin(auth.uid()) then
    raise exception 'Only an admin can change is_admin or is_active';
  end if;
  return new;
end;
$$;
