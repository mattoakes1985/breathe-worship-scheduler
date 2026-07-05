# Breathe Worship Scheduler

Volunteer scheduling and worship-planning app for the Breathe Worship team at Breathe New Life Church, Stoke-on-Trent, UK.

**If you are an agent (or a human) picking this repo up: start with [`CLAUDE.md`](./CLAUDE.md).** It tells you what order to read things in, which of the six agent roles you might be, and the coordination protocol between `MEMORY.md` and `AGENTS.md`.

## What's in this repo right now

This repo currently holds the planning layer, not application code yet:

| File | Purpose |
|---|---|
| [`Breathe-Worship-Scheduler-PRD.md`](./Breathe-Worship-Scheduler-PRD.md) | The full product spec — locked decisions, functional requirements, data model/schema, non-functional requirements, design system, and the multi-agent execution plan (§18). |
| [`CLAUDE.md`](./CLAUDE.md) | Orchestration guide — read this first if you're an agent starting work here. |
| [`MEMORY.md`](./MEMORY.md) | Append-only log of decisions made during the build that aren't already pinned in the PRD. |
| [`AGENTS.md`](./AGENTS.md) | Live coordination board between agents — status updates, blockers, questions, handoffs. |

Application code (the actual Vite/React/Supabase app described in the PRD) has not been scaffolded yet — that's Phase 0 of the multi-agent execution plan in PRD §18.4, owned by Agent 1 (Backend & Schema) and Agent 2 (Design System).

## Status

Planning complete, locked for build. No agent has started Phase 0 yet — see `AGENTS.md` for the current state.
