# Breathe Worship Scheduler

Volunteer scheduling and worship planning for the Breathe Worship team at Breathe New Life
Church, Stoke-on-Trent. Mobile-first installable PWA. React + TypeScript + Vite + Supabase.

**If you are an agent (or a human) picking this repo up: start with [`CLAUDE.md`](./CLAUDE.md).**
Spec: `Breathe-Worship-Scheduler-PRD.md` · Decisions: `MEMORY.md` · Coordination: `AGENTS.md` ·
Deploy runbook: `DEPLOYMENT.md` · Design-gate mockups: `mockups/index.html`

## Quick start

```bash
npm install
# .env.local is already populated in this working copy (frontend-safe keys only)
npm run dev
```

## Verify (run before any deploy — CI runs the same three)

```bash
npm run lint    # typecheck
npm test        # scheduling-engine unit tests (SCHED-2/3/7)
npm run build   # production build
```

## Structure (ownership per PRD §18.3)

```
supabase/migrations/        schema + RLS + RPCs (Agent 1 — sole writer)
supabase/functions/         invite-volunteer Edge Function (Agent 1)
src/lib/scheduling-engine/  pure auto-suggest engine + unit tests (Agent 1)
src/lib/supabase/           client + generated types — contract artifact (Agent 1)
design-tokens.json          extracted brand palette — contract artifact (Agent 2)
tailwind.config.ts          theme mapped to tokens (Agent 2)
src/features/…              availability/scheduling/swaps (A4) · worship+admin (A5)
src/context/, src/pages/    auth, dashboards, stats (A3)
mockups/                    §10.5 design sign-off pass — all 8 key screens
.github/workflows/ci.yml    lint + test + build on every PR (A6)
```

## Live backend

Supabase project `breathe-worship-scheduler` (`mlwkyhlzggqkkioxucxj`, eu-west-2 London, free
tier). All 22 tables have RLS enabled — **RLS is the security boundary; frontend route guards
are UX only** (PRD §8.3). Seeded with the Breathe Worship team, the 11 v1 roles (PPL-2), and
the default encouragement message bank (§6.11).

**Manual dashboard steps still required** (see `DEPLOYMENT.md`): disable public sign-ups
(invite-only, AUTH-1), deploy the `invite-volunteer` Edge Function, set the site URL.

## Status

Phase 0 + Phase 1 built. Two human gates remain before production (PRD §18.4): the §10.5
design sign-off (open `mockups/index.html`) and the §14 deploy go/no-go. See `AGENTS.md`.
