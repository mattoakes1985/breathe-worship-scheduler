# Decision Log

This file records decisions made about this project that aren't already pinned as Locked Decisions in the PRD (§3) — resolved open items from PRD §15, judgment calls made where the PRD was deliberately left flexible, and (rarely, and only with explicit sign-off from Matt) any deviation from a Locked Decision.

**Do not use this file for task progress or agent-to-agent chatter — that's what `AGENTS.md` is for.** This file is for things a future session or a different agent needs to know *happened and why*, not what's currently in flight.

## Format

```
## [YYYY-MM-DD] Short decision title
- **Decision:** what was decided
- **Why:** the reasoning or constraint behind it
- **Made by:** Matt / Agent N / Orchestrator
- **PRD reference:** section, if applicable
- **Status:** Confirmed / Superseded by [later entry]
```

Add a new entry whenever: (a) the PRD leaves something open and it gets resolved during build, (b) an agent deviates from a PRD default and needs to justify it, or (c) a Locked Decision (§3) is challenged — this last case should be rare and requires explicit sign-off from Matt before it's logged as Confirmed rather than Proposed.

---

## [2026-07-05] Clean-slate rebuild, not an extension of ServiceWeaver
- **Decision:** Build a new codebase rather than extending or forking `ServiceWeaver`/`service-flow-tool`.
- **Why:** Full control over architecture and a clean start, while still reusing the proven data-model *pattern* (not the code).
- **Made by:** Matt
- **PRD reference:** §3 (D1)
- **Status:** Confirmed

## [2026-07-05] V1 scope is Breathe Worship only
- **Decision:** V1 builds and exposes only the Breathe Worship team. Schema stays team/role-generic so other ministries can be added later without a breaking migration, but no multi-team UI ships in v1.
- **Why:** Matches the actual near-term need; avoids building admin surface area (team creation, per-team config) nobody will use yet.
- **Made by:** Matt
- **PRD reference:** §3 (D2), §5
- **Status:** Confirmed

## [2026-07-05] No safeguarding/DBS module in v1
- **Decision:** Safeguarding/DBS tracking is explicitly out of scope for v1, but becomes a hard requirement (not optional) before any Kids/youth team is ever added to this tool.
- **Why:** Breathe Worship doesn't involve unsupervised contact with children, so it isn't needed yet; but it must be treated as a gate, not forgotten, if scope ever expands toward Kids ministry.
- **Made by:** Matt
- **PRD reference:** §3 (D3), §5.3
- **Status:** Confirmed

## [2026-07-05] Minimal-cost hosting posture
- **Decision:** Supabase free/Pro tier + Vercel/Netlify free/hobby tier + a cheap domain + free-tier transactional email. No paid monitoring/SMS/error-tracking assumed by default.
- **Why:** Small single-church deployment; cost should track actual usage, not be paid upfront for headroom nobody needs yet.
- **Made by:** Matt
- **PRD reference:** §3 (D4), §11
- **Status:** Confirmed

## [2026-07-05] Corrected attribution: `church-scheduler-app` is the original schema source
- **Decision:** The PRD's data model traces back to `church-scheduler-app` (the earliest, Python/Flask attempt), not to `ServiceWeaver` as originally stated. `ServiceWeaver` is very likely a Supabase/TypeScript port of that same schema (near-identical table/column naming, verified directly against `church-scheduler-app`'s live schema export).
- **Why:** Initial PRD drafting assumed the GitHub folder listing meant the repo's content couldn't be reviewed and treated it as "nothing to reuse." Pulling the actual file tree and schema via jsdelivr's raw-file CDN proved that assumption wrong.
- **Made by:** Orchestrator (Claude), confirmed with Matt
- **PRD reference:** §0
- **Status:** Confirmed

## [2026-07-05] Serving preferences added as a soft cap distinct from availability
- **Decision:** Volunteers can state a serving-frequency preference (e.g., "available most weeks, only want to serve twice a month") that's separate from per-service Yes/No/Maybe availability. The auto-suggest engine treats it as a soft ranking signal; Team Leads can always override with a logged action.
- **Why:** Matt identified that "available" and "wants to be asked every time" are different facts the original design collapsed into one.
- **Made by:** Matt
- **PRD reference:** §6.4 (AVAIL-4), §6.5 (SCHED-7), §7.2 (`serving_preferences` table)
- **Status:** Confirmed

## [2026-07-05] Gamified serving stats added, deliberately private and non-competitive
- **Decision:** Personal stats (streaks, milestones, reliability) are visible only to the volunteer themselves and to Team Leads/Admins for pastoral-care purposes — never as a cross-volunteer leaderboard. The system must never nudge a volunteer to serve past their own stated preference cap.
- **Why:** A public leaderboard would reward over-serving, directly undermining the existing burnout-prevention flag (REP-2), and risks making people who serve less for legitimate reasons feel judged.
- **Made by:** Matt (feature request), design constraint proposed by Orchestrator and confirmed by Matt
- **PRD reference:** §6.11 (STAT-1–4)
- **Status:** Confirmed

## [2026-07-05] Reliability indicator visible to Team Leads, not to peers — asymmetry confirmed intentional
- **Decision:** A volunteer's decline/no-show reliability ratio is visible to Team Leads/Admins (for pastoral care) but not to other volunteers.
- **Why:** Flagged as a deliberate asymmetry worth confirming rather than assuming — Matt confirmed it's the right call.
- **Made by:** Matt
- **PRD reference:** §6.11 (STAT-1)
- **Status:** Confirmed

## [2026-07-05] Design system rewritten with an explicit reference bar and mandatory sign-off gate
- **Decision:** §10 now names concrete quality-bar references (Strava, Things 3, Linear, Cash App) and requires a human-approved high-fidelity mockup pass for all 8 key screens before any production UI is coded.
- **Why:** Matt stated neither prior attempt achieved the visual quality wanted ("as if designed by a top-tier design artist"). A written spec can raise the floor but can't guarantee that ceiling on its own — the gate is the actual mechanism that catches a miss before it's built.
- **Made by:** Matt (requirement), gate mechanism proposed by Orchestrator
- **PRD reference:** §10.5
- **Status:** Confirmed

## [2026-07-05] PRD filename no longer carries a version number
- **Decision:** The canonical PRD file is `Breathe-Worship-Scheduler-PRD.md`. Version is tracked only in the document's own header table and its "Changes in vX.X" changelog — never in the filename.
- **Why:** External review caught that the file was named `...v1.0.md` on disk while its content had already moved to v1.2, meaning every pointer to "the PRD" from `CLAUDE.md`/`MEMORY.md`/`AGENTS.md` referenced a filename implying stale content. A version-less filename can't drift out of sync with its own header the same way.
- **Made by:** Orchestrator, per external review feedback confirmed by Matt
- **PRD reference:** n/a (meta — this is about the file, not the spec content)
- **Status:** Confirmed

## [2026-07-05] Multi-agent execution plan added
- **Decision:** PRD §18 defines a 6-agent roster (Backend/Schema, Design System, three frontend agents split by feature area, QA/DevOps), three shared contract artifacts, and a "lock the contract, then parallelize" rule as the core safeguard against agents colliding.
- **Why:** Matt requested the PRD be optimized for a multi-agent AI build team rather than assuming one agent builds serially.
- **Made by:** Matt (requirement), structure proposed by Orchestrator
- **PRD reference:** §18
- **Status:** Confirmed
