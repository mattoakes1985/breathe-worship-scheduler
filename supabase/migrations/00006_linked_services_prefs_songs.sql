-- v1.1 change batch (Matt, 2026-07-05): linked services, instrument
-- preference ranking, dual song keys.
-- (Item 6 "remove confirm" was proposed then withdrawn — SCHED-4 stands.)
-- Contract change post-Phase 0 → logged in MEMORY.md/AGENTS.md per PRD §18.5.

-- (3) Linked services: 9:15 + 11:15 pairs. Nullable self-FK; decouple = set null.
alter table services add column linked_service_id uuid references services(id);
create index idx_services_linked on services (linked_service_id) where linked_service_id is not null;

-- (5) Instrument preference: rank 1 = first-choice instrument for that volunteer.
alter table role_eligibility add column preference_rank int not null default 1
  check (preference_rank between 1 and 10);

-- (2) Songs carry both congregation keys, like the team's existing spreadsheet.
alter table songs add column male_key text;
alter table songs add column time_signature text;
