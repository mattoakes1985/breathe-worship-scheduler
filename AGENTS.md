# Agent Coordination Log

This is how agents working on this build talk to each other, since they don't share a live conversation. Every agent must check this file before starting work and update it before stopping — see `CLAUDE.md` §4 for the full protocol.

Two sections below: a **live, pruned list** of things currently needing someone's attention, and a **full append-only log** underneath it for history. When something in "Open / Needs Response" gets resolved, move its resolution into the full log and delete it from the open list — don't let the open list grow stale.

**Staleness rule:** every item below must carry the timestamp it was posted. Matt is the sole approver for most of these and isn't available instantly — if an item sits unanswered for more than **48 hours**, mark it `STALE` (add a second timestamp, don't replace the first) rather than continuing to wait silently. `STALE` does not mean "decide it yourself" — it means confirm you've exhausted work that doesn't depend on the answer, and if you haven't, log that you're fully blocked. A wrong guess made because a question went unanswered becomes integration debt every other agent inherits; being visibly blocked is the safer failure mode. If Matt has named a backup approver, route stale items there instead of continuing to wait. Full reasoning: `CLAUDE.md` §4.4.

---

## Open / Needs Response

_Nothing open yet. Phase 0 (schema finalization by Agent 1, palette extraction by Agent 2 — see PRD §18.4) hasn't started._

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
