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

## [2026-07-05] Production Supabase project created in eu-west-2 (London), free tier
- **Decision:** Live project `breathe-worship-scheduler` (ref `mlwkyhlzggqkkioxucxj`) on Matt's Osprey Ventures org, eu-west-2, £0/mo.
- **Why:** Matt chose "create live project now" over repo-only migrations; London region matches §8.3's UK data-residency framing; free tier matches D4.
- **Made by:** Matt (choice), executed by Fable 5 (single-agent serial build per CLAUDE.md §7)
- **PRD reference:** §3 (D4), §8.3, §9.4
- **Status:** Confirmed

## [2026-07-05] HTML mockups accepted as the §10.5 "Figma or equivalent"
- **Decision:** The design-gate deliverable is `mockups/index.html` — all 8 key screens, hi-fi, light+dark, real extracted palette — reviewed in a browser instead of Figma.
- **Why:** The building agent can't produce Figma files; Matt explicitly accepted HTML as equivalent. The gate itself (explicit human "yes") is unchanged.
- **Made by:** Matt
- **PRD reference:** §10.5
- **Status:** Confirmed

## [2026-07-05] Brand palette extracted; typography pairing chosen
- **Decision:** Anchors pulled programmatically from `Breathe Worship Black Colour.png`: ink `#221F1F`, gradient blue `#2659A8` → teal `#1FB5AA` → green `#5AB946`. Derived light/dark palettes live in `design-tokens.json`. Type pairing (PRD left open): Bricolage Grotesque (display) + Figtree (body), both Google Fonts.
- **Why:** §10.2 forbids guessed hex values; the pairing echoes the wordmark's geometric character while keeping data-dense UI legible. Subject to the §10.5 gate like everything visual.
- **Made by:** Fable 5 (Agent 2 role), pending Matt's design sign-off
- **PRD reference:** §10.2, §15
- **Status:** Confirmed (extraction) / Confirmed (typography — via design sign-off below)

## [2026-07-05] §10.5 design gate: APPROVED, with one condition
- **Decision:** Matt approved the 8-screen mockup pass (`mockups/index.html`) — palette, typography pairing, light+dark, layout direction. One condition: use the **exact logo files** everywhere, never a recreated/approximated mark. Mockups corrected same day; the production app already used the real files.
- **Why:** §10.2 designates the logo files as canonical; the mockups' CSS-drawn mark violated that.
- **Made by:** Matt
- **PRD reference:** §10.5, §10.2
- **Status:** Confirmed — the design gate is now PASSED; final visual polish is unblocked (§18.4 Phase 2 → 3)

## [2026-07-05] Privileged mutations via SECURITY DEFINER RPCs rather than Edge Functions
- **Decision:** Swap claim/approve, assignment respond, service generation, GDPR export/erasure, and stats run as Postgres SECURITY DEFINER functions with internal auth checks; the only Edge Function is `invite-volunteer` (needs the Auth admin API). Auto-suggest stays a pure client-side engine (`src/lib/scheduling-engine`) because it only reads data the Lead can already read and every acceptance is an explicit, RLS-checked, audit-logged write.
- **Why:** §9.2 permits "Edge Functions **or** RLS-guarded RPC functions"; RPCs give atomicity (e.g. swap double-claim row lock) with less deploy surface. §9.3 itself places the engine in `src/lib/`.
- **Made by:** Fable 5 (Agent 1 role)
- **PRD reference:** §9.1–9.3, SWAP-2, SCHED-2
- **Status:** Confirmed

## [2026-07-05] Security hardening migration after Supabase advisor lints
- **Decision:** Migration `00004`: pinned `search_path` on `set_updated_at`, replaced an always-true `WITH CHECK` on the leads-manage-swaps policy, revoked API `EXECUTE` on trigger/internal functions from all roles and on user-facing RPCs from `anon`, and revoked default function EXECUTE for future functions.
- **Why:** `get_advisors(security)` flagged all of these after the initial migrations; fixed same-day rather than left as debt.
- **Made by:** Fable 5 (Agent 1 role)
- **PRD reference:** §8.3
- **Status:** Confirmed

## [2026-07-05] Build-environment limitation: npm registry blocked in the build sandbox
- **Decision:** `npm install`/`vitest`/`vite build` could not run in the agent's sandbox (registry.npmjs.org returns 403). Verification (typecheck, unit tests, build) transfers to Matt's machine and the committed GitHub Actions CI. Code shipped is complete but **not yet machine-verified** — treat the first local `npm run lint && npm test && npm run build` as a required step, not optional.
- **Why:** Honest failure mode per CLAUDE.md §4 staleness philosophy: visibly blocked beats quietly unverified.
- **Made by:** Fable 5
- **PRD reference:** §13, §14
- **Status:** Superseded — first verify run went green on Matt's machine 2026-07-05 (lint clean, 16/16 tests, build OK) after 30 type-level fixes; see AGENTS.md 22:45 resolution

## [2026-07-05] v1.1 change batch from first hands-on review (Matt)
- **Decision:** Nine changes from Matt's first real use, all shipped same-day: (1) bulk multi-select status/lock editing on /admin/services; (2) 169 songs imported from the team's existing spreadsheet incl. female+male keys, BPM, time signature — schema gained `songs.male_key` and `songs.time_signature` (migration 00006); (3) linked services (`services.linked_service_id`, symmetric) for the 9:15/11:15 pattern, with one-click rota copy and unlink; (4) volunteers keep read-only sight of their availability answers after locking; (5) per-role instrument preference rank (`role_eligibility.preference_rank`, volunteer-editable via `set_my_role_preference` RPC, migration 00007) — engine ranking is now cap ≫ availability ≫ instrument preference ≫ recency, and the suggestion panel offers the full ranked list per slot, not a take-it-or-leave-it #1; (7) lead dashboard shows posted swaps as well as claimed; (8) ServicePlanner: leads edit song set (key picked from female/male defaults, custom by exception) + running order on the service detail screen; (9) master schedule CSV export between any two dates.
- **Why:** Direct user feedback after the §10.5 gate; item numbering matches Matt's message.
- **Made by:** Matt (requirements), Fable 5 (implementation)
- **PRD reference:** extends §6.3–6.7, §6.9; schema changes broadcast per §18.5.2
- **Status:** Confirmed

## [2026-07-05] Item 6 ("remove assignment confirmation") proposed then withdrawn
- **Decision:** Matt initially asked to drop the confirm step, then kept it once clarified it's a visibility signal, not friction. SCHED-4 stands unchanged.
- **Why:** Confirmation is how a lead knows a volunteer has actually seen their assignment.
- **Made by:** Matt
- **PRD reference:** §6.5 (SCHED-4)
- **Status:** Confirmed (no change made)

## [2026-07-05] Multi-agent execution plan added
- **Decision:** PRD §18 defines a 6-agent roster (Backend/Schema, Design System, three frontend agents split by feature area, QA/DevOps), three shared contract artifacts, and a "lock the contract, then parallelize" rule as the core safeguard against agents colliding.
- **Why:** Matt requested the PRD be optimized for a multi-agent AI build team rather than assuming one agent builds serially.
- **Made by:** Matt (requirement), structure proposed by Orchestrator
- **PRD reference:** §18
- **Status:** Confirmed
