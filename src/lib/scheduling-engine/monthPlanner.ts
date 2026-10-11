// Monthly auto-planner (WO-3). Pure and deterministic: same input, same plan.
//
// Hard constraints (never relaxed): the person plays that role, said Yes or
// Maybe for that service (no response = not available), is not already on
// the service, and is not on a different, unlinked service the same day.
//
// Soft rules are applied in the priority order Matt sets in the rules editor.
// A soft rule is only broken when every remaining candidate breaks it (or a
// higher rule), and every break is reported on the slot ("relaxed").
//
// Core roles are filled first on every service, and a core gap is reported
// loudly with the people closest to filling it.

export type PlanResponse = "yes" | "no" | "maybe";
export type SoftRuleKind = "monthly_cap" | "rest_gap" | "availability" | "households" | "fairness";

export interface PlanPerson {
  id: string;
  name: string;
  /** roleId -> preference rank (1 = first choice) */
  roles: Record<string, number>;
  maxPerMonth: number | null;
  householdId: string | null;
  /** The instrument they always play while leading (e.g. acoustic), or null. */
  leadsOnRoleId?: string | null;
}

export interface PlanHousehold {
  id: string;
  preference: "together" | "apart" | "none";
}

export interface PlanSlot {
  roleId: string;
  slotIndex: number;
}

export interface PlanService {
  id: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  isAllIn: boolean;
  /** another service this one mirrors (same band plays both, e.g. a double Sunday) */
  linkedServiceId: string | null;
  slots: PlanSlot[];
}

export interface PlanAvailability {
  personId: string;
  serviceId: string;
  response: PlanResponse;
}

/** A serve outside the month being planned (history) — for fairness and rest gaps. */
export interface PlanHistory {
  personId: string;
  date: string;
}

export interface PlanLock {
  serviceId: string;
  roleId: string;
  slotIndex: number;
  personId: string | null;
}

export interface CoreGroup {
  label: string;
  roleIds: string[];
}

export interface PlanRules {
  plannedRoleIds: string[] | null; // null = every slot on the service
  coreGroups: CoreGroup[]; // empty = rule off
  allIn: boolean;
  /** soft rules in priority order (highest first); omitted kinds are off */
  softOrder: SoftRuleKind[];
  restGapWeeks: number; // 1 = avoid consecutive Sundays
  defaultMaxPerMonth: number | null;
  /** Roles that count as leading (for "leads while playing acoustic"). */
  leadRoleIds?: string[];
}

export interface PlanInput {
  month: string; // YYYY-MM
  services: PlanService[];
  people: PlanPerson[];
  households: PlanHousehold[];
  availability: PlanAvailability[];
  history: PlanHistory[];
  locks: PlanLock[];
  rules: PlanRules;
  roleNames: Record<string, string>;
}

export interface PlannedSlot {
  serviceId: string;
  roleId: string;
  slotIndex: number;
  personId: string | null;
  locked: boolean;
  extra: boolean; // added on an All-in Sunday beyond the normal slots
  reasons: string[];
  relaxed: string[];
}

export interface CoreGap {
  serviceId: string;
  label: string;
  closest: { personId: string; name: string; why: string }[];
}

export interface PlanResult {
  slots: PlannedSlot[];
  coreGaps: CoreGap[];
  unfilled: { serviceId: string; roleId: string; slotIndex: number }[];
  /** serves per person in the planned month */
  load: Record<string, number>;
}

export const DEFAULT_SOFT_ORDER: SoftRuleKind[] = ["monthly_cap", "rest_gap", "availability", "households", "fairness"];

const DAY = 86_400_000;
const toTime = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const daysBetween = (a: string, b: string) => Math.round(Math.abs(toTime(a) - toTime(b)) / DAY);

interface Ctx {
  input: PlanInput;
  people: Map<string, PlanPerson>;
  households: Map<string, PlanHousehold>;
  avail: Map<string, PlanResponse>; // `${serviceId}|${personId}`
  /** every known serve date per person: history + plan so far (incl. locks) */
  serveDates: Map<string, string[]>;
  load: Map<string, number>;
  /** who is on each service so far */
  onService: Map<string, Set<string>>;
  /** person -> services they are on, for the same-day clash check */
  personServices: Map<string, Set<string>>;
  serviceById: Map<string, PlanService>;
}

