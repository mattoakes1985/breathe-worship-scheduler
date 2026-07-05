-- Breathe Worship Scheduler — Row Level Security
-- PRD §8.3: RLS is the actual security boundary, not the frontend.
-- Every table gets RLS enabled + explicit policies. Owner: Agent 1.

alter table profiles enable row level security;
alter table teams enable row level security;
alter table team_memberships enable row level security;
alter table roles enable row level security;
alter table role_eligibility enable row level security;
alter table serving_preferences enable row level security;
alter table service_templates enable row level security;
alter table template_role_requirements enable row level security;
alter table services enable row level security;
alter table service_role_requirements enable row level security;
alter table availability_responses enable row level security;
alter table blockout_dates enable row level security;
alter table assignments enable row level security;
alter table swap_requests enable row level security;
alter table songs enable row level security;
alter table service_songs enable row level security;
alter table service_order_items enable row level security;
alter table notifications enable row level security;
alter table notification_preferences enable row level security;
alter table encouragement_messages enable row level security;
alter table admin_access_requests enable row level security;
alter table audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: all active members can see basic profiles (needed for master
-- schedule, SCHED-6); users update their own row (privilege guard trigger
-- prevents is_admin/is_active self-changes); admins manage everything.
-- ---------------------------------------------------------------------------
create policy "active members read profiles" on profiles for select
  using (auth.uid() is not null and is_active_profile(auth.uid()));
create policy "own profile update" on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy "admins manage profiles" on profiles for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- teams / roles: read by members; write admin-only (PPL-2, /admin/roles)
create policy "members read teams" on teams for select
  using (is_active_profile(auth.uid()));
create policy "admins manage teams" on teams for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create policy "members read roles" on roles for select
  using (is_active_profile(auth.uid()));
create policy "admins manage roles" on roles for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- team_memberships: read by members; write admin (PPL-4: lead flag is per-team)
create policy "members read memberships" on team_memberships for select
  using (is_active_profile(auth.uid()));
create policy "admins manage memberships" on team_memberships for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- role_eligibility: read by members (rota builder needs it); write admin or
-- that role's team lead (PPL-1/PPL-3)
create policy "members read eligibility" on role_eligibility for select
  using (is_active_profile(auth.uid()));
create policy "admins manage eligibility" on role_eligibility for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "team leads manage eligibility" on role_eligibility for all
  using (exists (select 1 from roles r where r.id = role_eligibility.role_id
                 and is_team_lead(auth.uid(), r.team_id)))
  with check (exists (select 1 from roles r where r.id = role_eligibility.role_id
                 and is_team_lead(auth.uid(), r.team_id)));

-- serving_preferences (AVAIL-4): own read/write; leads+admins read (visible
-- to Team Leads building the rota); never readable by peers.
create policy "own preferences" on serving_preferences for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "leads read preferences" on serving_preferences for select
  using (is_any_team_lead(auth.uid()));
create policy "admins manage preferences" on serving_preferences for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- service_templates / template_role_requirements: read members; write leads+admins (SVC-1)
create policy "members read templates" on service_templates for select
  using (is_active_profile(auth.uid()));
create policy "leads manage templates" on service_templates for all
  using (is_team_lead(auth.uid(), team_id) or is_admin(auth.uid()))
  with check (is_team_lead(auth.uid(), team_id) or is_admin(auth.uid()));

create policy "members read template requirements" on template_role_requirements for select
  using (is_active_profile(auth.uid()));
create policy "leads manage template requirements" on template_role_requirements for all
  using (exists (select 1 from service_templates t where t.id = template_id
                 and (is_team_lead(auth.uid(), t.team_id) or is_admin(auth.uid()))))
  with check (exists (select 1 from service_templates t where t.id = template_id
                 and (is_team_lead(auth.uid(), t.team_id) or is_admin(auth.uid()))));

-- services: volunteers see non-draft, non-archived services (SVC-3: drafts are
-- lead/admin-only); leads+admins manage.
create policy "members read visible services" on services for select
  using (is_active_profile(auth.uid()) and status <> 'draft' and archived_at is null);
create policy "leads read all services" on services for select
  using (is_team_lead(auth.uid(), team_id));
create policy "admins read all services" on services for select
  using (is_admin(auth.uid()));
create policy "leads manage services" on services for insert
  with check (is_team_lead(auth.uid(), team_id) or is_admin(auth.uid()));
create policy "leads update services" on services for update
  using (is_team_lead(auth.uid(), team_id) or is_admin(auth.uid()))
  with check (is_team_lead(auth.uid(), team_id) or is_admin(auth.uid()));
-- no delete policy: soft-archive only (SVC-4)

create policy "members read service requirements" on service_role_requirements for select
  using (exists (select 1 from services s where s.id = service_id
                 and is_active_profile(auth.uid())
                 and (s.status <> 'draft' or is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))));
create policy "leads manage service requirements" on service_role_requirements for all
  using (exists (select 1 from services s where s.id = service_id
                 and (is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))))
  with check (exists (select 1 from services s where s.id = service_id
                 and (is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))));

-- availability_responses (AVAIL-1): own rows only; changes blocked once
-- scheduling is locked; leads see all responses for their team's services.
create policy "own availability read" on availability_responses for select
  using (profile_id = auth.uid());
