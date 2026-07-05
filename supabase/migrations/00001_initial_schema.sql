-- Breathe Worship Scheduler — initial schema
-- Source of truth: PRD §7.2 (schema), §7.3 (functions), §7.4 (design principles)
-- Owner: Agent 1 (Backend & Schema). No other agent edits this path (PRD §18.5).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables (PRD §7.2, verbatim where specified)
-- ---------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  preferred_name text,
  email text not null,
  phone text,
  avatar_url text,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  is_team_lead boolean not null default false,
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  unique (team_id, profile_id)
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  description text,
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table role_eligibility (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  proficiency text not null default 'competent' check (proficiency in ('trainee','competent','lead')),
  is_active boolean not null default true,
  unique (profile_id, role_id)
);

create table serving_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade, -- null = applies across every team
  max_services_per_period int,
  period_type text not null default 'month' check (period_type in ('week','month')),
  note text,
  updated_at timestamptz not null default now(),
  unique (profile_id, team_id)
);

create table service_templates (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  default_start_time time,
  default_duration_minutes int default 90,
  recurrence_rule text, -- RRULE string
  is_active boolean not null default true
);

create table template_role_requirements (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references service_templates(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  quantity_required int not null default 1,
  is_required boolean not null default true
);

create table services (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  template_id uuid references service_templates(id),
  title text not null,
  service_date date not null,
  start_time time not null,
  end_time time,
  location text,
  notes text,
  status text not null default 'draft'
    check (status in ('draft','availability_open','scheduling_open','published','completed','cancelled')),
  availability_locked boolean not null default false,
  scheduling_locked boolean not null default false,
  archived_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table service_role_requirements (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  quantity_required int not null default 1,
  is_required boolean not null default true,
  notes text
);

create table availability_responses (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  response text not null check (response in ('yes','no','maybe')),
  note text,
  responded_at timestamptz not null default now(),
  unique (service_id, profile_id)
);

create table blockout_dates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  start_date date,
  end_date date,
  recurring_day_of_week int check (recurring_day_of_week between 0 and 6), -- 0=Sunday..6=Saturday
  reason text,
  created_at timestamptz not null default now()
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'invited'
    check (status in ('invited','confirmed','declined','needs_substitute','substituted')),
  assigned_by uuid references profiles(id),
  assigned_at timestamptz not null default now(),
  responded_at timestamptz,
  decline_reason text,
  substitute_for_assignment_id uuid references assignments(id)
);

create table swap_requests (
  id uuid primary key default gen_random_uuid(),
  original_assignment_id uuid not null references assignments(id) on delete cascade,
  requested_by uuid not null references profiles(id),
  status text not null default 'open'
    check (status in ('open','claimed','approved','cancelled')),
  claimed_by_profile_id uuid references profiles(id),
  claimed_at timestamptz,
  approved_by uuid references profiles(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  ccli_number text,
  default_key text,
  tempo_bpm int,
  duration_seconds int,
  tags text[],
  chord_chart_url text,
  audio_url text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table service_songs (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  song_id uuid not null references songs(id),
  order_index int not null default 0,
  key_override text,
  notes text
);

create table service_order_items (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services(id) on delete cascade,
  order_index int not null default 0,
  item_type text not null check (item_type in ('song','sermon','announcement','communion','offering','custom')),
  title text not null,
  duration_minutes int,
  notes text,
  linked_song_id uuid references songs(id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  related_service_id uuid references services(id),
  is_read boolean not null default false,
  sent_via text not null default 'email' check (sent_via in ('email','push','in_app')),
  created_at timestamptz not null default now()
);

create table notification_preferences (
  profile_id uuid primary key references profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  push_enabled boolean not null default true,
  reminder_days_before int not null default 3
);

create table encouragement_messages (
  id uuid primary key default gen_random_uuid(),
  trigger_type text not null check (trigger_type in ('milestone_count','anniversary','hit_preferred_frequency','streak')),
  threshold int, -- e.g. 10 services served; null for hit_preferred_frequency
  message_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- STAT-1 numbers are computed at read time from assignments, never cached (PRD §7.2 note).

create table admin_access_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','denied')),
  requested_at timestamptz not null default now(),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions used by RLS (PRD §7.3) — pinned search_path for safety
-- ---------------------------------------------------------------------------

create or replace function is_admin(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = uid and is_active), false);
$$;

create or replace function is_team_lead(uid uuid, p_team_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_memberships
    where profile_id = uid and team_id = p_team_id and is_team_lead = true and is_active = true
  );
$$;

create or replace function is_any_team_lead(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_memberships
    where profile_id = uid and is_team_lead = true and is_active = true
  );
$$;

create or replace function is_assigned_to_service(uid uuid, p_service_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assignments where profile_id = uid and service_id = p_service_id
  );
$$;

create or replace function is_active_profile(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from profiles where id = uid), false);
$$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();
create trigger trg_services_updated_at before update on services
  for each row execute function set_updated_at();
create trigger trg_serving_prefs_updated_at before update on serving_preferences
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Privilege-escalation guard: non-admins cannot change is_admin / is_active
-- ---------------------------------------------------------------------------

create or replace function guard_profile_privileges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.is_admin is distinct from old.is_admin or new.is_active is distinct from old.is_active)
     and not is_admin(auth.uid()) then
    raise exception 'Only an admin can change is_admin or is_active';
  end if;
  return new;
end;
$$;

create trigger trg_guard_profile_privileges before update on profiles
  for each row execute function guard_profile_privileges();

-- ---------------------------------------------------------------------------
-- Audit logging (PRD §7.4.3): every mutating scheduling/admin action is logged
-- ---------------------------------------------------------------------------

create or replace function audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_entity_id uuid;
begin
  v_entity_id := coalesce(
    case when tg_op = 'DELETE' then old.id else new.id end, null);
  insert into audit_log (actor_profile_id, action, entity_type, entity_id, before, after)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    v_entity_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_assignments after insert or update or delete on assignments
  for each row execute function audit_row_change();
create trigger trg_audit_services after insert or update or delete on services
  for each row execute function audit_row_change();
create trigger trg_audit_swap_requests after insert or update or delete on swap_requests
  for each row execute function audit_row_change();
create trigger trg_audit_roles after insert or update or delete on roles
  for each row execute function audit_row_change();
create trigger trg_audit_team_memberships after insert or update or delete on team_memberships
  for each row execute function audit_row_change();
create trigger trg_audit_profiles after update on profiles
  for each row execute function audit_row_change();
create trigger trg_audit_serving_preferences after insert or update or delete on serving_preferences
  for each row execute function audit_row_change();

-- ---------------------------------------------------------------------------
-- New-user hook: create profile row on Supabase Auth signup (invite-only flow)
-- ---------------------------------------------------------------------------

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  insert into public.notification_preferences (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Indexes for the query paths in §8.1 (no N+1 on rota building)
-- ---------------------------------------------------------------------------

create index idx_team_memberships_profile on team_memberships (profile_id) where is_active;
create index idx_roles_team on roles (team_id) where is_active;
create index idx_role_eligibility_role on role_eligibility (role_id) where is_active;
create index idx_role_eligibility_profile on role_eligibility (profile_id) where is_active;
create index idx_services_team_date on services (team_id, service_date);
create index idx_services_status on services (status) where archived_at is null;
create index idx_srr_service on service_role_requirements (service_id);
create index idx_availability_service on availability_responses (service_id);
create index idx_availability_profile on availability_responses (profile_id);
create index idx_blockouts_profile on blockout_dates (profile_id);
create index idx_assignments_service on assignments (service_id);
create index idx_assignments_profile on assignments (profile_id);
create index idx_swaps_status on swap_requests (status);
create index idx_service_songs_service on service_songs (service_id);
create index idx_order_items_service on service_order_items (service_id);
create index idx_notifications_profile on notifications (profile_id, is_read);
create index idx_audit_created on audit_log (created_at);
