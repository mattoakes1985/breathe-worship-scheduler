-- WO-2 (2026-10-10): close the profile contact/token exposure.
-- Before: RLS "active members read profiles" let ANY active member read every
-- profile's email, phone, notes and calendar_token (RLS is row-level only).
-- After:
--   * profile_contact (email, phone, notes): readable by the person, team
--     leads and admins; the person may edit their own phone only.
--   * calendar_tokens: readable by the owner only; rotated via RPC.
--   * Every token is ROTATED here (fresh values, old feed URLs stop working).
--   * profiles: after the new frontend is deployed, 00014c switches profiles to
--     column-level SELECT/UPDATE grants so signed-in users can read names only.
--     The legacy columns are NOT wiped (the Supabase connector refuses bulk PII
--     updates, and keeping them is a free backup); they are removed later with
--     supabase/migrations_pending/drop_legacy_profile_columns.sql.
-- Owner: Agent 1. Additive only (no drops/deletes).

create table profile_contact (
  profile_id uuid primary key references profiles(id) on delete cascade,
  email text not null default '',
  phone text check (phone is null or length(phone) <= 40),
  notes text check (notes is null or length(notes) <= 2000),
  updated_at timestamptz not null default now()
);
create table calendar_tokens (
  profile_id uuid primary key references profiles(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  rotated_at timestamptz not null default now()
);

insert into profile_contact (profile_id, email, phone, notes)
select id, coalesce(email, ''), phone, notes from profiles
on conflict (profile_id) do nothing;
-- fresh tokens for everyone = rotation
insert into calendar_tokens (profile_id) select id from profiles
on conflict (profile_id) do nothing;

alter table profile_contact enable row level security;
alter table calendar_tokens enable row level security;

create policy "self, leads and admins read contact" on profile_contact for select
  using (profile_id = auth.uid() or is_admin(auth.uid()) or is_any_team_lead(auth.uid()));
create policy "self updates own contact" on profile_contact for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "admins insert contact" on profile_contact for insert
  with check (is_admin(auth.uid()));
create policy "admins update contact" on profile_contact for update
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create policy "owner reads own calendar token" on calendar_tokens for select
  using (profile_id = auth.uid());
-- (no write policies: rotation only via rotate_my_calendar_token)

-- A non-admin may change only their own phone (email follows auth; notes are
-- pastoral/admin). SQL editor / service role (auth.uid() null) is trusted.
create or replace function guard_profile_contact() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is not null and not is_admin(auth.uid())
     and (new.email is distinct from old.email or new.notes is distinct from old.notes
          or new.profile_id is distinct from old.profile_id) then
    raise exception 'Only an admin can change email or notes';
  end if;
  return new;
end;
$$;
create trigger trg_guard_profile_contact before update on profile_contact
  for each row execute function guard_profile_contact();

-- profiles.email is legacy: default it so nothing has to write it (and the
-- later column removal can't break sign-up).
alter table profiles alter column email set default '';

-- New sign-ups: names on profiles, contact + token in their own tables.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  insert into public.profile_contact (profile_id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (profile_id) do update set email = excluded.email;
  insert into public.calendar_tokens (profile_id) values (new.id)
  on conflict (profile_id) do nothing;
  insert into public.notification_preferences (profile_id) values (new.id)
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

-- Owner-only calendar link rotation ("my link leaked / get a new link").
create or replace function rotate_my_calendar_token() returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into calendar_tokens (profile_id) values (auth.uid())
  on conflict (profile_id) do update set token = gen_random_uuid(), rotated_at = now()
  returning token into v;
  return v;
end;
$$;

-- Names-only directory for members (explicit, so future columns added to
-- profiles never leak by default through this view).
create view member_directory with (security_invoker = on) as
select id, full_name, preferred_name, avatar_url, is_active from profiles;

-- GDPR export: include contact details (never the calendar token).
create or replace function export_profile_data(p_profile_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin(auth.uid()) then raise exception 'Admin only'; end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) - 'calendar_token' - 'email' - 'phone' - 'notes' from profiles p where p.id = p_profile_id),
    'contact', (select jsonb_build_object('email', c.email, 'phone', c.phone, 'notes', c.notes) from profile_contact c where c.profile_id = p_profile_id),
    'memberships', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from team_memberships t where t.profile_id = p_profile_id),
    'role_eligibility', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from role_eligibility t where t.profile_id = p_profile_id),
    'serving_preferences', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from serving_preferences t where t.profile_id = p_profile_id),
    'availability_responses', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from availability_responses t where t.profile_id = p_profile_id),
    'blockout_dates', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from blockout_dates t where t.profile_id = p_profile_id),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from assignments t where t.profile_id = p_profile_id),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from notifications t where t.profile_id = p_profile_id)
  );
end;
$$;

revoke execute on function guard_profile_contact() from anon, authenticated, public;
revoke execute on function handle_new_user() from anon, authenticated, public;
revoke execute on function rotate_my_calendar_token() from anon, public;
revoke execute on function export_profile_data(uuid) from anon, public;
grant execute on function rotate_my_calendar_token() to authenticated;
revoke all on member_directory from anon;
grant select on member_directory to authenticated;
revoke all on profile_contact, calendar_tokens from anon;
