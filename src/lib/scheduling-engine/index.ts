// Breathe Worship auto-suggest engine — SCHED-2, SCHED-3, SCHED-7.
// Pure functions only. Simple, explainable, human-overridable (PRD §15):
// every suggestion carries human-readable reasons, and the engine never
// publishes anything — the Team Lead confirms each slot.
import type {
  CandidateScore,
  ClashInput,
  EngineBlockout,
  EngineHistoryEntry,
  EnginePreference,
  EngineServiceInput,
  Suggestion,
} from "./types";

export * from "./types";

const DAY_MS = 86_400_000;

function parseDate(iso: string): Date {
  return new Date(iso + "T00:00:00");
}

/** AVAIL-2: does a blockout suppress this volunteer on this date? */
export function isBlockedOut(blockouts: EngineBlockout[], profileId: string, dateISO: string): boolean {
  const d = parseDate(dateISO);
  return blockouts.some((b) => {
    if (b.profileId !== profileId) return false;
    if (b.recurringDayOfWeek !== null && b.recurringDayOfWeek === d.getDay()) return true;
    if (b.startDate && b.endDate) return dateISO >= b.startDate && dateISO <= b.endDate;
    if (b.startDate && !b.endDate) return dateISO >= b.startDate;
    return false;
  });
}

/** Days since this volunteer last served this role (Infinity = never). */
export function daysSinceLastServed(
  history: EngineHistoryEntry[],
  profileId: string,
  roleId: string,
  onDate: string
): number {
  const dates = history
    .filter((h) => h.profileId === profileId && h.roleId === roleId && h.serviceDate < onDate)
    .map((h) => h.serviceDate)
    .sort();
  if (dates.length === 0) return Infinity;
  const last = dates[dates.length - 1];
  return Math.round((parseDate(onDate).getTime() - parseDate(last).getTime()) / DAY_MS);
}

/** Count serves in the volunteer's stated period containing `onDate`. */
export function countServesInPeriod(
  entries: EngineHistoryEntry[],
  profileId: string,
  onDate: string,
  periodType: "week" | "month"
): number {
  const d = parseDate(onDate);
  let start: Date, end: Date;
  if (periodType === "month") {
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  } else {
    const dow = (d.getDay() + 6) % 7; // Monday-start week
    start = new Date(d.getTime() - dow * DAY_MS);
    end = new Date(start.getTime() + 6 * DAY_MS);
  }
  const s = start.toISOString().slice(0, 10);
  const e = end.toISOString().slice(0, 10);
  return entries.filter(
    (x) => x.profileId === profileId && x.serviceDate >= s && x.serviceDate <= e
  ).length;
}

/** SCHED-7: has the volunteer met/exceeded their stated soft cap for this period? */
export function isOverPreferenceCap(
  preferences: EnginePreference[],
  periodAssignments: EngineHistoryEntry[],
  profileId: string,
  onDate: string
): boolean {
  const pref = preferences.find((p) => p.profileId === profileId);
  if (!pref || pref.maxServicesPerPeriod == null) return false;
  const count = countServesInPeriod(periodAssignments, profileId, onDate, pref.periodType);
  return count >= pref.maxServicesPerPeriod;
}

/** SCHED-3: do two services overlap in time on the same date? */
export function servicesOverlap(a: ClashInput, b: ClashInput): boolean {
  if (a.serviceDate !== b.serviceDate) return false;
  const end = (s: ClashInput) => s.endTime ?? addMinutes(s.startTime, 120);
  return a.startTime < end(b) && b.startTime < end(a);
}

function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Rank candidates for one role slot. Ordering (SCHED-2 + SCHED-7):
 *  1. under-preference-cap before over-cap
 *  2. "yes" availability before "maybe"
 *  3. the volunteer's own instrument preference (rank 1 = first-choice role)
 *  4. longest-ago in this role first (fairness)
 *  5. deterministic name tie-break
 * Volunteers who said "no", didn't respond, are blocked out, or aren't
 * eligible are excluded entirely (SCHED-1 default; Lead can override in UI).
 */
export function rankCandidates(
  input: EngineServiceInput,
  roleId: string,
  excludeProfileIds: Set<string>
): CandidateScore[] {
  const avail = new Map(input.availability.map((a) => [a.profileId, a.response]));
  const out: CandidateScore[] = [];

  for (const v of input.volunteers) {
    if (excludeProfileIds.has(v.profileId)) continue;
    if (!(roleId in v.eligibleRoles)) continue;
    const response = avail.get(v.profileId);
    if (response !== "yes" && response !== "maybe") continue;
    if (isBlockedOut(input.blockouts, v.profileId, input.serviceDate)) continue;

    const overCap = isOverPreferenceCap(
      input.preferences,
      input.periodAssignments,
      v.profileId,
      input.serviceDate
    );
    const recency = daysSinceLastServed(input.history, v.profileId, roleId, input.serviceDate);
    const instrumentRank = Math.min(Math.max(v.rolePreferenceRank?.[roleId] ?? 1, 1), 10);
    const reasons: string[] = [];
    reasons.push(response === "yes" ? "Available (yes)" : "Available (maybe)");
    if (instrumentRank === 1) reasons.push("Their first-choice instrument");
    else reasons.push(`Their #${instrumentRank} instrument choice`);
    reasons.push(
      recency === Infinity ? "Never served this role" : `Last served this role ${recency} days ago`
    );
    if (overCap) reasons.push("At their preferred serving limit for this period");

    // Composite score, larger = better. Tiers: cap ≫ availability ≫ own
    // instrument preference ≫ recency. Each tier outweighs everything below it.
    const score =
      (overCap ? 0 : 1_000_000_000) +
      (response === "yes" ? 100_000_000 : 0) +
      (10 - instrumentRank) * 1_000_000 +
      Math.min(recency, 99_999);

    out.push({ profileId: v.profileId, name: v.name, score, overPreferenceCap: overCap, reasons });
  }

  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/**
 * SCHED-2: propose a full or partial rota. Greedy fill in slot order;
 * never proposes the same volunteer for two slots on one service.
 * Never auto-publishes — output is a proposal for the Team Lead.
 */
export function suggestRota(input: EngineServiceInput): Suggestion[] {
  const used = new Set<string>();
  const suggestions: Suggestion[] = [];

  for (const slot of input.slots) {
    const ranked = rankCandidates(input, slot.roleId, used);
    const pick = ranked[0] ?? null;
    if (pick) {
      used.add(pick.profileId);
      suggestions.push({
        roleId: slot.roleId,
        slotIndex: slot.slotIndex,
        profileId: pick.profileId,
        reasons: pick.reasons,
        overPreferenceCap: pick.overPreferenceCap,
      });
    } else {
      suggestions.push({
        roleId: slot.roleId,
        slotIndex: slot.slotIndex,
        profileId: null,
        reasons: ["No eligible, available volunteer found"],
        overPreferenceCap: false,
      });
    }
  }
  return suggestions;
}