create policy "own availability insert" on availability_responses for insert
  with check (
    profile_id = auth.uid()
    and exists (select 1 from services s where s.id = service_id
                and s.status = 'availability_open'
                and not s.availability_locked and not s.scheduling_locked)
  );
create policy "own availability update" on availability_responses for update
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and exists (select 1 from services s where s.id = service_id
                and not s.scheduling_locked)
  );
create policy "leads read availability" on availability_responses for select
  using (exists (select 1 from services s where s.id = service_id
                 and is_team_lead(auth.uid(), s.team_id)));
create policy "admins manage availability" on availability_responses for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- blockout_dates (AVAIL-2): own CRUD; leads+admins read
create policy "own blockouts" on blockout_dates for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "leads read blockouts" on blockout_dates for select
  using (is_any_team_lead(auth.uid()) or is_admin(auth.uid()));

-- assignments: own rows; whole team sees published/completed rotas (SCHED-6);
-- leads manage for their team's services (PRD §8.3 pattern).
create policy "volunteers see their own assignments" on assignments for select
  using (profile_id = auth.uid());
create policy "team sees published rota" on assignments for select
  using (
    is_active_profile(auth.uid())
    and exists (select 1 from services s where s.id = service_id
                and s.status in ('published','completed'))
  );
create policy "team leads see team assignments" on assignments for select
  using (exists (select 1 from services s where s.id = assignments.service_id
                 and is_team_lead(auth.uid(), s.team_id)));
create policy "team leads insert assignments" on assignments for insert
  with check (exists (select 1 from services s where s.id = service_id
                      and (is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))
                      and not s.scheduling_locked));
create policy "team leads update assignments" on assignments for update
  using (exists (select 1 from services s where s.id = assignments.service_id
                 and (is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))))
  with check (exists (select 1 from services s where s.id = assignments.service_id
                 and (is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))));
-- volunteer confirm/decline (SCHED-4) happens via respond_to_assignment RPC,
-- not a direct update policy, so status transitions stay controlled.
create policy "admins manage assignments" on assignments for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- swap_requests (SWAP-1..3): members see swaps (board); create only for your
-- own assignment; claim/approve go through RPCs for atomicity.
create policy "members read swaps" on swap_requests for select
  using (is_active_profile(auth.uid()));
create policy "create swap for own assignment" on swap_requests for insert
  with check (
    requested_by = auth.uid()
    and exists (select 1 from assignments a where a.id = original_assignment_id
                and a.profile_id = auth.uid())
  );
create policy "requester cancels own open swap" on swap_requests for update
  using (requested_by = auth.uid() and status = 'open')
  with check (requested_by = auth.uid() and status in ('open','cancelled'));
create policy "leads manage swaps" on swap_requests for update
  using (exists (select 1 from assignments a join services s on s.id = a.service_id
                 where a.id = swap_requests.original_assignment_id
                 and (is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))))
  with check (true);
create policy "admins manage swaps" on swap_requests for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- songs / service_songs / service_order_items (WOR-1..3): read members;
-- write leads+admins.
create policy "members read songs" on songs for select
  using (is_active_profile(auth.uid()));
create policy "leads manage songs" on songs for all
  using (is_any_team_lead(auth.uid()) or is_admin(auth.uid()))
  with check (is_any_team_lead(auth.uid()) or is_admin(auth.uid()));

create policy "members read service songs" on service_songs for select
  using (exists (select 1 from services s where s.id = service_id
                 and is_active_profile(auth.uid())
                 and (s.status <> 'draft' or is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))));
create policy "leads manage service songs" on service_songs for all
  using (exists (select 1 from services s where s.id = service_id
                 and (is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))))
  with check (exists (select 1 from services s where s.id = service_id
                 and (is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))));

create policy "members read order items" on service_order_items for select
  using (exists (select 1 from services s where s.id = service_id
                 and is_active_profile(auth.uid())
                 and (s.status <> 'draft' or is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))));
create policy "leads manage order items" on service_order_items for all
  using (exists (select 1 from services s where s.id = service_id
                 and (is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))))
  with check (exists (select 1 from services s where s.id = service_id
                 and (is_team_lead(auth.uid(), s.team_id) or is_admin(auth.uid()))));

-- notifications: own read + mark-read only; created server-side (security
-- definer functions), never by clients.
create policy "own notifications read" on notifications for select
  using (profile_id = auth.uid());
create policy "own notifications mark read" on notifications for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "admins read notifications" on notifications for select
  using (is_admin(auth.uid()));

-- notification_preferences: own CRUD
create policy "own notification prefs" on notification_preferences for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy "admins read notification prefs" on notification_preferences for select
  using (is_admin(auth.uid()));

-- encouragement_messages (STAT-3): read members; write admin
create policy "members read encouragement" on encouragement_messages for select
  using (is_active_profile(auth.uid()));
create policy "admins manage encouragement" on encouragement_messages for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- admin_access_requests: create own; see own; admins review
create policy "request admin access" on admin_access_requests for insert
  with check (profile_id = auth.uid());
create policy "see own access requests" on admin_access_requests for select
  using (profile_id = auth.uid());
create policy "admins manage access requests" on admin_access_requests for all
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

-- audit_log (DASH-3): admins read; rows written only by security definer
-- triggers/functions — no client insert/update/delete policies at all.
create policy "admins read audit log" on audit_log for select
  using (is_admin(auth.uid()));
