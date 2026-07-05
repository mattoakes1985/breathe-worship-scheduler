# Breathe Worship Scheduler — Product Requirements Document

| | |
|---|---|
| **Product name (working title)** | Breathe Worship Scheduler |
| **Church** | Breathe New Life Church, Stoke-on-Trent, UK |
| **Team (v1 pilot)** | Breathe Worship |
| **Document owner** | Matt Oakes |
| **Prepared for** | Fable 5 — buildable as a single orchestrating agent, or split across a multi-agent team per §18 |
| **Version** | 1.2 |
| **Date** | 5 July 2026 (v1.2 revision) |
| **Status** | Locked for build — see §3 for decisions that are not open for reinterpretation |

**Changes in v1.1**: added preference-aware auto-scheduling (AVAIL-4, SCHED-7), a private/non-competitive serving stats and encouragement module (§6.11, STAT-1–4), a materially more prescriptive design system with a mandatory design sign-off gate (§10), corrected the record on `church-scheduler-app`'s actual contribution to this schema (§0), and added the `serving_preferences` and `encouragement_messages` tables (§7.2).

**Changes in v1.2**: added §18, a multi-agent execution plan — agent roster, ownership boundaries, shared contract artifacts, build sequencing, and coordination rules — so this PRD can be split across a parallel AI build team instead of only a single serial agent. No functional requirement changed; this is a work-breakdown layer on top of §§6–14.

---

## 0. How to use this document (read this first)

This PRD is written to be built **with no clarifying questions back to the church**, whether by one agent working serially or several agents working in parallel (see §18 for the multi-agent breakdown). Every section that could otherwise be ambiguous has an explicit default, an explicit acceptance criterion, or an explicit "open item" flagged in §15. If a builder hits a decision point not covered here, the default in §3 governs, not an assumption made mid-build — and in a multi-agent build, not a private assumption made by one agent that the others never see.

Three earlier attempts at this problem exist and inform this spec:

- **`church-scheduler-app`** (Python/Flask, ~79 commits) — the earliest attempt, abandoned pre-production, but its live schema (verified directly, not assumed) already contains `event`/`event_template`/`template_team_role`/`event_team_requirement`/`volunteer_team_role` (with an `is_lead` flag)/`volunteer_availability`/`volunteer_assignment` as separate tables, plus a soft-delete `archived_at` pattern and a `song`/`event_song` model added via later migrations. This is the **original source** of the data-model pattern this PRD uses — not a discarded prototype with nothing to reuse. It also has one feature neither later attempt kept: a Plotly/NetworkX interactive network graph of volunteer↔team↔role relationships (noted as a Phase 3 candidate in §5.3).
- **`ServiceWeaver` / `service-flow-tool`** (React + TypeScript + Vite + Supabase, 107 commits) — the most mature prior attempt, and very likely a Supabase/TypeScript port of `church-scheduler-app`'s schema given the near-identical table/column naming (`event_templates`, `template_team_roles`, `event_team_requirements`, `volunteer_team_roles`, `volunteer_availability`, `volunteer_assignments`). It added Supabase RLS as the security boundary and a cleaner frontend structure on top of the same underlying model. **This PRD deliberately reuses that proven data-model lineage** even though the decision (see §3) is to write fresh code rather than extend either repository. Where this document's schema resembles both prior attempts, that is intentional inheritance of a design that worked twice already, not coincidence.
- **Planning Center Services** and **iKnow Church** — the two commercial products this app must be better than *for this church's specific workflow*, not better in general. §2.3 has the feature comparison. This app is not trying to out-build either as a general-market product; it is trying to fit Breathe Worship's actual rota workflow with less friction than either does.

---

## 1. Executive Summary

Breathe New Life Church needs a purpose-built volunteer scheduling and worship-planning tool for its Breathe Worship team: collect availability, build a fair rota across worship roles (vocals, band, sound, slides, livestream), plan the song set and running order for each service, and keep everyone notified — without paying for a general-purpose ChMS (Planning Center, iKnow Church) that bundles in modules (giving, check-in, group management, safeguarding, finance) the church either doesn't need in this tool or already handles elsewhere.

The application is a mobile-first, installable web app (React + Supabase), single-tenant, built around **one worship team in v1** with a data model that does not have to be re-architected if other ministries (Welcome, AV, Kids) are added in a later phase.

## 2. Background & Competitive Context

### 2.1 Why not just use Planning Center or iKnow Church?

Both are credible, mature products. This is not a "we can build better software" claim — it's a fit and cost claim, made explicitly so the build team doesn't try to re-litigate it:

- **Planning Center Services** ($15–$239/mo depending on user count, unlimited plans/features per tier) is excellent for worship planning, song libraries, auto-scheduling, and rehearsal tools, but it is a US-centric, per-seat-priced product where the church pays for capacity (team member count) it may not need, and it does not fit UK-specific patterns (e.g., CCLI reporting is US-oriented; no native GDPR/UK data residency framing).
- **iKnow Church** is UK-built, Church of England-partnered, and strong on Teams & Rotas, safeguarding, and GDPR — but it's a full ChMS (finance, child check-in, ticketing, life events diary) where the rota module is one of many, and the UI/workflow is optimized for a generalist church admin, not a worship team lead running a band rota week to week.
- **This app** exists to be the one thing done exactly right for Breathe Worship's workflow, at near-zero hosting cost, with the church owning the data and the code.

### 2.2 What "done well" means here, concretely

1. A worship team lead can build next Sunday's rota in under 5 minutes once availability is in.
2. A volunteer never has to ask "am I on this week?" — they know from a notification, not by checking a spreadsheet.
3. No one is double-booked across roles, and no one gets asked to serve every single week by accident (fairness is visible, not assumed).
4. The song set and running order for a service lives next to the rota, not in a separate WhatsApp message or PDF.
5. It works properly on a phone, because that's where volunteers will actually use it.

### 2.3 Competitor feature comparison

| Capability | Planning Center Services | iKnow Church (Teams & Rotas) | This app (v1) |
|---|---|---|---|
| Volunteer scheduling by team/role | Yes | Yes | Yes |
| Availability / blockout dates | Yes | Yes (holidays/unavailability) | Yes |
| Auto-fill scheduling suggestions (fairness, last-served, preference) | Yes | No (manual) | Yes (suggestion engine, human confirms) |
| Double-booking / clash detection across teams | Partial | Yes | Yes |
| Swap / find-a-substitute workflow | Partial (email leader) | No | Yes (in-app swap board) |
| Song library, keys, tags | Yes (extensive, CCLI/PraiseCharts integration) | No | Yes (v1: core fields; integrations phase 2) |
| Service order / run sheet | Yes | No | Yes |
| Mobile app | Native iOS/Android | Native iOS/Android | Installable mobile-first PWA (see §9.6) |
| Safeguarding / DBS tracking | No | Yes | Out of scope v1 (see §3, §5.3) |
| GDPR/UK data residency framing | Not primary market | Yes | Yes, by design (see §8.3) |
| Pricing model | Per total user count, $15–$239/mo | Per-church license/module | Near-zero (Supabase + Vercel free/hobby tiers, see §11) |
| Multi-ministry support | Yes | Yes | Architected for it, not built for it in v1 (see §3) |
| Serving-frequency preference (soft cap distinct from availability) feeding auto-scheduling | No (blockout dates only, not a "how often do you want to serve" cap) | No | Yes (§6.4 AVAIL-4, §6.5 SCHED-7) |
| Private, personal gamified serving stats/encouragement | No (admin-facing reporting only) | No | Yes, deliberately private/non-competitive (§6.11) |

