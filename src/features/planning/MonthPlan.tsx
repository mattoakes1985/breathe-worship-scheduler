// WO-3 month plan: run the auto-planner, then adjust by hand. Every slot shows
// why it was filled, which soft rules were relaxed, and warnings for manual picks.
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Info, Lock, Sparkles, Unlock, Users, Wand2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, EmptyState, ErrorState, Modal, Spinner } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { checkPlan, planMonth, type SlotWarning } from "@/lib/scheduling-engine/monthPlanner";
import {
  buildPlanInput,
  mergedAvailability,
  parseLinks,
  rulesToPlanRules,
  savePlan,
  savedSlots,
  shiftMonth,
  shortRole,
  useInvalidatePlanner,
  usePlannerBase,
  usePlannerMonth,
  type MonthService,
} from "./data";

const monthLabel = (m: string) => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export default function MonthPlan({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const base = usePlannerBase();
  const monthQ = usePlannerMonth(month);
  const invalidate = useInvalidatePlanner();
  const [confirmRun, setConfirmRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = base.data && monthQ.data;

  const analysis = useMemo(() => {
    if (!ready) return null;
    // Re-plan with every current pick held, to find what still can't be filled.
    const held = planMonth(buildPlanInput(month, base.data!, monthQ.data!, { keepUnlocked: true }));
    const input = buildPlanInput(month, base.data!, monthQ.data!, { keepUnlocked: false });
    const warnings = checkPlan(input, savedSlots(monthQ.data!));
    return { coreGaps: held.coreGaps, warnings, input };
  }, [ready, base.data, monthQ.data, month]);

  const run = useMutation({
    mutationFn: async () => {
      const input = buildPlanInput(month, base.data!, monthQ.data!, { keepUnlocked: false });
      const result = planMonth(input);
      await savePlan(result.slots, monthQ.data!.slots);
      return result;
    },
    onSuccess: () => {
      setConfirmRun(false);
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  if (base.isLoading || monthQ.isLoading) return <Spinner label="Loading the month…" />;
  if (base.error || monthQ.error) return <ErrorState message={(base.error ?? monthQ.error)!.message} retry={() => { base.refetch(); monthQ.refetch(); }} />;
  const { people, roles } = base.data!;
  const { services, slots, requests } = monthQ.data!;
  const personName = new Map(people.map((p) => [p.id, p.display_name]));
  const roleName = new Map(roles.map((r) => [r.id, r.name]));
  const roleOrder = new Map(roles.map((r) => [r.id, r.sort_order]));
  const plannedSlots = slots.filter((s) => s.person_id);
  const unlockedPicks = slots.filter((s) => s.person_id && !s.locked).length;
  const plannedRoleIds = rulesToPlanRules(base.data!.rules).plannedRoleIds;
  const totalSlots = services.reduce((n, s) => n + s.requirements.filter((r) => !plannedRoleIds || plannedRoleIds.includes(r.role_id)).reduce((m, r) => m + r.quantity_required, 0), 0);

  const load = new Map<string, number>();
  const seenDay = new Set<string>();
  for (const s of plannedSlots) {
    const svc = services.find((x) => x.id === s.service_id);
    const k = `${s.person_id}|${svc?.service_date}`;
    if (seenDay.has(k)) continue;
    seenDay.add(k);
    load.set(s.person_id!, (load.get(s.person_id!) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button className="btn-ghost px-2" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={20} /></button>
        <div className="text-center min-w-0">
          <h2 className="font-display font-bold text-lg">{monthLabel(month)}</h2>
          <p className="text-soft text-xs">
            {services.length} service{services.length === 1 ? "" : "s"} · {plannedSlots.length} picks{totalSlots ? ` for ${totalSlots} slots` : ""}
          </p>
        </div>
        <button className="btn-ghost px-2" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={20} /></button>
      </div>

      {services.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="No services this month" body="Create the Sundays from a service template first, then come back to plan them." />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary flex-1 sm:flex-none" disabled={run.isPending} onClick={() => (unlockedPicks ? setConfirmRun(true) : run.mutate())}>
              <Wand2 size={16} /> {run.isPending ? "Planning…" : plannedSlots.length ? "Re-plan the month" : "Plan the month"}
            </button>
          </div>
          {error && <p className="text-danger text-sm" role="alert">{error}</p>}

          {analysis!.coreGaps.length > 0 && (
            <Card className="!border-danger/40 bg-danger-soft/40">
              <h3 className="flex items-center gap-2 font-semibold text-danger"><AlertOctagon size={18} /> Core roles nobody can fill</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {analysis!.coreGaps.map((g, i) => {
                  const svc = services.find((s) => s.id === g.serviceId);
                  return (
                    <li key={i}>
                      <span className="font-semibold">{formatDate(svc?.service_date)} {formatTime(svc?.start_time)} — {g.label}</span>
                      <span className="block text-soft">
                        {g.closest.length
                          ? "Closest: " + g.closest.map((c) => `${c.name} (${c.why})`).join(", ")
                          : "Nobody on the team list plays this. Add instruments in Team list."}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {requests.length > 0 && <Requests requests={requests} personName={personName} />}

          <div className="grid gap-3 lg:grid-cols-2">
            {services.map((s) => (
              <ServiceCard
                key={s.id}
                service={s}
                month={month}
                warnings={analysis!.warnings.filter((w) => w.serviceId === s.id)}
                roleName={roleName}
                roleOrder={roleOrder}
              />
            ))}
          </div>

          {load.size > 0 && (
            <details className="card p-4">
              <summary className="cursor-pointer font-semibold text-sm flex items-center gap-2"><Users size={16} /> How often each person serves this month</summary>
              <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                {[...load.entries()].sort((a, b) => b[1] - a[1] || (personName.get(a[0]) ?? "").localeCompare(personName.get(b[0]) ?? "")).map(([id, n]) => (
                  <li key={id} className="flex justify-between gap-2"><span className="truncate">{personName.get(id)}</span><span className="font-semibold tabular-nums">{n}</span></li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <Modal open={confirmRun} onClose={() => setConfirmRun(false)} title="Re-plan the month?">
        <p className="text-sm text-soft">
          This replaces the {unlockedPicks} unlocked pick{unlockedPicks === 1 ? "" : "s"}. Locked slots (anything you picked by hand, or locked yourself) stay exactly as they are.
        </p>
        <div className="flex gap-2 mt-4 justify-end">
          <button className="btn-secondary" onClick={() => setConfirmRun(false)}>Cancel</button>
          <button className="btn-primary" disabled={run.isPending} onClick={() => run.mutate()}><Wand2 size={16} /> Re-plan</button>
        </div>
      </Modal>
    </div>
  );
}

function Requests({ requests, personName }: { requests: { raw_name: string; person_id: string | null; request_note: string; submitted_at: string | null }[]; personName: Map<string, string> }) {
  const latest = new Map<string, (typeof requests)[number]>();
  for (const r of requests) {
    const k = r.person_id ?? r.raw_name;
    const cur = latest.get(k);
    if (!cur || (r.submitted_at ?? "") > (cur.submitted_at ?? "")) latest.set(k, r);
  }
  return (
    <Card>
      <h3 className="flex items-center gap-2 font-semibold text-sm"><Info size={16} className="text-info" /> Requests from the form</h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {[...latest.values()].map((r, i) => (
          <li key={i}><span className="font-semibold">{(r.person_id && personName.get(r.person_id)) || r.raw_name}:</span> <span className="text-soft">{r.request_note}</span></li>
        ))}
      </ul>
    </Card>
  );
}

function ServiceCard({
  service,
  month,
  warnings,
  roleName,
  roleOrder,
}: {
  service: MonthService;
  month: string;
  warnings: SlotWarning[];
  roleName: Map<string, string>;
  roleOrder: Map<string, number>;
}) {
  const base = usePlannerBase().data!;
  const data = usePlannerMonth(month).data!;
  const invalidate = useInvalidatePlanner();
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const avail = useMemo(() => mergedAvailability(base, data).filter((a) => a.serviceId === service.id), [base, data, service.id]);
  const response = new Map(avail.map((a) => [a.personId, a.response]));
  const active = base.people.filter((p) => p.is_active);
  const slotRows = data.slots.filter((s) => s.service_id === service.id);

  const plannedRoles = useMemo(() => rulesToPlanRules(base.rules).plannedRoleIds, [base.rules]);
  const rows = useMemo(() => {
    const r = service.requirements
      .filter((q) => !plannedRoles || plannedRoles.includes(q.role_id))
      .flatMap((q) => Array.from({ length: q.quantity_required }, (_, i) => ({ roleId: q.role_id, slotIndex: i })));
    for (const s of slotRows) if (s.person_id && !r.some((x) => x.roleId === s.role_id && x.slotIndex === s.slot_index)) r.push({ roleId: s.role_id, slotIndex: s.slot_index });
    return r.sort((a, b) => (roleOrder.get(a.roleId) ?? 99) - (roleOrder.get(b.roleId) ?? 99) || a.slotIndex - b.slotIndex);
  }, [service.requirements, slotRows, roleOrder, plannedRoles]);

  const onService = new Set(slotRows.filter((s) => s.person_id).map((s) => s.person_id!));
  const free = active.filter((p) => !onService.has(p.id));
  const yesFree = free.filter((p) => response.get(p.id) === "yes");
  const maybeFree = free.filter((p) => response.get(p.id) === "maybe");
  const noResponse = active.filter((p) => !response.has(p.id)).length;

  const save = useMutation({
    mutationFn: async (args: { roleId: string; slotIndex: number; personId?: string | null; locked?: boolean }) => {
      const existing = slotRows.find((s) => s.role_id === args.roleId && s.slot_index === args.slotIndex);
      const manual = args.personId !== undefined;
      const row = {
        service_id: service.id,
        role_id: args.roleId,
        slot_index: args.slotIndex,
        person_id: manual ? args.personId : existing?.person_id ?? null,
        locked: manual ? true : args.locked ?? false,
        source: manual ? "manual" : existing?.source ?? "auto",
        reasons: manual ? ["Picked by hand"] : existing?.reasons ?? [],
        relaxed: manual ? [] : existing?.relaxed ?? [],
      };
      const rowsToSave = [row];
      // Picking someone whose role has an "only with" / "usually with" pairing
      // fills the paired slot too, unless it's locked to someone else.
      const picked = manual && args.personId ? base.people.find((p) => p.id === args.personId) : undefined;
      for (const l of picked ? parseLinks(picked.role_links) : []) {
        if (l.role !== args.roleId || l.mode === "can") continue;
        const inst = slotRows.find((s) => s.role_id === l.with && s.slot_index === 0);
        const hasSlot = service.requirements.some((q) => q.role_id === l.with && q.quantity_required > 0);
        if (!hasSlot || (inst?.person_id && inst.person_id !== picked!.id && (inst.locked || l.mode === "also"))) continue;
        rowsToSave.push({
          service_id: service.id, role_id: l.with, slot_index: 0, person_id: picked!.id, locked: true, source: "manual",
          reasons: [l.mode === "requires" ? `Only does ${roleName.get(l.role) ?? "this"} with ${roleName.get(l.with) ?? "that"}` : `Usually plays ${roleName.get(l.with) ?? "that"} with ${roleName.get(l.role) ?? "this"}`],
          relaxed: [],
        });
      }
      const { error } = await supabase.from("rota_plan_slots").upsert(rowsToSave, { onConflict: "service_id,role_id,slot_index" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setErr(null); invalidate(); },
    onError: (e: Error) => setErr(e.message),
  });

  const allIn = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase.from("services").update({ is_all_in: value }).eq("id", service.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <p className="font-semibold">{formatDate(service.service_date)}</p>
          <p className="text-soft text-xs truncate">{formatTime(service.start_time)} · {service.title}</p>
        </div>
        <button
          className={`chip min-h-[36px] shrink-0 ${service.is_all_in ? "bg-accent text-white dark:text-brand-ink" : "bg-raised text-soft"}`}
          aria-pressed={service.is_all_in}
          onClick={() => allIn.mutate(!service.is_all_in)}
          title="On an All-in Sunday everyone who said yes serves"
        >
          All-in{service.is_all_in ? " ✓" : ""}
        </button>
      </div>
      <ul className="divide-y divide-line">
        {rows.map(({ roleId, slotIndex }) => {
          const slot = slotRows.find((s) => s.role_id === roleId && s.slot_index === slotIndex);
          const k = `${roleId}|${slotIndex}`;
          const w = warnings.filter((x) => x.roleId === roleId && x.slotIndex === slotIndex);
          const blocking = w.some((x) => x.level === "block");
          const players = active.filter((p) => roleId in p.roles);
          const groups: [string, typeof active][] = [
            ["Said yes", players.filter((p) => response.get(p.id) === "yes")],
            ["Said maybe", players.filter((p) => response.get(p.id) === "maybe")],
            ["Plays this — no answer", players.filter((p) => !response.has(p.id))],
            ["Plays this — said no", players.filter((p) => response.get(p.id) === "no")],
          ];
          return (
            <li key={k} className="px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs font-semibold text-soft">{shortRole(roleName.get(roleId) ?? "")}{slotIndex > 0 ? ` ${slotIndex + 1}` : ""}</span>
                <select
                  className={`input !min-h-[40px] !py-1 text-sm flex-1 min-w-0 ${!slot?.person_id ? "text-faint" : ""} ${blocking ? "!border-danger" : ""}`}
                  aria-label={`${roleName.get(roleId)} on ${formatDate(service.service_date)}`}
                  value={slot?.person_id ?? ""}
                  onChange={(e) => save.mutate({ roleId, slotIndex, personId: e.target.value || null })}
                >
                  <option value="">— nobody —</option>
                  {groups.map(([label, list]) =>
                    list.length ? (
                      <optgroup key={label} label={label}>
                        {list.map((p) => <option key={p.id} value={p.id}>{p.display_name}{onService.has(p.id) && p.id !== slot?.person_id ? " (already on)" : ""}</option>)}
                      </optgroup>
                    ) : null
                  )}
                  {slot?.person_id && !players.some((p) => p.id === slot.person_id) && (
                    <option value={slot.person_id}>{base.people.find((p) => p.id === slot.person_id)?.display_name ?? "Someone"} (not listed for this)</option>
                  )}
                </select>
                {w.length > 0 && (blocking ? <AlertOctagon size={18} className="text-danger shrink-0" aria-label="Breaks a hard rule" /> : <AlertTriangle size={18} className="text-warning shrink-0" aria-label="Breaks a soft rule" />)}
                <button
                  className={`btn-ghost !min-h-[40px] px-2 shrink-0 ${slot?.locked ? "text-accent-strong" : "text-faint"}`}
                  aria-label={slot?.locked ? "Unlock this slot" : "Lock this slot"}
                  aria-pressed={!!slot?.locked}
                  onClick={() => save.mutate({ roleId, slotIndex, locked: !slot?.locked })}
                >
                  {slot?.locked ? <Lock size={16} /> : <Unlock size={16} />}
                </button>
                <button className="btn-ghost !min-h-[40px] px-1.5 shrink-0" aria-label="Why?" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
                  <ChevronDown size={16} className={`transition-transform ${open === k ? "rotate-180" : ""}`} />
                </button>
              </div>
              {open === k && (
                <div className="mt-2 ml-[4.5rem] text-xs space-y-1">
                  {w.map((x, i) => <p key={i} className={x.level === "block" ? "text-danger" : "text-warning"}>{x.text}</p>)}
                  {(slot?.relaxed ?? []).map((t, i) => <p key={i} className="text-warning">Rule relaxed: {t}</p>)}
                  {(slot?.reasons ?? []).length ? <p className="text-soft">{slot!.reasons.join(" · ")}</p> : <p className="text-faint">Not planned yet.</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="px-4 py-3 bg-raised/40 text-xs space-y-1">
        <p><span className="font-semibold">Free and said yes:</span> {yesFree.length ? yesFree.map((p) => p.display_name).join(", ") : "nobody"}</p>
        {maybeFree.length > 0 && <p><span className="font-semibold">Maybe:</span> {maybeFree.map((p) => p.display_name).join(", ")}</p>}
        <p className="text-faint">{noResponse} on the team list haven't answered for this date.</p>
        {service.is_all_in && <Badge tone="accent">Everyone who said yes is added when you plan</Badge>}
        {err && <p className="text-danger" role="alert">{err}</p>}
      </div>
    </Card>
  );
}
