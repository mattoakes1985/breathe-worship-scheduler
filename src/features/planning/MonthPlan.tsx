// WO-3 month plan: run the auto-planner, then adjust by hand. Every slot shows
// why it was filled, which soft rules were relaxed, and warnings for manual picks.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PersonPicker from "./PersonPicker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, CheckCircle2, FileUp, ChevronDown, ChevronLeft, ChevronRight, Info, Lock, Send, Sparkles, Unlock, Users, Wand2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, EmptyState, ErrorState, Modal, Spinner } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { checkPlan, planMonth, type SlotWarning } from "@/lib/scheduling-engine/monthPlanner";
import {
  buildPlanInput,
  mergedAvailability,
  publishMonth,
  rulesToPlanRules,
  type PublishResult,
  savePick,
  savePlan,
  savedSlots,
  setAvailabilityByHand,
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
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [published, setPublished] = useState<PublishResult | null>(null);
  const qc = useQueryClient();

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

  const publish = useMutation({
    mutationFn: () => publishMonth(month),
    onSuccess: (r) => {
      setConfirmPublish(false);
      setPublished(r);
      invalidate();
      // Home, the service page and the calendar all read published services/assignments.
      for (const k of ["dashboard", "team-lead-dashboard", "service-detail", "master-schedule", "rota-builder", "admin-services"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: Error) => { setConfirmPublish(false); setError(e.message); },
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
  const lastPublished = services.reduce<string | null>((m, s) => (s.published_at && (!m || s.published_at > m) ? s.published_at : m), null);
  const changedSincePublish = !!lastPublished && slots.some((x) => (x.updated_at ?? "") > lastPublished);
  const linkedPeople = new Set(people.filter((p) => p.profile_id).map((p) => p.id));
  const linkedPicks = plannedSlots.filter((x) => linkedPeople.has(x.person_id!)).length;
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
        <EmptyState
          icon={<Sparkles />}
          title="No services this month yet"
          body="Import this month's availability form — each date in it becomes a service or event, ready to plan."
          action={<Link className="btn-primary" to={`/team-lead/planner?tab=import&m=${month}`}><FileUp size={16} /> Import the form</Link>}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary flex-1 sm:flex-none" disabled={run.isPending} onClick={() => (unlockedPicks ? setConfirmRun(true) : run.mutate())}>
              <Wand2 size={16} /> {run.isPending ? "Planning…" : plannedSlots.length ? "Re-plan the month" : "Plan the month"}
            </button>
            <button className="btn-secondary flex-1 sm:flex-none" disabled={publish.isPending || plannedSlots.length === 0} onClick={() => setConfirmPublish(true)}>
              <Send size={16} /> {publish.isPending ? "Publishing…" : lastPublished ? "Publish again" : "Publish the month"}
            </button>
          </div>
          {lastPublished && (
            <p className="flex items-center gap-1.5 text-xs text-soft">
              <CheckCircle2 size={14} className="text-success" />
              Published {new Date(lastPublished).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              {changedSincePublish && <span className="text-warning font-semibold"> · changed since — publish again so leaders see it</span>}
            </p>
          )}
          {published && (
            <p className="text-sm text-success" role="status">
              Published {published.services} service{published.services === 1 ? "" : "s"}.
              {published.assignments_added + published.assignments_removed > 0 && ` ${published.assignments_added} added to people's Home and calendar${published.assignments_removed ? `, ${published.assignments_removed} taken off` : ""}.`}
            </p>
          )}
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

      <Modal open={confirmPublish} onClose={() => setConfirmPublish(false)} title={`Publish ${monthLabel(month)}?`}>
        <div className="text-sm text-soft space-y-2">
          <p>Each service's band is copied onto its service page, and the services become visible to everyone signed in to the app.</p>
          <p>
            {linkedPicks
              ? `${linkedPicks} pick${linkedPicks === 1 ? " is" : "s are"} for people linked to an app account. They'll see those Sundays on Home and in their calendar, and whoever is leading can choose the songs and running order.`
              : "Nobody in this month's plan is linked to an app account yet, so no one will get it on their Home page. Link accounts in Team list."}
          </p>
          <p>No one is asked to confirm. You can change the plan and publish again at any time.</p>
        </div>
        <div className="flex gap-2 mt-4 justify-end">
          <button className="btn-secondary" onClick={() => setConfirmPublish(false)}>Cancel</button>
          <button className="btn-primary" disabled={publish.isPending} onClick={() => publish.mutate()}><Send size={16} /> Publish</button>
        </div>
      </Modal>

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
    const r: { roleId: string; slotIndex: number; optional?: boolean }[] = service.requirements
      .filter((q) => !plannedRoles || plannedRoles.includes(q.role_id))
      .flatMap((q) => {
        const total = Math.max(q.quantity_required, base.gridCapacity[q.role_id] ?? 0);
        return Array.from({ length: total }, (_, i) => ({ roleId: q.role_id, slotIndex: i, optional: i >= q.quantity_required }));
      });
    for (const s of slotRows) if (s.person_id && !r.some((x) => x.roleId === s.role_id && x.slotIndex === s.slot_index)) r.push({ roleId: s.role_id, slotIndex: s.slot_index, optional: true });
    return r.sort((a, b) => (roleOrder.get(a.roleId) ?? 99) - (roleOrder.get(b.roleId) ?? 99) || a.slotIndex - b.slotIndex);
  }, [service.requirements, slotRows, roleOrder, plannedRoles, base.gridCapacity]);

  const onService = new Set(slotRows.filter((s) => s.person_id).map((s) => s.person_id!));
  const free = active.filter((p) => !onService.has(p.id));
  const yesFree = free.filter((p) => response.get(p.id) === "yes");
  const maybeFree = free.filter((p) => response.get(p.id) === "maybe");
  const noResponse = active.filter((p) => !response.has(p.id)).length;

  const save = useMutation({
    mutationFn: async (args: { roleId: string; slotIndex: number; personId?: string | null; locked?: boolean }) => {
      if (args.personId !== undefined) {
        await savePick({
          serviceId: service.id, roleId: args.roleId, slotIndex: args.slotIndex, personId: args.personId, people: base.people, slots: slotRows, roleNames: roleName,
          hasRole: (r) => service.requirements.some((q) => q.role_id === r && q.quantity_required > 0),
        });
        return;
      }
      const existing = slotRows.find((s) => s.role_id === args.roleId && s.slot_index === args.slotIndex);
      const { error } = await supabase.from("rota_plan_slots").upsert({
        service_id: service.id, role_id: args.roleId, slot_index: args.slotIndex, person_id: existing?.person_id ?? null,
        locked: args.locked ?? false, source: existing?.source ?? "auto", reasons: existing?.reasons ?? [], relaxed: existing?.relaxed ?? [],
      }, { onConflict: "service_id,role_id,slot_index" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setErr(null); invalidate(); },
    onError: (e: Error) => setErr(e.message),
  });

  const [handPerson, setHandPerson] = useState("");
  const byHand = useMutation({
    mutationFn: async (r: "yes" | "maybe" | "no") => {
      if (!handPerson) return;
      await setAvailabilityByHand(service.id, handPerson, r);
    },
    onSuccess: () => { setHandPerson(""); setErr(null); invalidate(); },
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
          title="All-in: no kids church, everyone's in the service (a label only)"
        >
          All-in{service.is_all_in ? " ✓" : ""}
        </button>
      </div>
      <ul className="divide-y divide-line">
        {rows.map(({ roleId, slotIndex, optional }) => {
          const slot = slotRows.find((s) => s.role_id === roleId && s.slot_index === slotIndex);
          const k = `${roleId}|${slotIndex}`;
          const w = warnings.filter((x) => x.roleId === roleId && x.slotIndex === slotIndex);
          const blocking = w.some((x) => x.level === "block");
          return (
            <li key={k} className="px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs font-semibold text-soft leading-tight">{shortRole(roleName.get(roleId) ?? "")}{slotIndex > 0 ? ` ${slotIndex + 1}` : ""}{optional && <span className="block font-normal text-faint">extra</span>}</span>
                <PersonPicker
                  roleId={roleId}
                  value={slot?.person_id ?? null}
                  people={base.people}
                  response={response}
                  onService={onService}
                  onChange={(pid) => save.mutate({ roleId, slotIndex, personId: pid })}
                  ariaLabel={`${roleName.get(roleId)} on ${formatDate(service.service_date)}`}
                  className={`flex-1 min-w-0 ${blocking ? "!border-danger" : ""}`}
                />
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
        {service.is_all_in && <Badge tone="accent">All-in: no kids church</Badge>}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-soft">Told you in person?</span>
          <select className="input !min-h-[32px] !py-0 text-xs !w-auto max-w-[11rem]" aria-label="Who" value={handPerson} onChange={(e) => setHandPerson(e.target.value)}>
            <option value="">Choose someone…</option>
            {active.map((p) => <option key={p.id} value={p.id}>{p.display_name}{response.has(p.id) ? ` (said ${response.get(p.id)})` : ""}</option>)}
          </select>
          {(["yes", "maybe", "no"] as const).map((r) => (
            <button key={r} className="chip min-h-[32px] bg-surface border border-line text-soft hover:text-ink" disabled={!handPerson || byHand.isPending} onClick={() => byHand.mutate(r)}>{r}</button>
          ))}
        </div>
        {err && <p className="text-danger" role="alert">{err}</p>}
      </div>
    </Card>
  );
}
