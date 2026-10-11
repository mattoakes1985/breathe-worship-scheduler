// Data access for the monthly planner (WO-3). Planner tables are readable by
// admins and team leads only (RLS); everything here assumes that role.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/database.types";
import {
  DEFAULT_SOFT_ORDER,
  type PlanInput,
  type PlanLock,
  type PlannedSlot,
  type PlanRules,
  type SoftRuleKind,
} from "@/lib/scheduling-engine/monthPlanner";

export type Person = Tables<"team_people"> & {
  roles: Record<string, number>;
  aliases: { id: string; alias: string; source: string }[];
  lastServed: string | null;
  servesLastYear: number;
};
export type Household = Tables<"households">;
export type Rule = Tables<"scheduling_rules">;
export type Role = Pick<Tables<"roles">, "id" | "name" | "sort_order">;

export const ROLE_SHORT: Record<string, string> = {
  "Worship Leader": "Lead",
  Vocalist: "Vox",
  "Backing Vocals": "BV",
  "Acoustic Guitar": "Acoustic",
  "Electric Guitar": "Electric",
  "Keys/Piano": "Keys",
  "Sound Engineer": "Sound",
  "ProPresenter/Slides": "Slides",
  "Livestream/Camera": "Camera",
};
export const shortRole = (name: string) => ROLE_SHORT[name] ?? name;

async function must<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as T;
}

/** Team list, roles, households and rules: the planner's slow-changing base data. */
export function usePlannerBase() {
  return useQuery({
    queryKey: ["planner-base"],
    queryFn: async () => {
      const [people, roles, personRoles, aliases, households, rules, activity, team] = await Promise.all([
        must(supabase.from("team_people").select("*").is("merged_into_id", null).order("display_name")),
        must(supabase.from("roles").select("id, name, sort_order").eq("is_active", true).order("sort_order")),
        must(supabase.from("person_roles").select("*")),
        must(supabase.from("name_aliases").select("id, person_id, alias, source").order("alias")),
        must(supabase.from("households").select("*").order("name")),
        must(supabase.from("scheduling_rules").select("*").order("priority")),
        must(supabase.from("team_people_activity").select("*")),
        must(supabase.from("teams").select("id").order("created_at").limit(1)),
      ]);
      const act = new Map(activity.map((a) => [a.person_id, a]));
      const list: Person[] = people.map((p) => ({
        ...p,
        roles: Object.fromEntries(personRoles.filter((r) => r.person_id === p.id).map((r) => [r.role_id, r.rank])),
        aliases: aliases.filter((a) => a.person_id === p.id),
        lastServed: act.get(p.id)?.last_served ?? null,
        servesLastYear: Number(act.get(p.id)?.serves_last_year ?? 0),
      }));
      return {
        teamId: team[0]?.id as string,
        people: list,
        roles: roles as Role[],
        households,
        rules,
        aliasMap: new Map(aliases.map((a) => [a.alias.replace(/[ \s]+/g, " ").trim().toLowerCase(), a.person_id])),
      };
    },
  });
}

export function useInvalidatePlanner() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["planner-base"] });
    qc.invalidateQueries({ queryKey: ["planner-month"] });
  };
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export type MonthService = Pick<Tables<"services">, "id" | "title" | "service_date" | "start_time" | "status" | "is_all_in" | "linked_service_id"> & {
  requirements: { role_id: string; quantity_required: number }[];
};

