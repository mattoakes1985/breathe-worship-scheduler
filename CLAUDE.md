# Breathe Worship Scheduler — Orchestration Guide

This file is read automatically by any Claude/agent session working in this repository. If you are an agent starting work here, read files in this exact order before writing any code or making any decision:

1. This file (`CLAUDE.md`)
2. `Breathe-Worship-Scheduler-PRD.md` — the full spec, especially §18 (Multi-Agent Execution Plan)
3. `MEMORY.md` — decisions already made during this build
4. `AGENTS.md` — the live coordination log between agents, especially its "Open / Needs Response" section

Do not skip step 3 or 4 because they look short. They exist specifically to stop you from re-deciding something already settled or missing a question another agent left for you.

## 1. What this project is

**Breathe Worship Scheduler** — a volunteer scheduling and worship-planning app for the Breathe Worship team at Breathe New Life Church, Stoke-on-Trent, UK. Full requirements, schema, and acceptance criteria live in `Breathe-Worship-Scheduler-PRD.md`. This file does not restate the spec — it tells you how to work within it alongside other agents.

## 2. Source of truth hierarchy

When two sources disagree, resolve in this order:

1. **PRD §3 (Locked Decisions)** — never contradicted, by anyone, without an explicit human sign-off logged in `MEMORY.md` as a rare exception, not a routine override.
2. **The PRD itself** — the full spec (`Breathe-Worship-Scheduler-PRD.md`).
3. **`MEMORY.md`**, for three distinct purposes, ranked in the order they resolve:
   a. **Factual corrections to non-locked PRD content.** If MEMORY.md documents that something the PRD *states as fact* outside §3 is simply wrong (e.g., a mischaracterization of a prior repo, a stale number), the MEMORY.md correction takes precedence over the contradicted PRD text, and the PRD should be edited to match as soon as practical — a factual error isn't a "locked decision" protecting it from correction, and MEMORY.md is not merely deferring to the PRD here.
   b. **Resolving something the PRD left open** (see PRD §15, "Risks & Assumptions") — MEMORY.md's resolution governs going forward.
   c. **Clarifying an ambiguity** the PRD didn't fully specify — MEMORY.md's clarification governs.
   For anything that isn't one of these three cases — i.e., MEMORY.md expressing a preference or reinterpretation of something the PRD already specifies clearly and correctly — the PRD outranks MEMORY.md, per §1–2 above.
4. **`AGENTS.md`** — the live coordination log. Useful for "what's happening right now," but anything decided there that matters beyond the moment belongs copied into `MEMORY.md` too.

If `MEMORY.md` or `AGENTS.md` ever appears to contradict a PRD §3 Locked Decision, the PRD wins — Locked Decisions are the one category §3a's factual-correction rule does not override. Flag the conflict in `AGENTS.md`'s "Open / Needs Response" section and route it to the orchestrator (Matt) rather than picking a side yourself.

## 3. Which agent are you?

The PRD (§18.3) defines six roles. If you were not explicitly told which one you are, **stop and ask the orchestrator before starting work** — guessing wrong is exactly the kind of file-ownership collision this whole structure exists to prevent.

| # | Agent | Owns |
|---|---|---|
| 1 | Backend & Schema | `supabase/migrations/`, `supabase/functions/`, `src/lib/scheduling-engine/`, `src/lib/supabase/` |
| 2 | Design System | `tailwind.config.ts`, `design-tokens.json`, Figma mockups |
| 3 | Frontend — Core & People | Auth, profile, dashboard shell, personal stats screen |
| 4 | Frontend — Scheduling & Availability | Services/templates, availability, rota builder, swaps |
| 5 | Frontend — Worship & Admin | Songs/service order, remaining admin screens |
| 6 | QA & DevOps | Tests, CI/CD, environments, hosting |

Full detail, dependencies, and the collapse order for smaller teams: PRD §18.3.

## 4. The three-file protocol (mandatory, every work session)

**Before starting any task:**
1. Read the PRD section(s) relevant to your assignment.
2. Read `MEMORY.md` in full — check whether the decision you're about to make has already been made.
3. Read `AGENTS.md`'s "Open / Needs Response" section, and skim the full log if you're picking up work after a gap, to check for questions, blockers, handoffs, or review requests left for you.

**While working:**
4. If you hit a decision the PRD doesn't cover — this should be rare, the PRD is written to minimize it — do not silently improvise. Post it to `AGENTS.md` under "Open / Needs Response," **timestamped**, tagged for the orchestrator or the specific agent who needs to weigh in. If it doesn't block all your work, keep moving on unrelated parts, but mark anything downstream of the open question as provisional in code comments.
   - **Staleness rule:** Matt is the sole approver for most of these questions, and he isn't available instantly. If an item sits unanswered in "Open / Needs Response" for more than **48 hours**, mark it `STALE` (with the original and stale timestamps) rather than continuing to wait silently. A stale mark does not authorize you to decide the question yourself — it means: (a) confirm you've genuinely exhausted work that doesn't depend on the answer, and if so, (b) log that you are fully blocked rather than guessing. A wrong guess made because a question went unanswered becomes integration debt every other agent inherits; idle-and-clearly-logged is the safer failure mode than quietly-decided-and-wrong. If Matt has named a backup approver, stale items route to them instead of continuing to wait.
5. If you need something from a file or contract owned by another agent (PRD §18.3), do not edit it yourself. Request it in `AGENTS.md` instead.
6. If you finish a contract artifact — a schema migration, generated types, design tokens, an RPC signature stub (PRD §18.2) — say so explicitly in `AGENTS.md` so dependent agents know it's safe to build against it. Silence is not a signal; an explicit log entry is.

**Before ending any task or session:**
7. If you made or confirmed a decision not already pinned in the PRD, add an entry to `MEMORY.md`.
8. Post a status entry to `AGENTS.md`: what you did, what's left, what (if anything) blocks you or needs another agent's or the orchestrator's review.

## 5. Hard rules (non-negotiable — mirrors PRD §18.5)

- No agent edits another agent's owned paths.
- Contract changes after Phase 0 require a version bump and a broadcast in `AGENTS.md` — never a silent edit to a migration, token file, or signature another agent already depends on.
- The design sign-off gate (PRD §10.5) and the production deploy go/no-go (PRD §14) are human decisions held by the orchestrator. No agent self-approves either one.
- Your definition of "done" is the PRD's **Appendix B checklist**, not your own judgment of completeness.

## 6. File index

| File | Purpose |
|---|---|
| `Breathe-Worship-Scheduler-PRD.md` | The spec. Treat as read-only during build — changes to it are an orchestrator decision, logged in `MEMORY.md`. |
| `MEMORY.md` | Append-only decision log. Short, one entry per decision, with a reason. |
| `AGENTS.md` | The coordination board — how agents talk to each other since they don't share a live conversation. |
| `CLAUDE.md` | This file. |

## 7. If you're a single agent, not a multi-agent team

If Fable 5 (or any agent) is building this serially rather than as a split team, the six-agent roster in §3 above still tells you the intended order and boundaries — work through them roughly in that sequence (schema and design tokens first, then features, then QA/deploy). Keep using `MEMORY.md` and `AGENTS.md` anyway: they become a running log Matt can read to see what happened and why, without having to re-read every commit.
