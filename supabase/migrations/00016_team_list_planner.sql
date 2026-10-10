-- WO-3 (2026-10-10, approved by Matt: "Team list, no logins").
-- The planner schedules PEOPLE, not just app accounts: most of the team will
-- never sign in. team_people is the roster; a person may later be linked to a
-- profile (profile_id) when they sign up. Everything here is planning data,
-- visible to admins and team leads only (names of people who never consented
-- to an app account must not be readable by ordinary members).
-- Owner: Agent 1. Additive only.

create table households (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  name text not null check (length(trim(name)) between 1 and 80),
  preference text not null default 'together' check (preference in ('together', 'apart', 'none')),
  created_at timestamptz not null default now()
);

create table team_people (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  full_name text check (full_name is null or length(full_name) <= 120),
  profile_id uuid unique references profiles(id) on delete set null,
  household_id uuid references households(id) on delete set null,
  max_per_month integer check (max_per_month is null or max_per_month between 1 and 5),
  is_active boolean not null default true,
  merged_into_id uuid references team_people(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
create unique index uq_team_people_name on team_people (team_id, lower(trim(display_name))) where merged_into_id is null;

create table person_roles (
  person_id uuid not null references team_people(id) on delete cascade,
  role_id uuid not null references roles(id),
  rank integer not null default 1 check (rank between 1 and 10),
  primary key (person_id, role_id)
);

create table name_aliases (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references team_people(id) on delete cascade,
  alias text not null check (length(trim(alias)) between 1 and 80),
  alias_key text generated always as (lower(regexp_replace(trim(alias), '\s+', ' ', 'g'))) stored,
  source text not null default 'manual' check (source in ('legacy', 'form', 'manual')),
  created_at timestamptz not null default now()
);
create unique index uq_name_aliases_key on name_aliases (alias_key);

create table availability_imports (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  file_name text not null check (length(file_name) <= 200),
  month date not null check (extract(day from month) = 1),
  row_count integer not null default 0,
  summary jsonb not null default '{}',
  imported_by uuid references profiles(id),
  imported_at timestamptz not null default now()
);

-- One row per form submission kept after de-duplication (latest per person).
create table availability_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references availability_imports(id) on delete cascade,
  raw_name text not null check (length(raw_name) <= 120),
  person_id uuid references team_people(id) on delete set null,
  request_note text check (request_note is null or length(request_note) <= 1000),
  submitted_at timestamptz,
  answers jsonb not null default '{}'
);

create table person_availability (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  person_id uuid not null references team_people(id) on delete cascade,
  response text not null check (response in ('yes', 'no', 'maybe')),
  import_id uuid references availability_imports(id) on delete set null,
  submitted_at timestamptz not null default now(),
  unique (service_id, person_id)
);

-- The working monthly plan. One row per role slot on a service.
create table rota_plan_slots (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  role_id uuid not null references roles(id),
  slot_index integer not null default 0 check (slot_index between 0 and 9),
  person_id uuid references team_people(id) on delete set null,
  locked boolean not null default false,
  source text not null default 'auto' check (source in ('auto', 'manual')),
  reasons text[] not null default '{}',
  relaxed text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  unique (service_id, role_id, slot_index)
);
create index idx_rota_plan_slots_person on rota_plan_slots (person_id);

-- Planner rules as data: plain-English label, parameters, priority, on/off.
create table scheduling_rules (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  kind text not null check (kind in ('core_roles', 'rest_gap', 'monthly_cap', 'households', 'fairness', 'all_in', 'planned_roles')),
  label text not null check (length(label) <= 200),
  params jsonb not null default '{}',
  priority integer not null default 100,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  unique (team_id, kind)
);

-- An "All-in" Sunday staffs every available person.
alter table services add column is_all_in boolean not null default false;

-- updated_at bookkeeping
create or replace function touch_updated() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
create trigger trg_team_people_touch before update on team_people for each row execute function touch_updated();
create trigger trg_rota_plan_slots_touch before insert or update on rota_plan_slots for each row execute function touch_updated();
create trigger trg_scheduling_rules_touch before update on scheduling_rules for each row execute function touch_updated();
revoke execute on function touch_updated() from anon, authenticated, public;

-- RLS: planners only (admins and team leads).
create or replace function is_planner(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_admin(uid) or is_any_team_lead(uid), false);
$$;
revoke execute on function is_planner(uuid) from anon, public;
grant execute on function is_planner(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['households', 'team_people', 'person_roles', 'name_aliases', 'availability_imports',
                           'availability_import_rows', 'person_availability', 'rota_plan_slots', 'scheduling_rules'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "planners read %1$s" on %1$I for select using (is_planner(auth.uid()))', t);
    execute format('create policy "planners add %1$s" on %1$I for insert with check (is_planner(auth.uid()))', t);
    execute format('create policy "planners change %1$s" on %1$I for update using (is_planner(auth.uid())) with check (is_planner(auth.uid()))', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update on %I to authenticated', t);
  end loop;
end $$;

-- Removing an instrument, an alias or a household link is normal editing.
-- People, imports and plans are never hard-deleted (archive / clear instead).
create policy "planners remove person_roles" on person_roles for delete using (is_planner(auth.uid()));
create policy "planners remove name_aliases" on name_aliases for delete using (is_planner(auth.uid()));
create policy "planners remove households" on households for delete using (is_planner(auth.uid()));
grant delete on person_roles, name_aliases, households to authenticated;