function addServe(ctx: Ctx, personId: string, service: PlanService) {
  const set = ctx.onService.get(service.id) ?? new Set<string>();
  if (set.has(personId)) return;
  set.add(personId);
  ctx.onService.set(service.id, set);
  const ps = ctx.personServices.get(personId) ?? new Set<string>();
  ps.add(service.id);
  ctx.personServices.set(personId, ps);
  // a linked pair on the same day counts as one serve
  const sameDayLinked = [...ps].some((sid) => {
    if (sid === service.id) return false;
    const other = ctx.serviceById.get(sid);
    return other && other.date === service.date && linked(service, other);
  });
  if (!sameDayLinked) {
    ctx.serveDates.set(personId, [...(ctx.serveDates.get(personId) ?? []), service.date]);
    ctx.load.set(personId, (ctx.load.get(personId) ?? 0) + 1);
  }
}

function linked(a: PlanService, b: PlanService) {
  return a.linkedServiceId === b.id || b.linkedServiceId === a.id;
}

type Exclusion = "not_eligible" | "said_no" | "no_response" | "on_service" | "same_day";

function exclusion(ctx: Ctx, p: PlanPerson, service: PlanService, roleId: string): Exclusion | null {
  if (!(roleId in p.roles)) return "not_eligible";
  const r = ctx.avail.get(`${service.id}|${p.id}`);
  if (r === "no") return "said_no";
  if (r !== "yes" && r !== "maybe") return "no_response";
  if (ctx.onService.get(service.id)?.has(p.id)) return "on_service";
  for (const sid of ctx.personServices.get(p.id) ?? []) {
    const other = ctx.serviceById.get(sid);
    if (other && other.id !== service.id && other.date === service.date && !linked(other, service)) return "same_day";
  }
  return null;
}

const EXCLUSION_TEXT: Record<Exclusion, string> = {
  not_eligible: "doesn't play this",
  said_no: "said no",
  no_response: "hasn't responded",
  on_service: "already on this service",
  same_day: "on another service that day",
};

interface Scored {
  person: PlanPerson;
  penalties: Record<SoftRuleKind, number>;
  tail: number[]; // fixed tie-breaks after the soft rules
  notes: Partial<Record<SoftRuleKind, string>>;
  reasons: string[];
}

function capFor(ctx: Ctx, p: PlanPerson): number | null {
  return p.maxPerMonth ?? ctx.input.rules.defaultMaxPerMonth;
}

function score(ctx: Ctx, p: PlanPerson, service: PlanService, roleId: string): Scored {
  const rules = ctx.input.rules;
  const load = ctx.load.get(p.id) ?? 0;
  const cap = capFor(ctx, p);
  const response = ctx.avail.get(`${service.id}|${p.id}`)!;
  const dates = ctx.serveDates.get(p.id) ?? [];
  const gapDays = rules.restGapWeeks * 7;
  const tooClose = dates.find((d) => d !== service.date && daysBetween(d, service.date) <= gapDays);
  const lastBefore = dates.filter((d) => d < service.date).sort().slice(-1)[0];
  const daysSince = lastBefore ? daysBetween(lastBefore, service.date) : 9999;

  const hh = p.householdId ? ctx.households.get(p.householdId) : undefined;
  const others = [...(ctx.onService.get(service.id) ?? [])].map((id) => ctx.people.get(id)).filter(Boolean) as PlanPerson[];
  const householdHere = !!(p.householdId && others.some((o) => o.householdId === p.householdId));
  // Households: a member of a "together" household scores best when their
  // household is already on this service (beats everyone else); "apart" scores
  // worst when it is.
  let hhPenalty = 1;
  let hhNote: string | undefined;
  if (hh?.preference === "together" && householdHere) hhPenalty = 0;
  else if (hh?.preference === "apart" && householdHere) {
    hhPenalty = 2;
    hhNote = "Household prefers to serve apart";
  }

  const rank = Math.min(Math.max(p.roles[roleId] ?? 1, 1), 10);
  const reasons: string[] = [];
  reasons.push(response === "yes" ? "Said yes" : "Said maybe");
  reasons.push(rank === 1 ? "First-choice instrument" : `Instrument choice #${rank}`);
  reasons.push(daysSince >= 9999 ? "No recent serves on record" : `Last served ${daysSince} days ago`);
  if (load > 0) reasons.push(`${load} other serve${load === 1 ? "" : "s"} this month`);
  if (householdHere && hh?.preference === "together") reasons.push("With their household");

  return {
    person: p,
    penalties: {
      monthly_cap: cap != null && load >= cap ? 1 : 0,
      rest_gap: tooClose ? 1 : 0,
      availability: response === "yes" ? 0 : 1,
      households: hhPenalty,
      fairness: load, // fewer serves this month first
    },
    notes: {
      monthly_cap: cap != null && load >= cap ? `Over their monthly limit (${cap})` : undefined,
      rest_gap: tooClose ? `Also serving ${tooClose} (within ${rules.restGapWeeks} week${rules.restGapWeeks === 1 ? "" : "s"})` : undefined,
      availability: response === "maybe" ? "Only said maybe" : undefined,
      households: hhNote,
    },
    // instrument preference, then whoever served longest ago, then name
    tail: [rank, -Math.min(daysSince, 9999)],
    reasons,
  };
}

