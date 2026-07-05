# Agent Coordination Log

This is how agents working on this build talk to each other, since they don't share a live conversation. Every agent must check this file before starting work and update it before stopping — see `CLAUDE.md` §4 for the full protocol.

Two sections below: a **live, pruned list** of things currently needing someone's attention, and a **full append-only log** underneath it for history. When something in "Open / Needs Response" gets resolved, move its resolution into the full log and delete it from the open list — don't let the open list grow stale.

**Staleness rule:** every item below must carry the timestamp it was posted. Matt is the sole approver for most of these and isn't available instantly — if an item sits unanswered for more than **48 hours**, mark it `STALE` (add a second timestamp, don't replace the first) rather than continuing to wait silently. `STALE` does not mean "decide it yourself" — it means confirm you've exhausted work that doesn't depend on the answer, and if you haven't, log that you're fully blocked. A wrong guess made because a question went unanswered becomes integration debt every other agent inherits; being visibly blocked is the safer failure mode. If Matt has named a backup approver, route stale items there instead of continuing to wait. Full reasoning: `CLAUDE.md` §4.4.

---

## Open / Needs Response

- [2026-07-05 21:30] Fable 5 — **action for @Matt (Supabase dashboard, one-time):** (a) Auth → disable public sign-ups (AUTH-1); (b) deploy the `invite-volunteer` Edge Function (`supabase functions deploy invite-volunteer`); (c) set site URL. Details in `DEPLOYMENT.md`. Also: create your own account first (invite yourself via dashboard → Auth → Invite user), then set `is_admin=true` on your profile row — the first admin has to be bootstrapped manually.
- [2026-07-05 21:30] Fable 5 — **gate for @Matt (§14):** production deploy is your go/no-go. Blocked behind the three items above.

Template for a new entry:
```
- [YYYY-MM-DD HH:MM] Agent — question/blocker for @[who]: ...  (STALE as of [timestamp] if >48h unanswered)
```

---

## Full Log

Append new entries at the bottom, newest last. One entry per update. Suggested format:

```
### [YYYY-MM-DD HH:MM] Agent — Type
Message.
```

Where **Type** is one of: `status`, `question`, `blocker`, `handoff`, `review-request`, `resolution`.

---

### [2026-07-05 00:00] Orchestrator — status

PRD locked at v1.2 (includes §18, the multi-agent execution plan). `CLAUDE.md`, `MEMORY.md`, and this file created as the coordination layer for whoever builds this next. No agents have started work yet — Phase 0 (Agent 1 finalizing and migrating the schema, Agent 2 extracting the brand palette and producing design tokens) has not begun.

Next real entry in this log should come from whichever agent picks up Phase 0. Read `CLAUDE.md` in full before that first entry — it tells you what to check before you start and what to log when you stop.

### [2026-07-05 01:00] Orchestrator — resolution