Sources for competitor claims: [Planning Center Services](https://www.planningcenter.com/services), [iKnow Church — Teams and Rotas](https://iknowchurch.co.uk/teams-and-rotas).

## 3. Locked Decisions (not open for reinterpretation during build)

These were explicitly decided with the church before this PRD was finalized. If any other section of this document appears to contradict one of these, **this section wins**.

| # | Decision | Implication for the build |
|---|---|---|
| D1 | **Clean-slate rebuild.** Do not extend or fork the `ServiceWeaver`/`service-flow-tool` codebase. Write new code. | New repository, new project scaffold. The data model concepts (teams/roles separation, availability vs. assignment separation, soft-archive over hard-delete) are reused *as design patterns*, not as copied code. |
| D2 | **V1 scope is the Breathe Worship team only.** Other ministries are not built, configured, or exposed in the UI in v1. | Schema is team-and-role generic (a `teams` table, not a hardcoded "worship" concept) so a future phase can add a Welcome or AV team without a schema migration that breaks existing data. The UI, seed data, onboarding copy, and role list are 100% worship-specific for v1 — no "add a team" admin screen needs to ship in v1. |
| D3 | **No safeguarding/DBS module in v1.** | No child-protection-specific tables, fields, or screens are built. This is documented as a Phase 2 candidate in §5.3, not silently dropped — if the church later runs a Kids team through this tool, safeguarding becomes a hard requirement before that expansion, not optional. |
| D4 | **Minimal-cost hosting posture.** | Supabase free or Pro tier, Vercel or Netlify free/hobby tier, a cheap custom domain, free-tier transactional email (Resend or Supabase's built-in). No paid monitoring/SMS/error-tracking budget assumed by default — see §11 for the specific stack and §15 for the tradeoffs this creates. |

## 4. Users & Roles

| Role | Who this is | Core needs |
|---|---|---|
| **Volunteer** | Any Breathe Worship team member (musician, vocalist, sound/AV, slides operator) | See upcoming services, submit availability, see rota, get reminders, request a swap, view their own serving history |
| **Team Lead** (Worship Leader / rota coordinator) | One or more people who build the rota and plan services | Everything a Volunteer can do, plus: create services, build the rota, manage the song set/running order, approve swap requests, message the team |
| **Admin** | Matt / church staff overseeing the tool | Everything a Team Lead can do, plus: manage roles/teams config, manage volunteer accounts, view audit log and system health, manage admin access grants |
| **Guest/Unauthenticated** | No one, by design | The app is invite-only. There is no public sign-up. |

Note: a single person can hold multiple roles (e.g., the Worship Leader is also a vocalist and sees both the Team Lead and Volunteer views). Role is a permission level (`profiles.is_admin`, `team_membership.is_team_lead`), not a separate account type.

## 5. Scope

### 5.1 In scope — v1

- Invite-only authentication (email + password, magic link) via Supabase Auth
- Volunteer profile management
- Breathe Worship team, roles, and role-eligibility configuration (admin-editable, but seeded with real roles at launch — see §6.2)
- Recurring service templates (e.g., "Sunday 10:30am Service") and one-off/special services
- Availability collection per service (yes/no/maybe) and standing blockout dates
- Manual rota building with an auto-suggest engine (availability + fairness/recency + volunteer-stated serving-frequency preference aware — see SCHED-2, SCHED-7)
- Volunteer-set serving-frequency preferences (e.g., "available most weeks, only want to serve twice a month") that the engine treats as a soft cap, not a hard rule
- Private, personal serving stats and encouragement (streaks, milestones, reliability) — non-competitive by design, see §6.11
- Clash/double-booking detection
- Swap/substitution request workflow
- Song library and per-service song set with key, order, and notes
- Service running order / order of service builder
- Email notifications (assignment, reminder, swap request, swap resolved) — see §12
- Volunteer dashboard, Team Lead dashboard, Admin dashboard
- Reporting: serving frequency per volunteer, upcoming gaps, no-show/decline tracking
- Full mobile-responsive rendering, installable as a PWA
- Audit log of scheduling actions

### 5.2 Explicitly out of scope — v1

- Safeguarding/DBS tracking (D3)
- Multi-team/multi-ministry UI (D2) — schema supports it, UI does not expose it
- Giving/donations, check-in, room booking, finance, groups, life-events diary (all iKnow Church/Planning Center modules not relevant to this tool's job)
- Native iOS/Android apps (PWA only — see §9.6 for why this is sufficient)
- SMS notifications (email + push only; SMS is a paid add-on and contradicts D4 unless the church later opts in)
- CCLI/PraiseCharts/SongSelect API integrations (song library is self-managed text/link fields in v1; see §5.3)
- Multi-language/localization (English only, UK date/time formats)

### 5.3 Phased roadmap

| Phase | Trigger to start | Contents |
|---|---|---|
| **Phase 1 (this PRD)** | Now | Everything in §5.1 |
| **Phase 2** | Church decides to onboard a second ministry team, or wants Kids/child-facing scheduling | Multi-team UI, safeguarding/DBS tracking (mandatory before any Kids team goes live), team-specific role libraries |
| **Phase 3** | Volume/complexity justifies it | Song integrations (CCLI reporting, PraiseCharts/SongSelect import), SMS reminders, calendar sync (iCal feed per volunteer), native mobile wrapper if PWA install rates are low, and a revival of `church-scheduler-app`'s interactive volunteer↔team↔role network graph (originally built with Plotly/NetworkX) as an admin-facing visualization — useful for spotting over-relied-on volunteers or under-covered roles at a glance, not resurrected in v1 because it's a visualization layer on top of data the app doesn't have volume to make interesting yet |

## 6. Functional Requirements

Each requirement below has an ID (used in Appendix B's build-verification checklist) and an acceptance criterion. "Must" = build fails review without it. "Should" = expected in v1 but not a launch blocker if genuinely constrained on time.

### 6.1 Authentication & Account Management

| ID | Requirement | Acceptance criteria |
|---|---|---|
| AUTH-1 | Invite-only account creation. Admin creates a volunteer profile and sends an invite; no public sign-up form exists. | Attempting to reach a sign-up route with no invite token returns a "contact your team lead" message, not a working form. |
| AUTH-2 | Email + password login, with magic-link login as an alternative. | Both paths result in a valid Supabase session; wrong password shows a clear error without revealing whether the email exists. |
| AUTH-3 | Password reset via email. | Reset link expires after 1 hour; used links cannot be reused. |
| AUTH-4 | Session persistence across app restarts on mobile (PWA). | Closing and reopening the installed PWA does not require re-login within the Supabase session lifetime. |
| AUTH-5 | Admin can deactivate a volunteer without deleting their history. | Deactivated volunteer cannot log in; their past assignments and songs remain intact and visible in reports (soft-delete pattern, per D1's inherited principle). |

### 6.2 People, Teams & Roles

| ID | Requirement | Acceptance criteria |
|---|---|---|
| PPL-1 | Admin can create/edit/deactivate volunteer profiles: name, email, phone, notes. | Deactivation is a flag, never a row delete. |
| PPL-2 | Seed data: one team ("Breathe Worship") with roles: Worship Leader, Vocalist, Acoustic Guitar, Electric Guitar, Bass, Keys/Piano, Drums, Sound Engineer, ProPresenter/Slides, Livestream/Camera, Backing Vocals. | Roles list matches this exactly at first launch; admin can add/rename/deactivate roles after launch without a code change. |
| PPL-3 | A volunteer can be eligible for multiple roles, with a proficiency flag (trainee / competent / lead). | The rota builder (§6.5) only offers a volunteer for roles they are marked eligible for. |
| PPL-4 | Team Lead designation is per-team, not global admin. | A Team Lead who is not also an Admin cannot reach `/admin/*` routes. |

### 6.3 Services (Events) & Templates

| ID | Requirement | Acceptance criteria |
|---|---|---|
| SVC-1 | Admin/Team Lead can create a recurring service template (name, default time, recurrence pattern, default role requirements). | Creating a template does not itself create calendar events; it's a pattern to generate services from. |
| SVC-2 | Admin/Team Lead can generate services from a template for a date range, or create a one-off service. | Generated services inherit the template's role requirements, which can then be edited per-service without altering the template. |
| SVC-3 | A service has a status lifecycle: draft → availability open → scheduling open → published → completed (or cancelled at any point). | UI clearly shows current status; volunteers cannot submit availability on a draft service or see a rota before it's published. |
| SVC-4 | Services support `availability_locked` and `scheduling_locked` flags, and soft-archival (`archived_at`), never hard delete. | An archived service disappears from active lists but remains in history/reports. |

### 6.4 Availability

| ID | Requirement | Acceptance criteria |
|---|---|---|
| AVAIL-1 | Volunteer can respond Yes / No / Maybe to each open service, with an optional note. | Response is timestamped; volunteer can change their response until scheduling is locked for that service. |
| AVAIL-2 | Volunteer can set standing blockout dates (date range, or a recurring day-of-week pattern, e.g. "never available before 10am"). | Blockout dates automatically suppress that volunteer from availability requests and from the auto-suggest engine for overlapping services. |
| AVAIL-3 | Team Lead can see, at a glance, which volunteers have not yet responded to an open service. | A "pending responses" count/list is visible on the service's scheduling screen. |
| AVAIL-4 | Volunteer can set a serving-frequency preference independent of per-service availability (e.g., "available most Sundays, but only want to be scheduled twice a month"). | Preference is a soft cap: max N services per period (week/month), editable anytime by the volunteer, visible to Team Leads building the rota. Marking "Yes" available on a service never implies wanting to serve every time it's offered — availability and willingness-to-be-asked are stored as separate facts. |

### 6.5 Scheduling / Rota Building

| ID | Requirement | Acceptance criteria |
|---|---|---|
| SCHED-1 | Team Lead can manually assign a volunteer to a role slot on a service. | Only volunteers eligible for that role (§6.2 PPL-3) and marked "Yes" or "Maybe" available appear as assignable by default; assigning someone who said "No" or hasn't responded requires an explicit override click and is logged. |
| SCHED-2 | Auto-suggest engine proposes a full or partial rota for a service. | Suggestion logic considers: (a) marked availability, (b) recency of last serving in that role (fairness — prefer whoever served that role longest ago), (c) blockout dates, (d) does not suggest the same volunteer for two roles on the same service. Team Lead can accept, swap, or reject each suggestion individually — the engine never auto-publishes. |
| SCHED-3 | Clash detection: a volunteer cannot be assigned to two different services that overlap in time, and is flagged if assigned to two roles in the same service. | Attempting either shows a blocking warning before the assignment is saved. |
| SCHED-4 | Assignment has a response step: assigned volunteer must confirm or decline. | Declining requires a reason and immediately flags the slot as "needs substitute" and notifies the Team Lead. |
| SCHED-5 | Rota can be locked (`scheduling_locked`) to prevent further edits once published, with an explicit admin override to reopen. | Reopening a locked rota is logged in the audit trail with who/when/why. |
| SCHED-6 | Published rota is viewable read-only by the whole team (a "master schedule" view), not just those assigned. | Any active volunteer can see who's serving in every role for upcoming published services. |
| SCHED-7 | Auto-suggest engine treats each volunteer's stated serving-frequency preference (AVAIL-4) as a soft cap, ranking volunteers under their preferred frequency above volunteers who've already met or exceeded it for the rolling period. | A volunteer who marked "Yes" available but has already hit their stated max for the period is not suggested by default; a Team Lead can still assign them manually with a one-click, logged override — because availability and willingness-to-be-asked-more-than-usual are different facts, and this is a preference, not a hard block. |

### 6.6 Swap / Substitution Workflow

| ID | Requirement | Acceptance criteria |
|---|---|---|
| SWAP-1 | An assigned volunteer who can no longer serve can post their slot to a swap board rather than only messaging the Team Lead directly. | Posting a swap does not remove them from the slot until someone claims it and the Team Lead approves. |
| SWAP-2 | Any eligible volunteer can claim an open swap. | Claim is provisional until Team Lead approval (SWAP-3); double-claims are prevented by locking the swap the moment one claim is submitted. |
| SWAP-3 | Team Lead approves or rejects a claimed swap. | On approval, the assignment transfers and both parties are notified; on rejection, the swap reopens. |

### 6.7 Worship Planning (Songs & Service Order)

| ID | Requirement | Acceptance criteria |
|---|---|---|
| WOR-1 | Song library: title, artist, CCLI number (free text field, no live CCLI lookup in v1), default key, tempo, tags, link fields for chord chart/audio (external URLs — no file hosting requirement in v1). | Admin/Team Lead can add/edit/archive songs; archived songs remain attached to past services. |
| WOR-2 | Per-service song set: ordered list of songs with an optional key override and notes for that specific service. | Reordering is drag-and-drop or equivalent; changing the service's song key does not alter the song's library default key. |
| WOR-3 | Service running order / order of service: ordered list of items (song, sermon, announcement, communion, offering, custom item) with duration estimates and notes. | Team can view a single combined running order per service that interleaves songs with the rest of the service flow. |
| WOR-4 | Rota and song set are visible together on one service detail screen. | A volunteer opening a service sees who's serving and what's being played/run, not two disconnected views. |

### 6.8 Dashboards

| ID | Requirement | Acceptance criteria |
|---|---|---|
| DASH-1 | Volunteer dashboard: upcoming assignments, pending availability requests, serving history, notification list. | Loads in under 2 seconds on a mid-range mobile connection (see §8.1). |
| DASH-2 | Team Lead dashboard: services needing availability chased, services needing scheduling, open swap requests, quick rota-builder access. | Surfaces action items first (what needs attention), not just a calendar. |
| DASH-3 | Admin dashboard: volunteer roster health (inactive/unresponsive members), system checks (failed notifications, orphaned records), audit log viewer. | Accessible only to `is_admin = true` profiles, enforced at both route-guard and RLS level (see §8.3). |

### 6.9 Reporting & Fairness

| ID | Requirement | Acceptance criteria |
|---|---|---|
| REP-1 | Serving frequency report: how often each volunteer has served, by role, over a selectable date range. | Exportable as CSV. |
| REP-2 | "At risk of burnout" flag: volunteers serving above a configurable frequency threshold in a rolling period. | Threshold is admin-configurable, defaults to "more than 3 out of the last 4 services." |
| REP-3 | Decline/no-show tracking per volunteer. | Visible to Team Lead/Admin only, not to other volunteers. |

### 6.10 Notifications

See §12 for full notification matrix. Functionally: every state change that affects a volunteer (assigned, reminder, swap request affecting them, swap resolved, service cancelled) must generate a notification; none of this is achieved by the volunteer having to check the app proactively.

### 6.11 Serving Stats & Encouragement

Neither Planning Center nor iKnow Church does this well — Planning Center's stats are admin-facing reporting; iKnow Church has none. This is deliberately designed as a **private, personal, non-competitive** feature, for a reason worth stating plainly: a public "who served the most" leaderboard in a church context rewards over-serving, which directly fights the REP-2 burnout flag, and it risks making people who serve less — for entirely legitimate reasons, a new baby, work, caregiving, or simply a stated preference of "twice a month" — feel visibly judged against their team. The module below is built to encourage consistency and say thank you, not to rank people against each other.

| ID | Requirement | Acceptance criteria |
|---|---|---|
| STAT-1 | Each volunteer has a personal, private stats view: services served this month/quarter/year, current serving streak (consecutive confirmed services without a late decline/no-show), and a reliability indicator (confirmed-and-fulfilled vs. declined-late/no-show ratio). | Visible only to the volunteer themselves, and to Team Leads/Admins for pastoral-care purposes (DASH-2/DASH-3) — never surfaced as a cross-volunteer leaderboard or ranked list anywhere in the app. |
| STAT-2 | Stats are framed against the volunteer's own stated preference (AVAIL-4), not against other volunteers. | E.g., "You've served 2 of the 2 times you wanted to this month — thank you." A volunteer who prefers to serve less often is never shown a comparison implying they're doing less than someone else. |
| STAT-3 | Milestone recognition (e.g., 10th service, 50th service, 1-year serving anniversary) triggers a private, encouraging in-app moment — a message plus a tasteful, brief celebratory micro-animation — visible only to that volunteer. | Milestone thresholds and message copy are admin-editable via the `encouragement_messages` table (§7.2), so the church writes its own voice instead of generic auto-text. |
| STAT-4 | When a volunteer reaches or exceeds their stated preferred frequency for the period, the encouraging copy explicitly gives permission to rest rather than nudging them to serve more. | This is the feature's one hard rule: gamification here must never push a volunteer past their own stated cap. Tone like "You've hit what you wanted to serve this month — enjoy being in the congregation this week" is intended; a "keep your streak alive" push notification is exactly what this must not become (see §15 risk on gamification vs. burnout). |

## 7. Data Model

### 7.1 Entity overview

```
profiles ──< team_memberships >── teams ──< roles >── role_eligibility >── profiles
profiles ──< availability_responses >── services >── service_role_requirements >── roles
profiles ──< assignments >── services, roles
profiles ──< blockout_dates
profiles ──< serving_preferences (per profile, optionally scoped per team)
encouragement_messages (admin-managed message bank; read by computed stats logic, not FK'd to profiles)
services ──< service_templates (nullable origin)
services ──< service_songs >── songs
services ──< service_order_items
assignments ──< swap_requests
profiles ──< notifications
(all mutating actions) ──> audit_log
```

### 7.2 Schema (PostgreSQL / Supabase)

```sql
-- Profiles: one row per Supabase Auth user
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
  team_id uuid references teams(id) on delete cascade, -- null = applies across every team the volunteer serves on
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
  recurring_day_of_week int, -- 0=Sunday..6=Saturday, null if not recurring
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
  threshold int, -- e.g. 10 (services served), null for hit_preferred_frequency
  message_template text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Note: STAT-1's actual numbers (services served this period, streak length, reliability ratio)
-- are computed on the fly from `assignments` at read time, not stored in a stats table.
-- This is deliberate: a cached stats table can drift from the source of truth; a computed
-- view/RPC cannot.

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
```

### 7.3 Database functions (used by RLS policies)

```sql
create or replace function is_admin(uid uuid) returns boolean as $$
  select coalesce((select is_admin from profiles where id = uid), false);
$$ language sql stable security definer;

create or replace function is_team_lead(uid uuid, p_team_id uuid) returns boolean as $$
  select exists (
    select 1 from team_memberships
    where profile_id = uid and team_id = p_team_id and is_team_lead = true and is_active = true
  );
$$ language sql stable security definer;

create or replace function is_assigned_to_service(uid uuid, p_service_id uuid) returns boolean as $$
  select exists (
    select 1 from assignments where profile_id = uid and service_id = p_service_id
  );
$$ language sql stable security definer;
```

### 7.4 Design principles carried into this schema (inherited from prior attempts, per §0)

1. **Never hard-delete operational records.** Every entity that matters for history (profiles, services, songs, assignments) uses `is_active`/`archived_at` flags, not row deletion.
2. **Team membership, role eligibility, availability, and assignment are four separate concerns** — never collapse them into one table, even though v1 only has one team. This is the single most important structural decision inherited from ServiceWeaver, and the one most likely to be "simplified away" incorrectly under time pressure. Don't.
3. **Every mutating admin/scheduling action writes to `audit_log`.** This is not optional instrumentation — it's how a Team Lead accusation ("who moved me off this week?") gets answered without guessing.
4. **Serving preferences are a soft cap, never a hard block.** The auto-suggest engine (SCHED-7) treats `serving_preferences.max_services_per_period` as a ranking signal, not a constraint that prevents a Team Lead from manually assigning someone willing to help in a genuine gap. Availability (a fact) and preference (a wish) are different data, stored in different tables, and must never be collapsed into one field.

## 8. Non-Functional Requirements

### 8.1 Performance

- Initial load (cold, mobile 4G): under 3 seconds to interactive.
- Dashboard/rota views: under 2 seconds after auth.
- No N+1 query patterns for rota building — role requirements, eligible volunteers, and availability for a service must be fetched in a bounded number of queries (target: ≤3 round trips to render the rota builder for one service).

### 8.2 Mobile Rendering

- Mobile-first responsive design; every screen must be fully usable at 360px width before being polished for tablet/desktop.
- Installable as a Progressive Web App (manifest + service worker) so volunteers can add it to their home screen and get an app-like experience without an App Store submission.
- Touch targets minimum 44x44px; no hover-only interactions (no functionality may be inaccessible without a mouse).
- Tested against: iOS Safari (last 2 major versions), Android Chrome (last 2 major versions), desktop Chrome/Safari/Edge/Firefox (last 2 versions).

### 8.3 Security & Privacy (UK GDPR context)

- **Row Level Security (RLS) is the actual security boundary, not the frontend.** Every table above must have RLS enabled with policies before any data is exposed. Frontend route guards (`ProtectedRoute`, `adminOnly`) are a UX layer only, per the principle inherited from ServiceWeaver — this is explicitly reiterated because it's the exact kind of shortcut a fast one-pass build is tempted to skip.
- Representative policy pattern (repeat per table, adapted to that table's ownership model):

```sql
alter table assignments enable row level security;

create policy "volunteers see their own assignments"
  on assignments for select
  using (profile_id = auth.uid());

create policy "team leads see all assignments for their team's services"
  on assignments for select
  using (
    exists (
      select 1 from services s
      where s.id = assignments.service_id
        and is_team_lead(auth.uid(), s.team_id)
    )
  );

create policy "admins see everything"
  on assignments for all
  using (is_admin(auth.uid()));

create policy "team leads manage assignments for their team"
  on assignments for insert with check (
    exists (select 1 from services s where s.id = service_id and is_team_lead(auth.uid(), s.team_id))
  );
```

- Data minimization: only collect what's needed to run a rota (name, contact, role eligibility, availability). No collection of protected-characteristic data, no safeguarding data (per D3).
- Encryption in transit (TLS, enforced by Supabase/Vercel by default) and at rest (Supabase default encryption).
- Password policy: minimum 10 characters, Supabase Auth defaults otherwise; no custom weakening of Supabase's defaults.
- UK data subject rights: the app must support (a) exporting a volunteer's own data on request (admin-triggered CSV export scoped to one profile), (b) permanently erasing a profile's personal fields on request while preserving anonymized historical scheduling records (replace name with "Former volunteer" rather than cascading delete, to preserve rota history integrity) — this is a **must-have**, not a nice-to-have, because it's a legal obligation, not a feature.
- No third-party analytics/tracking scripts by default. If analytics are added later, it must be privacy-respecting (e.g., Plausible) and disclosed in a privacy policy.
- A basic privacy policy and data retention statement must ship with the app (plain-language page, linked from login/footer) — starting template provided in Appendix C; final wording to be reviewed with the church before launch.

### 8.4 Accessibility

- Target WCAG 2.1 AA: sufficient color contrast, semantic HTML, keyboard navigability, screen-reader-friendly labels on all interactive elements (this matters concretely here — volunteer rosters skew across a wide age range).

### 8.5 Reliability

- Target uptime: best-effort on free/hobby hosting tiers (no formal SLA at D4's cost posture) — but the build must fail gracefully: if a notification send fails, the in-app notification/assignment still succeeds and the failure is logged for admin visibility (§6.8 DASH-3), not silently dropped and not blocking the core action.
- Database backups: rely on Supabase's automatic backups at whatever tier is selected; document the restore process in the deployment runbook (§14).

## 9. Technical Architecture

### 9.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React 18 + TypeScript, built with Vite | Fast dev loop, matches the proven prior stack's strengths without reusing its code |
| Styling/UI | Tailwind CSS + shadcn/ui (Radix primitives) | Accessible-by-default components, fast to theme for branding (§10) |
| Routing | React Router | Standard, matches route map in Appendix B |
| Server state | TanStack Query | Caching/invalidation for Supabase queries |
| Backend | Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime optional) | Matches D4's cost posture; RLS gives a real security boundary without a hand-rolled API layer |
| Business logic requiring elevation (e.g., auto-suggest engine, notification dispatch) | Supabase Edge Functions (Deno/TypeScript) | Keeps privileged logic server-side, not trusted to the client |
| Email | Resend or Supabase's built-in SMTP relay | Free-tier friendly, transactional-email reliable |
| Push notifications | Web Push API (via service worker) | No native app store dependency, fits PWA approach |
| Hosting (frontend) | Vercel or Netlify, free/hobby tier | Zero-cost static+edge hosting with preview deployments per PR |
| Testing | Vitest (unit), Playwright (e2e) | Matches prior stack's testing tool choice where sensible |
| Micro-interactions | `canvas-confetti` (or a CSS-only equivalent) for milestone celebrations (STAT-3) | Lightweight, no heavy animation framework required; must be used sparingly per §10.3, not on every action |

### 9.2 High-level architecture

```
[Volunteer / Team Lead / Admin browser or installed PWA]
              │  HTTPS
              ▼
   [Vercel/Netlify static hosting: React SPA]
              │  supabase-js client (RLS-scoped)
              ▼
   [Supabase: Postgres + Auth + Storage + Edge Functions]
              │
       ┌──────┴───────┐
       ▼              ▼
 [Resend/SMTP]   [Web Push service]
   (emails)     (browser notifications)
```

There is no separate custom backend server. All business rules that must not be trusted to the client (auto-suggest scheduling logic, notification fan-out, swap approval side-effects) live in Supabase Edge Functions or RLS-guarded RPC functions — never in frontend-only logic that merely hides a button.

### 9.3 Repository structure

Ownership tags below (`Agent N`) map to the multi-agent roster in §18.3 — see that section before assuming any folder is unowned or shared.

```
.
├── src/
│   ├── components/         # shared UI (shadcn/ui-based)          — Agent 2 (tokens/theming) + shared
│   ├── features/
│   │   ├── availability/                                          — Agent 4
│   │   ├── scheduling/                                            — Agent 4
│   │   ├── worship-planning/                                      — Agent 5
│   │   ├── swaps/                                                 — Agent 4
│   │   └── admin/                                                 — Agent 3 (people/roles) + Agent 5 (rest)
│   ├── hooks/                                                     — owned by whichever feature agent introduces it
│   ├── lib/
│   │   ├── supabase/       # client + generated types              — Agent 1 (generated types are a contract, §18.2)
│   │   └── scheduling-engine/  # auto-suggest logic, pure, unit-testable — Agent 1
│   ├── pages/                                                      — split per route owner, Agents 3/4/5
│   └── context/            # auth/session context                  — Agent 3
├── supabase/
│   ├── migrations/         # SQL migrations, source of truth for schema — Agent 1 ONLY, no exceptions
│   └── functions/          # Edge Functions                        — Agent 1
├── public/                 # PWA manifest, icons, service worker   — Agent 2
├── e2e/                    # Playwright tests                      — Agent 6
└── README.md
```

### 9.4 Environments

| Environment | Purpose | Supabase project | Hosting |
|---|---|---|---|
| Local | Development | Local Supabase (CLI) or a dedicated dev project | `npm run dev` |
| Staging | Pre-release verification | Separate Supabase project (free tier) | Vercel/Netlify preview or staging branch deploy |
| Production | Live church use | Production Supabase project | Vercel/Netlify production deploy, custom domain |

Secrets (Supabase URL/anon key, Resend API key) are environment variables, never committed. `.env` files are gitignored; `.env.example` documents required keys.

### 9.5 Data migrations

Schema changes are managed exclusively through Supabase CLI migrations checked into `supabase/migrations/`. No manual schema edits via the Supabase dashboard in any environment beyond local experimentation — production schema state must always be reproducible from the migration history.

### 9.6 Why PWA instead of native apps

Given D4 (minimal cost) and D2 (single-team v1), native app store distribution (Apple/Google developer accounts, review cycles, per-platform codebases) is disproportionate cost for a single-church tool with a volunteer base in the tens to low hundreds. A well-built installable PWA gets home-screen presence, offline-tolerant shell loading, and push notifications without that overhead. Revisit only if Phase 3 justifies it (§5.3).

## 10. Design System & Branding

### 10.0 Why this section is more prescriptive than a typical PRD

Two prior attempts at this app exist, and by your own assessment neither one looked or felt right. [Certain] A PRD can force a high floor — accessible, consistent, on-brand — but it cannot by itself guarantee the ceiling of "designed by a top-tier design artist," because that's a craft outcome, not a checklist outcome. The honest fix isn't more adjectives in this document; it's the mandatory human design sign-off gate in §10.5. Everything below is the brief that gate should be checked against — if the finished screens don't match this section's intent, that's a failed gate, not an acceptable interpretation of it.

### 10.1 Reference bar

The quality bar is not "a nice church app" — it's the bar set by products where visual craft *is* the product: **Strava** (the personal stats/streak screens in §6.11 should feel like this — confident data visualization, generous whitespace, a sense of personal achievement without gamified noise or leaderboards), **Things 3** (calm, restrained, obsessively consistent spacing and iconography), **Linear** (typography-led hierarchy, one confident accent color, dark mode as a first-class citizen rather than an inverted afterthought), and **Cash App** (bold but controlled color and type scale on a fundamentally simple, utilitarian task). None of these are church software, deliberately — Planning Center's and iKnow Church's own visual design is not the standard to match or beat here; a consumer-app bar is.

### 10.2 Brand foundation

- The canonical marks are the existing logo files in the connected asset folder (`Breathe Worship All Black.png`, `Breathe Worship All White.png`, `Breathe Worship Black Colour.png`/`Cropped`, `Breathe Worship White Colour.png`) — no new logo is designed.
- The exact color palette must be extracted directly from the colour logo files (real hex values pulled from the asset, not estimated) as the first step of the design pass, before any screen is styled. This PRD deliberately does not invent a placeholder palette — a wrong guess baked into components is far harder to unwind later than an open item now (§15).
- Typography: pair one distinctive, characterful display typeface for headings and hero/celebration moments (something with real personality, not a default system font) with one clean, highly legible humanist sans for body text and data-dense UI (rota tables, forms). This two-font pairing is what separates "designed" from "default Tailwind starter" — a single generic sans-serif everywhere is the single fastest way to fail this section's intent.
- Dark mode is a first-class target from day one, not a toggle bolted on later — the brand's own black-background logo variant confirms the church already thinks in both light and dark contexts. Build both palettes together rather than algorithmically inverting a light theme.

### 10.3 Interaction and motion

- Micro-interactions carry real weight in an app used weekly by the same volunteers: a satisfying confirm action when accepting an assignment, a genuinely warm (not garish) celebratory moment on a serving milestone (STAT-3, via `canvas-confetti` or equivalent, used sparingly), a smooth, purposeful transition when the rota builder fills a slot.
- No motion may block or delay a user completing a task. Delight is additive, never a tax on speed — this matters especially on the mobile availability-response flow, which volunteers will use the most and want to finish in seconds.
- Empty, loading, and error states are designed screens with their own copy (and illustration where it earns its place), not a spinner over a blank div. A brand-new volunteer's first "no upcoming services yet" screen is a first-impression moment, not an edge case to skip.

### 10.4 Imagery and personality

- Use real photography of the actual Breathe Worship team and Breathe New Life Church's own space wherever imagery is needed (login screen, empty states, milestone moments) — not generic stock worship-band photography. This is one specific church's tool; it should look like it belongs to them, not like an unmodified template.
- One consistent icon set (e.g., Lucide, already available in the stack), restyled to the extracted accent palette — never mixed icon styles or stroke weights across screens.

### 10.5 Design Process & Sign-off Gate (mandatory)

Because "beautiful" can't be fully specified in prose, the build process must include a checkpoint this document alone can't replace:

1. Before any production screen is coded, a **high-fidelity mockup pass** (Figma or equivalent) covering all 8 key screens below must be produced and presented to the church for explicit sign-off.
2. That pass must apply the extracted brand palette (§10.2), the chosen typography pairing, and at least one fully designed empty/loading/error state per key screen — not wireframes, not placeholder text in a default shadcn theme.
3. Build does not proceed past this gate without an explicit "yes, this looks right" from the church. A rushed approval under time pressure defeats the point of having the gate at all — treat it as a real checkpoint.

**Key screens requiring sign-off:**
1. Login / magic-link request
2. Volunteer dashboard (upcoming assignments, pending availability, notifications, personal stats widget per §6.11)
3. Availability response screen (per service, Yes/No/Maybe + note)
4. Service detail (rota + song set + running order combined, per WOR-4)
5. Rota builder (Team Lead view — role slots, eligible volunteer picker, auto-suggest panel)
6. Swap board (open swaps, claim action)
7. Song library (list, add/edit, tags/filter)
8. Personal stats screen (streaks, milestones, reliability — the Strava-reference screen, §6.11)

### 10.6 Component system

Tailwind + shadcn/ui (Radix primitives) remains the technical foundation for accessibility and build speed, but it must be themed aggressively enough — custom color tokens, custom type scale, custom spacing rhythm, restyled component variants — that it does not read as "default shadcn." A reviewer familiar with shadcn's out-of-the-box look should not be able to recognize it as such in the finished app.

## 11. Cost & Hosting Plan (per D4)

| Service | Tier | Approx. cost |
|---|---|---|
| Supabase | Free tier initially; upgrade to Pro ($25/mo) only if free-tier limits (500MB DB, 50k monthly active users, 7-day log retention) are hit | £0–£20/mo |
| Vercel or Netlify | Free/Hobby tier | £0 |
| Domain | Standard `.church` or `.co.uk` registration | ~£10–15/yr |
| Email (Resend) | Free tier (3,000 emails/mo) | £0 |
| **Total estimated** | | **Effectively £0–20/month**, plus domain renewal |

This must be revisited if volunteer count or notification volume grows meaningfully beyond a single-team, single-church deployment — flagged in §15.

## 12. Notifications Matrix

| Trigger | Recipient | Channel | Timing |
|---|---|---|---|
| Availability request opened for a service | All eligible volunteers for that service's roles | Email + in-app | Immediately on service status → `availability_open` |
| Assignment made | Assigned volunteer | Email + push + in-app | Immediately |
| Assignment reminder | Assigned, confirmed volunteers | Email + push | Configurable, default 3 days before service (`notification_preferences.reminder_days_before`) |
| Volunteer declines an assignment | Team Lead(s) for that team | Email + in-app | Immediately |
| Swap request opened | All eligible volunteers for that role | In-app (+ optional email digest) | Immediately |
| Swap claimed | Original requester + Team Lead | In-app + email | Immediately |
| Swap approved/rejected | Both parties in the swap | Email + push + in-app | Immediately |
| Service cancelled | All assigned volunteers | Email + push + in-app | Immediately |
| Admin access requested | Existing admins | Email + in-app | Immediately |

## 13. Testing & QA Strategy

- **Unit tests (Vitest)**: scheduling-engine logic (§9.3 `lib/scheduling-engine`) must be pure, testable functions — fairness scoring, clash detection, and auto-suggest ranking each need dedicated unit tests with fixed fixtures (this is the highest-risk logic in the app; it must not be tested only manually).
- **RLS policy tests**: for every table, a test verifying (a) a volunteer cannot read/write another volunteer's restricted data, (b) a non-admin cannot reach admin-only rows, (c) an admin can. Use Supabase's local testing tools or a scripted set of authenticated Postgres queries.
- **E2E tests (Playwright)**: the critical path — login → respond to availability → Team Lead builds rota → volunteer receives assignment → volunteer requests swap → another volunteer claims it → Team Lead approves.
- **Manual QA script** (run before every production deploy):
  1. Log in as admin, create a team member.
  2. Assign role eligibility to that member.
  3. Create a service from the Sunday template.
  4. Submit availability as that volunteer.
  5. Build the rota as Team Lead, confirm auto-suggest respects eligibility and fairness.
  6. Publish the rota; confirm the volunteer receives a notification.
  7. As the volunteer, decline the assignment; confirm the Team Lead is notified and the slot shows "needs substitute."
  8. Post the vacated slot as a swap; claim it as a different eligible volunteer; approve as Team Lead.
  9. Add a song to the library; add it to the service's song set with a key override.
  10. View the combined service detail screen and confirm rota + song set + running order all display correctly.
  11. Check the master schedule view as a non-assigned volunteer — confirm read access, confirm no admin controls are visible.
  12. Confirm mobile rendering of all of the above on a 360px viewport.

## 14. Deployment & DevOps

- **CI**: on every pull request, run lint, unit tests, and a production build. Block merge on failure.
- **CD**: merges to `main` deploy automatically to staging; production deploy is a manual promotion step (not fully automatic), given this is a small church tool where a human should confirm before affecting live Sunday scheduling.
- **Rollback plan**: hosting platform's built-in instant rollback to the previous deployment; database migrations must be written to be forward-compatible/reversible where feasible (avoid destructive migrations without a documented manual rollback path).
- **Runbook**: a short `DEPLOYMENT.md` documenting how to restore from a Supabase backup, how to rotate the Supabase service key, and who holds admin access to hosting/domain/Supabase accounts (single point of failure risk — see §15).

## 15. Risks & Assumptions

| Risk/Assumption | Notes |
|---|---|
| Exact brand colors/typography not extracted programmatically in this PRD | Must be pulled from the logo files in the connected asset folder during implementation, not guessed (§10). |
| No safeguarding module in v1 | Acceptable only because v1 is Worship-only, which does not involve unsupervised contact with children. This must be revisited before any Kids/youth team is added (D3, §5.3). |
| Single admin/owner risk | If Matt is the sole admin/account holder for Supabase, Vercel, and the domain, that's a single point of failure for the church's own tool. Recommend at least one second trusted admin account on each service. |
| Free-tier hosting limits | Supabase free tier pauses inactive projects after a period of no traffic; this needs monitoring or a low-cost keep-alive/upgrade plan once live. |
| Auto-suggest fairness algorithm is a first version, not a solved optimization problem | It should be simple, explainable, and overridable by a human — not a black box. Team Lead always has final say (per SCHED-2). |
| No CCLI/PraiseCharts integration in v1 | Song licensing reporting remains a manual process outside this app for now (Phase 3 candidate). |
| Data migration from any existing spreadsheet/iKnow Church rota data | Not addressed in this PRD because no export was provided. If historical data needs importing, scope a one-off migration script separately before launch. |
| Gamification could conflict with burnout prevention if built carelessly | STAT-4 makes this explicit: the encouragement system must never push a volunteer past their own stated preference. If a future contributor adds a public leaderboard or streak-pressure notifications ("don't break your streak!"), that directly contradicts REP-2 and §6.11's design intent — treat any such addition as a regression, not a feature request. |
| "Beautiful, top-tier" visual design is a craft outcome a written spec can constrain but not guarantee | Mitigated by the mandatory design sign-off gate (§10.5). If that gate is skipped or rushed under time pressure, the exact visual-quality risk this section exists to address comes right back. |

## 16. Success Metrics

- Time for a Team Lead to build a complete, published rota for one service: target under 5 minutes once availability responses are in.
- Percentage of volunteers who respond to an availability request without a manual follow-up message: target 80%+ within 5 days of the request going out.
- Number of unfilled required role slots at service time: target zero for required roles, with swap workflow resolving gaps before the service date in the vast majority of cases.
- Volunteer-reported clarity ("I always know if I'm serving") — qualitative check-in after 4–6 weeks of live use.
- Volunteers report the app "feels good to use, not just functional" in that same check-in — a direct test of whether §10's design bar was actually met, not just specified.
- No volunteer's stated serving preference is silently overridden by the auto-suggest engine — spot-checked against `audit_log` in the first month of live scheduling; every override should be a deliberate, logged Team Lead action (SCHED-7).

## 17. Glossary

| Term | Meaning |
|---|---|
| Service | A single church gathering/event the team schedules for (e.g., a specific Sunday) |
| Template | A reusable pattern used to generate recurring services |
| Role | A specific serving function within a team (e.g., Sound Engineer) |
| Assignment | A specific volunteer scheduled into a specific role for a specific service |
| Rota | The published set of assignments for a service (UK term; equivalent to "schedule") |
| Swap | The process of transferring an assignment from one volunteer to another |
| RLS | Row Level Security — Postgres/Supabase's mechanism for enforcing data access rules at the database layer |

## 18. Multi-Agent Execution Plan

### 18.1 Why this section exists

Everything in §§6–14 assumes a build order but doesn't assign ownership. A single agent building serially can hold the whole schema in its head and avoid self-conflicts; several agents working in parallel can't rely on that — they need hard boundaries and shared contracts they read, not each other's in-progress reasoning. This section turns the functional requirements into an assignable, parallelizable work breakdown. [Likely] The agent count below (6) matches this app's actual structural seams — already visible in §9.3's feature folders — not an arbitrary headcount. Collapse agents if fewer are available (§18.3 has the safe collapse order); don't add more without a matching structural seam, or coordination overhead will exceed the benefit of parallelizing an app this size.

### 18.2 Non-negotiable rule: contracts before parallel work

No frontend or QA agent should start feature work against a schema, RPC signature, or design token that hasn't been committed yet. The sequence is: **lock the contract → commit it as a file → only then parallelize.** A backend agent silently renaming a column another agent is already querying is the single most likely failure mode in a multi-agent build — more likely than any individual agent misreading a requirement in this document.

The three contract artifacts, and where each comes from:

| Contract | Produced by | Consumed by | Format |
|---|---|---|---|
| Database schema & RLS policies | Agent 1 (Backend) | All frontend agents, QA agent | `supabase/migrations/*.sql` (§7.2) + generated `src/lib/supabase/database.types.ts` (via `supabase gen types typescript`) |
| Design tokens & component theme | Agent 2 (Design) | All frontend agents | `tailwind.config.ts` theme extension + a committed `design-tokens.json` (colors, type scale, spacing) extracted per §10.2 |
| RPC / Edge Function signatures (interfaces only, not full implementation) | Agent 1 (Backend) | All frontend agents, QA agent | TypeScript interface stubs in `src/lib/scheduling-engine/types.ts` and `supabase/functions/*/types.ts`, committed before the function bodies are finished |

### 18.3 Agent roster

| Agent | Owns (PRD sections) | Owns (repo paths, §9.3) | Depends on | Produces |
|---|---|---|---|---|
| **1. Backend & Schema** | §7 (Data Model), §7.3 (functions), the business logic behind SCHED-2/SCHED-7/STAT-1–4 | `supabase/migrations/`, `supabase/functions/`, `src/lib/scheduling-engine/`, `src/lib/supabase/` | Nothing — goes first | The two machine-readable contracts above |
| **2. Design System** | §10 (all subsections) | `tailwind.config.ts`, `design-tokens.json`, Figma file (external) | Brand logo files (already available) | Extracted palette/type scale, high-fidelity mockups for the 8 key screens, the §10.5 sign-off approval |
| **3. Frontend — Core & People** | §6.1 (Auth), §6.2 (People/Teams/Roles), §6.8 (Dashboard shell), §6.11 (Stats UI) | `src/context/`, dashboard shell in `src/pages/`, `src/features/admin/` (people/roles parts) | Agent 1's contracts, Agent 2's tokens | Login, profile, dashboard shell, personal stats screen |
| **4. Frontend — Scheduling & Availability** | §6.3 (Services/Templates), §6.4 (Availability), §6.5 (Scheduling), §6.6 (Swaps) | `src/features/availability/`, `src/features/scheduling/`, `src/features/swaps/` | Agent 1's contracts, Agent 2's tokens | Availability response flow, rota builder, master schedule, swap board |
| **5. Frontend — Worship & Admin** | §6.7 (Songs/Service Order), remaining §6.2/§6.9 admin screens | `src/features/worship-planning/`, `src/features/admin/` (remaining) | Agent 1's contracts, Agent 2's tokens | Song library, service order builder, admin reports/audit log |
| **6. QA & DevOps** | §13 (Testing), §14 (Deployment) | `e2e/`, CI config, `supabase/` env setup, hosting config | Agent 1's contracts (test scaffolding can start against contracts before implementation exists) | RLS policy tests, scheduling-engine unit tests, Playwright suite, CI/CD pipeline, staging/production environments |

If fewer than six agents are available, collapse in this order without breaking the contract boundary: merge Agents 4+5 first (both are "frontend feature" work once contracts exist), then fold Agent 3 into that, then fold Agent 6's DevOps half into whichever agent is least loaded. **Never merge Agent 1 or Agent 2 into a frontend agent** — the contract producers must stay separate from the contract consumers even in a two- or three-agent team, or §18.2's rule has no one enforcing it.

### 18.4 Build sequence

```
Phase 0 (serial — blocks everything else)
  Agent 1: finalize + migrate schema, commit generated types
  Agent 2: extract palette from logo files, commit design tokens
                              │
                              ▼
Phase 1 (parallel — all agents work simultaneously against committed contracts)
  Agent 1: implement Edge Function / RPC logic behind the stub signatures
  Agent 2: produce high-fidelity mockups for all 8 key screens (§10.5)
  Agents 3, 4, 5: build frontend features against contracts + tokens
  Agent 6: write RLS policy tests and unit tests against the schema/signatures
                              │
                              ▼
Phase 2 (gate — human, not an agent)
  Design sign-off (§10.5): the church approves Agent 2's mockups.
  Structural frontend work in Phase 1 does not wait on this gate; final visual
  polish does — so no agent burns time refining pixels against an unapproved design.
                              │
                              ▼
Phase 3 (integration)
  Agent 6 or the orchestrator: merge all feature branches, run full CI,
  run the manual QA script (§13), run the Appendix B checklist end to end
                              │
                              ▼
Phase 4 (ship)
  Agent 6: deploy to staging, then production, per §14
```

### 18.5 Coordination rules

1. **No agent edits another agent's owned paths.** If Agent 4 needs a schema change, it requests it from Agent 1 rather than editing a migration file directly — Agent 1 is the only writer of `supabase/migrations/`.
2. **Contract changes after Phase 0 require a version bump and a broadcast, not a silent edit.** If the schema must change once Phase 1 has started, Agent 1 commits a new migration, regenerates types, and every consuming agent is responsible for pulling the update before continuing. This PRD's requirement IDs (`AUTH-1`, `SCHED-7`, etc.) are the shared vocabulary for describing what changed and why, so a change can be communicated as "SCHED-7's cap logic moved from `assignments` to a new `serving_preferences.max_services_per_period` join" rather than a vague "I changed the schema a bit."
3. **A human orchestrator (recommend Matt, not an agent) owns final merges and the two gates that aren't agent-decidable**: the design sign-off (§10.5) and the go/no-go before production deploy (§14). Multi-agent parallelism speeds up building; it should not speed past the two checkpoints that need human judgment.
4. **Every agent's definition of done is Appendix B, not its own judgment of completeness.** An agent that believes its feature is finished but hasn't checked its relevant Appendix B line items is not finished.

## Appendix A: Route Map

| Route | Access | Purpose |
|---|---|---|
| `/login` | Public | Auth entry |
| `/` | Authenticated | Volunteer dashboard |
| `/availability` | Authenticated | Respond to open availability requests |
| `/services/:id` | Authenticated (scoped by RLS) | Combined service detail: rota + songs + running order |
| `/schedule` | Authenticated | Read-only master schedule |
| `/swaps` | Authenticated | Swap board |
| `/profile/preferences` | Authenticated | Volunteer sets their own serving-frequency preference (AVAIL-4) |
| `/stats` | Authenticated | Personal serving stats & milestones (§6.11) — private to the logged-in volunteer, never exposes another volunteer's data |
| `/team-lead` | Team Lead | Team Lead dashboard |
| `/team-lead/services/:id/build` | Team Lead | Rota builder for a service |
| `/team-lead/songs` | Team Lead | Song library management |
| `/admin` | Admin | Admin dashboard |
| `/admin/people` | Admin | Volunteer management |
| `/admin/roles` | Admin | Role management within the Breathe Worship team (add/rename/deactivate roles per PPL-2) — **not** a "create a new team" screen; that is Phase 2 (D2) |
| `/admin/templates` | Admin | Service templates |
| `/admin/services` | Admin | All services, including drafts/archived |
| `/admin/reports` | Admin | Reporting & fairness views |
| `/admin/audit-log` | Admin | Audit log viewer |
| `/admin/access-requests` | Admin | Grant/deny admin access requests |

## Appendix B: Build Verification Checklist (for Fable 5 self-check before calling this "done")

- [ ] Every requirement ID in §6 has a corresponding, testable implementation
- [ ] Every table in §7.2 has RLS enabled with at least the policies described in §8.3's pattern
- [ ] No functional path relies on frontend logic alone to enforce access control
- [ ] The manual QA script in §13 passes end to end
- [ ] The app is fully usable at 360px viewport width for every route in Appendix A
- [ ] PWA manifest and service worker are present and the app is installable
- [ ] `.env.example` documents all required environment variables; no secrets are committed
- [ ] A working data export and a working data erasure path exist for a single volunteer profile (§8.3)
- [ ] Brand logos from the reference asset folder are integrated into the login screen, header, and PWA icon set
- [ ] D1–D4 (§3) are reflected exactly as written — no multi-team UI shipped, no safeguarding module shipped, no paid infrastructure defaulted-to
- [ ] Auto-suggest engine demonstrably deprioritizes volunteers who've hit their stated serving-preference cap (SCHED-7), and this is unit-tested, not just eyeballed
- [ ] Personal stats (§6.11) are confirmed private — no route, query, or API response exposes one volunteer's stats/streak to another non-admin volunteer
- [ ] High-fidelity design mockups for all 8 key screens (§10.5) were presented to and approved by the church before production UI was built
- [ ] If built by a multi-agent team (§18): every contract artifact in §18.2 was committed before any dependent agent began feature work against it
- [ ] If built by a multi-agent team (§18): no file under an agent's exclusively-owned path (`supabase/migrations/`, `design-tokens.json`, etc., per §18.3) shows edits from outside that agent's scope without a version-bump/broadcast per §18.5

## Appendix C: Privacy Policy Starting Template

*Draft only — must be reviewed and approved by the church before publishing.*

> **Breathe Worship Scheduler — Privacy Notice**
>
> Breathe New Life Church ("we", "us") uses this application to organise the Breathe Worship team's serving rota. We collect your name, email address, phone number, and the roles/availability you provide so we can schedule you fairly and keep you informed about services you're involved in.
>
> We do not sell or share your data with third parties beyond the service providers needed to run this app (Supabase for hosting/database, and our email provider for notifications), and we do not use your data for advertising.
>
> You can ask to see the data we hold on you, correct it, or ask us to remove your personal details at any time by contacting [church admin email]. Where removing your details would affect historical rota records, we will anonymise rather than delete those records so the team's serving history stays accurate.
>
> We retain your data for as long as you are an active or recent volunteer, and review inactive accounts periodically.
>
> Last updated: [date].