/** Everything needed to plan one month. */
export function usePlannerMonth(month: string) {
  return useQuery({
    queryKey: ["planner-month", month],
    queryFn: async () => {
      const { from, to } = monthRange(month);
      const services = await must(
        supabase
          .from("services")
          .select("id, title, service_date, start_time, status, is_all_in, linked_service_id, service_role_requirements(role_id, quantity_required)")
          .is("archived_at", null)
          .neq("status", "cancelled")
          .gte("service_date", from)
          .lte("service_date", to)
          .order("service_date")
          .order("start_time")
      );
      const ids = services.map((s) => s.id);
      // history window: 10 weeks before the month (rest gap + fairness)
      const histFrom = new Date(+from.slice(0, 4), +from.slice(5, 7) - 1, 1 - 70);
      const histFromIso = `${histFrom.getFullYear()}-${String(histFrom.getMonth() + 1).padStart(2, "0")}-${String(histFrom.getDate()).padStart(2, "0")}`;
      const [avail, appAvail, slots, requests, legacy, pastSlots] = await Promise.all([
        ids.length ? must(supabase.from("person_availability").select("service_id, person_id, response").in("service_id", ids)) : [],
        // people who use the app themselves answer in-app; those answers count too
        ids.length ? must(supabase.from("availability_responses").select("service_id, profile_id, response").in("service_id", ids)) : [],
        ids.length ? must(supabase.from("rota_plan_slots").select("*").in("service_id", ids)) : [],
        must(
          supabase
            .from("availability_import_rows")
            .select("raw_name, person_id, request_note, submitted_at, availability_imports!inner(month, imported_at)")
            .eq("availability_imports.month", from)
            .not("request_note", "is", null)
        ),
        must(
          supabase
            .from("legacy_assignments")
            .select("person_name, services!inner(service_date)")
            .gte("services.service_date", histFromIso)
            .lt("services.service_date", from)
            .limit(1000)
        ),
        must(
          supabase
            .from("rota_plan_slots")
            .select("person_id, services!inner(service_date, archived_at)")
            .not("person_id", "is", null)
            .is("services.archived_at", null)
            .gte("services.service_date", histFromIso)
            .lt("services.service_date", from)
            .limit(1000)
        ),
      ]);
      return {
        services: services.map(({ service_role_requirements, ...s }) => ({ ...s, requirements: service_role_requirements ?? [] })) as MonthService[],
        availability: avail,
        appAvailability: appAvail,
        slots,
        requests: requests as unknown as { raw_name: string; person_id: string | null; request_note: string; submitted_at: string | null }[],
        legacyHistory: (legacy as unknown as { person_name: string; services: { service_date: string } }[]).map((l) => ({
          name: l.person_name,
          date: l.services.service_date,
        })),
        planHistory: (pastSlots as unknown as { person_id: string; services: { service_date: string } }[]).map((p) => ({
          personId: p.person_id,
          date: p.services.service_date,
        })),
      };
    },
  });
}

export function rulesToPlanRules(rules: Rule[]): PlanRules {
  const get = (k: string) => rules.find((r) => r.kind === k && r.enabled);
  const params = (r: Rule | undefined) => (r?.params ?? {}) as Record<string, unknown>;
  const planned = get("planned_roles");
  const core = get("core_roles");
  const cap = get("monthly_cap");
  const rest = get("rest_gap");
  // "availability" (Yes before Maybe) sits just after the rest week unless Matt moves it.
  const ordered = rules
    .filter((r) => r.enabled && ["monthly_cap", "rest_gap", "households", "fairness"].includes(r.kind))
    .sort((a, b) => a.priority - b.priority)
    .map((r) => ({ kind: r.kind as SoftRuleKind, priority: r.priority }));
  ordered.push({ kind: "availability", priority: 35 });
  ordered.sort((a, b) => a.priority - b.priority);
  return {
    plannedRoleIds: planned ? ((params(planned).role_ids as string[]) ?? null) : null,
    coreGroups: core ? ((params(core).groups as { label: string; role_ids: string[] }[]) ?? []).map((g) => ({ label: g.label, roleIds: g.role_ids ?? [] })) : [],
    allIn: !!get("all_in"),
    softOrder: ordered.length ? ordered.map((o) => o.kind) : DEFAULT_SOFT_ORDER,
    restGapWeeks: rest ? Number(params(rest).weeks ?? 1) : 0,
    leadRoleIds: leadRoleIdsFrom(rules),
    defaultMaxPerMonth: cap ? ((params(cap).default_max as number | null) ?? null) : null,
  };
}

/** Roles that count as leading: the core group labelled "Lead" if there is one. */
function leadRoleIdsFrom(rules: Rule[]): string[] {
  const core = rules.find((r) => r.kind === "core_roles");
  const groups = ((core?.params ?? {}) as { groups?: { label: string; role_ids: string[] }[] }).groups ?? [];
  return groups.find((g) => /^lead/i.test(g.label))?.role_ids ?? [];
}

type Base = NonNullable<ReturnType<typeof usePlannerBase>["data"]>;
type MonthData = NonNullable<ReturnType<typeof usePlannerMonth>["data"]>;