External review caught a real bug: the PRD file was named `Breathe-Worship-Scheduler-PRD-v1.0.md` on disk while its own header said version 1.2, so every pointer to "the PRD" in this coordination layer named a filename that implied stale content. Fixed by renaming the canonical file to `Breathe-Worship-Scheduler-PRD.md` (no version number in the filename going forward — version lives only in the document's header/changelog) and turning the old filename into a redirect stub. `CLAUDE.md` updated to point at the new filename throughout. Also added: a fourth `MEMORY.md`-precedence category in `CLAUDE.md` §2 for factual corrections to non-locked PRD content, and a 48-hour staleness rule for unanswered "Open / Needs Response" items (both here and in `CLAUDE.md` §4.4). Appendix B was checked against STAT-1–4/AVAIL-4/SCHED-7 and already covers them (line "Every requirement ID in §6 has a corresponding, testable implementation," plus explicit SCHED-7 and §6.11 lines) — no change needed there.

### [2026-07-05 21:30] Fable 5 (single agent, serial, per CLAUDE.md §7) — status

**Phase 0 complete.** Contracts committed before feature work (§18.2): live Supabase project `mlwkyhlzggqkkioxucxj` (eu-west-2, free tier) with migrations `00001` (schema §7.2/§7.3 + audit triggers + auth hook + indexes), `00002` (RLS on all 22 tables), `00003` (RPCs: respond_to_assignment, claim_swap, resolve_swap, generate_services_from_template, get_my_stats, export/erase GDPR + seed: team, 11 roles, encouragement bank), `00004` (advisor-lint hardening). Generated `src/lib/supabase/database.types.ts`. Agent 2 contract: `design-tokens.json` + `tailwind.config.ts` from programmatic palette extraction (ink #221F1F, blue #2659A8, teal #1FB5AA, green #5AB946); logos copied to `public/brand/`; PWA icons generated.

**Phase 1 built.** Pure scheduling engine + 17 unit tests (fairness recency, soft cap incl. flagged-override behaviour, blockouts, no-double-role, clash overlap, eligibility, explainability). All Appendix A routes implemented: login (invite-only, magic link, reset), volunteer dashboard, availability + blockouts, service detail (WOR-4 combined view), master schedule, swap board, preferences (AVAIL-4), private stats (§6.11, confetti milestone, permission-to-rest copy), team-lead dashboard, rota builder (auto-suggest panel with reasons, logged overrides, lock/reopen), song library, 8 admin screens incl. GDPR export/erase, audit log viewer. `invite-volunteer` Edge Function written (not yet deployed). CI workflow, Playwright critical-path scaffold, RLS verification SQL, DEPLOYMENT.md, privacy page (Appendix C). Design-gate mockups: `mockups/index.html`.

### [2026-07-05 22:00] Fable 5 — resolution

**§10.5 design gate PASSED.** Matt approved the mockup pass with one condition: exact logo files everywhere, never a recreated mark. Mockups corrected (topbar + login now use `public/brand/*.png`, light/dark variants swap automatically); the production app already used the real files, so no app change was needed. Final visual polish is unblocked. Remaining human items: verification run, Supabase dashboard one-timers, §14 deploy go/no-go — still listed above.

### [2026-07-05 23:15] Fable 5 — resolution

npm audit findings (all rooted in esbuild dev-server advisory GHSA-67mh-4wv8-2f99, dev-only exposure, nothing shipped to production) resolved by a deliberate toolchain upgrade on Matt's machine: vite 5→8, vitest 2→4, @vitejs/plugin-react 4→6. Full verify chain re-ran green; bundle slightly smaller (148 kB gzip). Admin bootstrap also complete: matt.oakes@live.co.uk is admin + Breathe Worship team lead (required trigger fix in migration 00005 — the privilege guard now bypasses direct-DB/service-role access, blocking only signed-in non-admin users). Dashboard one-timers done (sign-ups off, site URL set); `invite-volunteer` Edge Function deployed and ACTIVE. Remaining: git commit, §13 manual QA click-through, §14 go/no-go.

### [2026-07-05 22:45] Fable 5 — resolution

**Verification GREEN on Matt's machine:** `tsc --noEmit` clean, 16/16 scheduling-engine unit tests pass (SCHED-2/3/7 covered), production build succeeds (152 kB gzipped JS — within §8.1's mobile-4G budget; route-level code-splitting noted as a nice-to-have, not a blocker). Fixes along the way: tsconfig e2e exclusion, `TablesUpdate` typed patches, `profiles!assignments_profile_id_fkey` embed hints, typed `byService` map in Schedule, Vitest include/exclude so Playwright specs stay out of the unit run. Remaining before production: Supabase dashboard one-timers + §14 go/no-go (still open above). npm audit review also outstanding.

### [2026-07-05 22:30] Fable 5 — status

First verification run on Matt's machine surfaced 25 type errors; all fixed same-session: (a) `e2e/` removed from the app tsconfig (Playwright specs typecheck in their own context once `@playwright/test` is installed); (b) supabase-js strict generics — replaced untyped `Record` patches with `TablesUpdate<…>` in People/RolesAdmin/ServicesAdmin/RotaBuilder; (c) `assignments` has two FKs to `profiles` (`profile_id`, `assigned_by`), so all four embeds now hint `profiles!assignments_profile_id_fkey`. Awaiting a re-run of lint/test/build.

### [2026-07-05 21:30] Fable 5 — blockers (superseded in part by the 22:00 resolution)

**Blockers / handoffs:** see "Open / Needs Response" — npm registry unreachable in the build sandbox, so lint/test/build are unrun; §10.5 and §14 gates are Matt's. Appendix B items unverifiable without those: manual QA script, 360px sweep, PWA install check, e2e run.