function compare(order: SoftRuleKind[], a: Scored, b: Scored): number {
  for (const k of order) {
    const d = a.penalties[k] - b.penalties[k];
    if (d !== 0) return d;
  }
  for (let i = 0; i < a.tail.length; i++) {
    const d = a.tail[i] - b.tail[i];
    if (d !== 0) return d;
  }
  return a.person.name.localeCompare(b.person.name) || a.person.id.localeCompare(b.person.id);
}

const RELAX_LABEL: Record<SoftRuleKind, string> = {
  monthly_cap: "monthly limit",
  rest_gap: "rest week",
  availability: "maybe",
  households: "household",
  fairness: "load",
};

function pick(ctx: Ctx, service: PlanService, roleIds: string[]): { scored: Scored; roleId: string } | null {
  const order = ctx.input.rules.softOrder;
  let best: { scored: Scored; roleId: string } | null = null;
  for (const roleId of roleIds) {
    for (const p of ctx.input.people) {
      if (exclusion(ctx, p, service, roleId)) continue;
      const s = score(ctx, p, service, roleId);
      if (!best || compare(order, s, best.scored) < 0) best = { scored: s, roleId };
    }
  }
  return best;
}

function finalize(ctx: Ctx, chosen: Scored): { reasons: string[]; relaxed: string[] } {
  const relaxed: string[] = [];
  for (const k of ctx.input.rules.softOrder) {
    if (k === "fairness") continue; // a load count is a ranking, not a break
    if (chosen.penalties[k] && chosen.notes[k]) relaxed.push(`${chosen.notes[k]} — no one else available without breaking a higher rule`);
  }
  return { reasons: chosen.reasons, relaxed };
}

function closestFor(ctx: Ctx, service: PlanService, roleIds: string[]): CoreGap["closest"] {
  const rank: Record<Exclusion, number> = { no_response: 0, same_day: 1, on_service: 2, said_no: 3, not_eligible: 9 };
  const seen = new Map<string, { personId: string; name: string; why: string; r: number }>();
  for (const roleId of roleIds) {
    for (const p of ctx.input.people) {
      const ex = exclusion(ctx, p, service, roleId);
      if (!ex || ex === "not_eligible") continue;
      const cur = seen.get(p.id);
      if (!cur || rank[ex] < cur.r) seen.set(p.id, { personId: p.id, name: p.name, why: EXCLUSION_TEXT[ex], r: rank[ex] });
    }
  }
  return [...seen.values()].sort((a, b) => a.r - b.r || a.name.localeCompare(b.name)).slice(0, 5).map(({ r: _r, ...x }) => x);
}