export function buildPlanInput(month: string, base: Base, data: MonthData, opts: { keepUnlocked: boolean }): PlanInput {
  const rules = rulesToPlanRules(base.rules);
  const leaderRole = base.roles.find((r) => r.name === "Worship Leader");
  if (leaderRole && !(rules.leadRoleIds ?? []).includes(leaderRole.id)) rules.leadRoleIds = [...(rules.leadRoleIds ?? []), leaderRole.id];
  const active = base.people.filter((p) => p.is_active);
  const key = (s: string) => s.replace(/[ \s]+/g, " ").trim().toLowerCase();
  const history = [
    ...data.legacyHistory.map((h) => ({ personId: base.aliasMap.get(key(h.name)) ?? "", date: h.date })).filter((h) => h.personId),
    ...data.planHistory,
  ];
  const locks: PlanLock[] = data.slots
    .filter((s) => s.locked || (opts.keepUnlocked && s.person_id))
    .map((s) => ({ serviceId: s.service_id, roleId: s.role_id, slotIndex: s.slot_index, personId: s.person_id }));
  return {
    month,
    services: data.services.map((s) => {
      const slots = s.requirements.flatMap((r) => Array.from({ length: Math.max(0, r.quantity_required) }, (_, i) => ({ roleId: r.role_id, slotIndex: i })));
      // locked extra slots (e.g. All-in additions) stay part of the service
      for (const l of locks) {
        if (l.serviceId === s.id && !slots.some((x) => x.roleId === l.roleId && x.slotIndex === l.slotIndex)) slots.push({ roleId: l.roleId, slotIndex: l.slotIndex });
      }
      return { id: s.id, date: s.service_date, startTime: (s.start_time ?? "").slice(0, 5), isAllIn: s.is_all_in, linkedServiceId: s.linked_service_id, slots };
    }),
    people: active.map((p) => ({ id: p.id, name: p.display_name, roles: p.roles, maxPerMonth: p.max_per_month, householdId: p.household_id, leadsOnRoleId: p.leads_on_role_id })),
    households: base.households.map((h) => ({ id: h.id, preference: h.preference as "together" | "apart" | "none" })),
    availability: mergedAvailability(base, data),
    history,
    locks,
    rules,
    roleNames: Object.fromEntries(base.roles.map((r) => [r.id, r.name])),
  };
}

/** Form answers win; an in-app answer fills in when the form has nothing for that person and date. */
export function mergedAvailability(base: Base, data: MonthData) {
  const byProfile = new Map(base.people.filter((p) => p.profile_id).map((p) => [p.profile_id!, p.id]));
  const out = new Map<string, { personId: string; serviceId: string; response: "yes" | "no" | "maybe" }>();
  for (const a of data.appAvailability) {
    const pid = byProfile.get(a.profile_id);
    if (pid) out.set(`${a.service_id}|${pid}`, { personId: pid, serviceId: a.service_id, response: a.response as "yes" | "no" | "maybe" });
  }
  for (const a of data.availability) out.set(`${a.service_id}|${a.person_id}`, { personId: a.person_id, serviceId: a.service_id, response: a.response as "yes" | "no" | "maybe" });
  return [...out.values()];
}

/** Current saved plan as engine slots (for checkPlan and display). */
export function savedSlots(data: MonthData): PlannedSlot[] {
  return data.slots.map((s) => ({
    serviceId: s.service_id,
    roleId: s.role_id,
    slotIndex: s.slot_index,
    personId: s.person_id,
    locked: s.locked,
    extra: false,
    reasons: s.reasons ?? [],
    relaxed: s.relaxed ?? [],
  }));
}

/** Persist a computed plan. Locked rows are never touched; extras that are no
 *  longer used are emptied (not deleted). */
export async function savePlan(planned: PlannedSlot[], existing: MonthData["slots"]) {
  const rows = planned
    .filter((s) => !s.locked)
    .map((s) => ({
      service_id: s.serviceId,
      role_id: s.roleId,
      slot_index: s.slotIndex,
      person_id: s.personId,
      locked: false,
      source: "auto",
      reasons: s.reasons.slice(0, 12),
      relaxed: s.relaxed.slice(0, 12),
    }));
  const keys = new Set(planned.map((s) => `${s.serviceId}|${s.roleId}|${s.slotIndex}`));
  for (const e of existing) {
    if (!e.locked && e.person_id && !keys.has(`${e.service_id}|${e.role_id}|${e.slot_index}`)) {
      rows.push({ service_id: e.service_id, role_id: e.role_id, slot_index: e.slot_index, person_id: null, locked: false, source: "auto", reasons: [], relaxed: [] });
    }
  }
  if (!rows.length) return;
  const { error } = await supabase.from("rota_plan_slots").upsert(rows, { onConflict: "service_id,role_id,slot_index" });
  if (error) throw new Error(error.message);
}
