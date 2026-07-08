-- Historical person-level serving records (Matt, 2026-07-06).
-- Names from the 2021-2026 rota spreadsheet are staged here; when a volunteer
-- signs up, an admin links their profile to their spreadsheet name(s) and
-- claim_legacy_history() materialises real assignments — warming up fairness
-- scoring and giving volunteers their full serving story from day one.

create table legacy_assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  role_id uuid references roles(id),
  person_name text not null,
  claimed_profile_id uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_legacy_person on legacy_assignments (person_name) where claimed_profile_id is null;

alter table legacy_assignments enable row level security;
create policy "leads read legacy" on legacy_assignments for select
  using (is_any_team_lead(auth.uid()) or is_admin(auth.uid()));
create policy "admins manage legacy" on legacy_assignments for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- Link one spreadsheet name variant to a real profile. Idempotent; a person
-- can claim several variants ("Dave Asplin", "Dave A").
create or replace function claim_legacy_history(p_person_name text, p_profile_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if not is_admin(auth.uid()) then raise exception 'Admin only'; end if;
  insert into assignments (service_id, role_id, profile_id, status, responded_at, assigned_at)
  select la.service_id, la.role_id, p_profile_id, 'confirmed', now(), now()
  from legacy_assignments la
  where la.person_name = p_person_name
    and la.claimed_profile_id is null
    and la.role_id is not null
    and not exists (
      select 1 from assignments a
      where a.service_id = la.service_id and a.role_id = la.role_id and a.profile_id = p_profile_id
    );
  get diagnostics v_count = row_count;
  update legacy_assignments set claimed_profile_id = p_profile_id
    where person_name = p_person_name and claimed_profile_id is null;
  return v_count;
end;
$$;
revoke execute on function claim_legacy_history(text, uuid) from anon, public;