export function planMonth(input: PlanInput): PlanResult {
  const ctx: Ctx = {
    input,
    people: new Map(input.people.map((p) => [p.id, p])),
    households: new Map(input.households.map((h) => [h.id, h])),
    avail: new Map(input.availability.map((a) => [`${a.serviceId}|${a.personId}`, a.response])),
    serveDates: new Map(),
    load: new Map(),
    onService: new Map(),
    personServices: new Map(),
    serviceById: new Map(input.services.map((s) => [s.id, s])),
  };
  for (const h of input.history) ctx.serveDates.set(h.personId, [...(ctx.serveDates.get(h.personId) ?? []), h.date]);

  const planned = new Set(input.rules.plannedRoleIds ?? []);
  const isPlanned = (roleId: string) => input.rules.plannedRoleIds === null || planned.has(roleId);
  const services = [...input.services].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const lockKey = (l: { serviceId: string; roleId: string; slotIndex: number }) => `${l.serviceId}|${l.roleId}|${l.slotIndex}`;
  const locks = new Map(input.locks.map((l) => [lockKey(l), l]));

  // Locks count from the start, wherever they are in the month.
  for (const l of input.locks) {
    const s = ctx.serviceById.get(l.serviceId);
    if (s && l.personId && ctx.people.has(l.personId)) addServe(ctx, l.personId, s);
  }

  const out: PlannedSlot[] = [];
  const coreGaps: CoreGap[] = [];
  const unfilled: PlanResult["unfilled"] = [];
  const result = new Map<string, PlannedSlot>();

  for (const service of services) {
    const slots = service.slots.filter((s) => isPlanned(s.roleId) || locks.has(lockKey({ serviceId: service.id, ...s })));
    const filled = new Map<string, PlannedSlot>();

    // 0. locked slots stay exactly as they are
    for (const s of slots) {
      const l = locks.get(lockKey({ serviceId: service.id, ...s }));
      if (l) {
        filled.set(`${s.roleId}|${s.slotIndex}`, {
          serviceId: service.id, roleId: s.roleId, slotIndex: s.slotIndex, personId: l.personId,
          locked: true, extra: false, reasons: ["Locked"], relaxed: [],
        });
      }
    }

    // A linked service mirrors its partner (already planned earlier the same day).
    const partner = service.linkedServiceId ? ctx.serviceById.get(service.linkedServiceId) : undefined;
    if (partner && partner.date === service.date) {
      for (const s of slots) {
        const key = `${s.roleId}|${s.slotIndex}`;
        if (filled.has(key)) continue;
        const src = result.get(`${partner.id}|${s.roleId}|${s.slotIndex}`);
        if (src?.personId && !exclusion(ctx, ctx.people.get(src.personId)!, service, s.roleId)) {
          addServe(ctx, src.personId, service);
          filled.set(key, { ...src, serviceId: service.id, locked: false, extra: false, reasons: ["Same as the linked service", ...src.reasons], relaxed: src.relaxed });
        }
      }
    }

    const openSlots = () => slots.filter((s) => !filled.has(`${s.roleId}|${s.slotIndex}`));
    const place = (slot: PlanSlot, chosen: { scored: Scored; roleId: string } | null, extraReason?: string) => {
      const key = `${slot.roleId}|${slot.slotIndex}`;
      if (!chosen) return;
      const f = finalize(ctx, chosen.scored);
      addServe(ctx, chosen.scored.person.id, service);
      filled.set(key, {
        serviceId: service.id, roleId: slot.roleId, slotIndex: slot.slotIndex, personId: chosen.scored.person.id,
        locked: false, extra: false, reasons: extraReason ? [extraReason, ...f.reasons] : f.reasons, relaxed: f.relaxed,
      });
    };

    // A leader who plays an instrument while leading (e.g. acoustic) takes
    // that instrument's slot too, if it's still open on this service.
    const leadRoles = new Set(input.rules.leadRoleIds ?? []);
    const comboFill = (personId: string | null, roleId: string) => {
      if (!personId || !leadRoles.has(roleId)) return;
      const p = ctx.people.get(personId);
      const inst = p?.leadsOnRoleId;
      if (!p || !inst || !(inst in p.roles)) return;
      const open = slots.find((x) => x.roleId === inst && !filled.has(`${x.roleId}|${x.slotIndex}`));
      if (!open) return;
      filled.set(`${open.roleId}|${open.slotIndex}`, {
        serviceId: service.id, roleId: open.roleId, slotIndex: open.slotIndex, personId,
        locked: false, extra: false, reasons: [`Plays ${input.roleNames[inst] ?? "their instrument"} while leading`], relaxed: [],
      });
    };
    for (const f of [...filled.values()]) comboFill(f.personId, f.roleId);
    const placeAndCombo = (slot: PlanSlot, chosen: { scored: Scored; roleId: string } | null, extraReason?: string) => {
      place(slot, chosen, extraReason);
      if (chosen) comboFill(chosen.scored.person.id, slot.roleId);
    };

    // 1. core groups first
    for (const g of input.rules.coreGroups) {
      const groupSlots = slots.filter((s) => g.roleIds.includes(s.roleId));
      if (groupSlots.length === 0) continue;
      const already = groupSlots.some((s) => filled.get(`${s.roleId}|${s.slotIndex}`)?.personId);
      if (already) continue;
      const open = groupSlots.filter((s) => !filled.has(`${s.roleId}|${s.slotIndex}`));
      const choice = pick(ctx, service, [...new Set(open.map((s) => s.roleId))]);
      if (!choice) {
        coreGaps.push({ serviceId: service.id, label: g.label, closest: closestFor(ctx, service, g.roleIds) });
        continue;
      }
      const slot = open.find((s) => s.roleId === choice.roleId)!;
      placeAndCombo(slot, choice, `Core role: ${g.label}`);
    }

    // 2. remaining slots, scarcest first (fewest people who could fill it)
    while (openSlots().length) {
      const open = openSlots();
      const counts = open.map((s) => ({
        s,
        n: input.people.filter((p) => !exclusion(ctx, p, service, s.roleId)).length,
      }));
      counts.sort((a, b) => a.n - b.n || a.s.roleId.localeCompare(b.s.roleId) || a.s.slotIndex - b.s.slotIndex);
      const { s } = counts[0];
      const choice = pick(ctx, service, [s.roleId]);
      if (!choice) {
        filled.set(`${s.roleId}|${s.slotIndex}`, {
          serviceId: service.id, roleId: s.roleId, slotIndex: s.slotIndex, personId: null,
          locked: false, extra: false, reasons: ["No one available who plays this"], relaxed: [],
        });
        continue;
      }
      placeAndCombo(s, choice);
    }

    // 3. All-in Sunday: everyone else who said yes joins on their first-choice role
    const extras: PlannedSlot[] = [];
    if (service.isAllIn && input.rules.allIn) {
      const used = new Map<string, number>();
      for (const f of filled.values()) used.set(f.roleId, Math.max(used.get(f.roleId) ?? -1, f.slotIndex));
      const people = [...input.people].sort((a, b) => a.name.localeCompare(b.name));
      for (const p of people) {
        if (ctx.avail.get(`${service.id}|${p.id}`) !== "yes") continue;
        const roles = Object.entries(p.roles).filter(([r]) => isPlanned(r)).sort((a, b) => a[1] - b[1]);
        const role = roles.find(([r]) => !exclusion(ctx, p, service, r));
        if (!role) continue;
        const idx = (used.get(role[0]) ?? -1) + 1;
        if (idx > 9) continue;
        used.set(role[0], idx);
        addServe(ctx, p.id, service);
        extras.push({
          serviceId: service.id, roleId: role[0], slotIndex: idx, personId: p.id, locked: false, extra: true,
          reasons: ["All-in Sunday: everyone available serves", role[1] === 1 ? "First-choice instrument" : `Instrument choice #${role[1]}`],
          relaxed: [],
        });
      }
    }

    for (const s of slots) {
      const f = filled.get(`${s.roleId}|${s.slotIndex}`)!;
      out.push(f);
      result.set(`${service.id}|${s.roleId}|${s.slotIndex}`, f);
      if (!f.personId) unfilled.push({ serviceId: service.id, roleId: s.roleId, slotIndex: s.slotIndex });
    }
    out.push(...extras);
  }

  return { slots: out, coreGaps, unfilled, load: Object.fromEntries(ctx.load) };
}

export interface SlotWarning {
  serviceId: string;
  roleId: string;
  slotIndex: number;
  level: "block" | "warn";
  text: string;
}

/**
 * Check a plan after manual edits. "block" = breaks a hard constraint (allowed
 * as a deliberate override, but shown in red); "warn" = breaks a soft rule.
 */
export function checkPlan(input: PlanInput, slots: PlannedSlot[]): SlotWarning[] {
  const people = new Map(input.people.map((p) => [p.id, p]));
  const avail = new Map(input.availability.map((a) => [`${a.serviceId}|${a.personId}`, a.response]));
  const services = new Map(input.services.map((s) => [s.id, s]));
  const out: SlotWarning[] = [];
  const byPerson = new Map<string, PlannedSlot[]>();
  for (const s of slots) if (s.personId) byPerson.set(s.personId, [...(byPerson.get(s.personId) ?? []), s]);
  const history = new Map<string, string[]>();
  for (const h of input.history) history.set(h.personId, [...(history.get(h.personId) ?? []), h.date]);

  for (const s of slots) {
    if (!s.personId) continue;
    const p = people.get(s.personId);
    const svc = services.get(s.serviceId);
    if (!p || !svc) continue;
    const w = (level: SlotWarning["level"], text: string) => out.push({ serviceId: s.serviceId, roleId: s.roleId, slotIndex: s.slotIndex, level, text });
    const r = avail.get(`${s.serviceId}|${p.id}`);
    if (!(s.roleId in p.roles)) w("block", `${p.name} isn't listed for ${input.roleNames[s.roleId] ?? "this role"}`);
    if (r === "no") w("block", `${p.name} said no for this date`);
    else if (!r) w("warn", `${p.name} hasn't responded for this date`);
    else if (r === "maybe") w("warn", `${p.name} only said maybe`);
    const mine = byPerson.get(p.id) ?? [];
    const here = mine.filter((o) => o.serviceId === s.serviceId);
    const leadCombo =
      here.length === 2 && !!p.leadsOnRoleId &&
      here.some((o) => (input.rules.leadRoleIds ?? []).includes(o.roleId)) && here.some((o) => o.roleId === p.leadsOnRoleId);
    if (here.length > 1 && !leadCombo) w("block", `${p.name} is down for two roles on this service`);
    const sameDay = mine.find((o) => {
      const os = services.get(o.serviceId);
      return os && os.id !== svc.id && os.date === svc.date && os.linkedServiceId !== svc.id && svc.linkedServiceId !== os.id;
    });
    if (sameDay) w("block", `${p.name} is on another service that day`);
    const dates = [...new Set([...mine.map((o) => services.get(o.serviceId)?.date).filter(Boolean) as string[], ...(history.get(p.id) ?? [])])];
    const gap = input.rules.restGapWeeks * 7;
    if (input.rules.softOrder.includes("rest_gap") && dates.some((d) => d !== svc.date && daysBetween(d, svc.date) <= gap))
      w("warn", `${p.name} serves within ${input.rules.restGapWeeks} week${input.rules.restGapWeeks === 1 ? "" : "s"} of this`);
    const cap = p.maxPerMonth ?? input.rules.defaultMaxPerMonth;
    const monthDates = new Set(mine.map((o) => services.get(o.serviceId)?.date));
    if (input.rules.softOrder.includes("monthly_cap") && cap != null && monthDates.size > cap)
      w("warn", `${p.name} is down ${monthDates.size} times this month (limit ${cap})`);
  }
  return out;
}

/** Suggested households from shared surnames — suggestions only, never applied automatically. */
export function suggestHouseholds(people: { id: string; name: string; householdId: string | null }[]): { surname: string; personIds: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const p of people) {
    if (p.householdId) continue;
    const parts = p.name.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const surname = parts[parts.length - 1].replace(/[^A-Za-z'-]/g, "");
    if (surname.length < 3) continue; // "Tim D" — an initial isn't a surname
    const key = surname.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), p.id]);
  }
  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([k, personIds]) => ({ surname: k.charAt(0).toUpperCase() + k.slice(1), personIds }));
}
