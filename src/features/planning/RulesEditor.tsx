// WO-3 rules editor: the planner's rules as plain English, in priority order.
// Higher rules win when two conflict; a soft rule is only broken when nothing
// else works, and the plan says so on the slot.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Card, ErrorState, Spinner } from "@/components/ui";
import { shortRole, useInvalidatePlanner, usePlannerBase, type Rule } from "./data";

const SOFT = ["monthly_cap", "lead_share", "rest_gap", "households", "fairness"];

export default function RulesEditor() {
  const base = usePlannerBase();
  const invalidate = useInvalidatePlanner();
  const [err, setErr] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: async (changes: { id: string; patch: Partial<Pick<Rule, "enabled" | "priority" | "params">> }[]) => {
      for (const c of changes) {
        const { error } = await supabase.from("scheduling_rules").update(c.patch as never).eq("id", c.id);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => { setErr(null); invalidate(); },
    onError: (e: Error) => setErr(e.message),
  });

  if (base.isLoading) return <Spinner />;
  if (base.error) return <ErrorState message={base.error.message} />;
  const { rules, roles } = base.data!;
  const byKind = (k: string) => rules.find((r) => r.kind === k);
  const soft = rules.filter((r) => SOFT.includes(r.kind)).sort((a, b) => a.priority - b.priority);
  const params = (r?: Rule) => (r?.params ?? {}) as Record<string, unknown>;

  const move = (i: number, dir: -1 | 1) => {
    const a = soft[i];
    const b = soft[i + dir];
    if (!a || !b) return;
    update.mutate([{ id: a.id, patch: { priority: b.priority } }, { id: b.id, patch: { priority: a.priority } }]);
  };

  const core = byKind("core_roles");
  const groups = (params(core).groups as { label: string; role_ids: string[] }[] | undefined) ?? [];
  const planned = byKind("planned_roles");
  const plannedIds = (params(planned).role_ids as string[] | undefined) ?? roles.map((r) => r.id);
  const allIn = byKind("all_in");

  const setGroups = (g: typeof groups) => core && update.mutate([{ id: core.id, patch: { params: { ...params(core), groups: g } as never } }]);

  return (
    <div className="space-y-4">
      {err && <p className="text-danger text-sm" role="alert">{err}</p>}

      <Card>
        <h3 className="flex items-center gap-2 font-semibold text-sm"><Lock size={16} /> Always (never broken by the planner)</h3>
        <ul className="mt-2 text-sm text-soft list-disc pl-5 space-y-1">
          <li>Only people listed for that instrument</li>
          <li>Only people who said Yes or Maybe for that date — no answer counts as not available</li>
          <li>Archived people are never scheduled</li>
          <li>Nobody in two roles on one service (except pairings set per person in the Team list, e.g. Vox only with Acoustic), or on two separate services the same day (linked double services count as one)</li>
          <li>Locked slots and anything you pick by hand stay as they are</li>
        </ul>
      </Card>

      {core && (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">Fill these first on every service</h3>
              <p className="text-xs text-soft mt-0.5">Each line needs at least one person. A gap is shown at the top of the plan with who's closest.</p>
            </div>
            <Toggle on={core.enabled} label="Core roles rule" onChange={(v) => update.mutate([{ id: core.id, patch: { enabled: v } }])} />
          </div>
          <ul className="mt-3 space-y-3">
            {groups.map((g, gi) => (
              <li key={gi} className="rounded-md bg-raised/60 p-3">
                <div className="flex items-center gap-2">
                  <input
                    className="input !min-h-[36px] text-sm font-semibold flex-1"
                    defaultValue={g.label}
                    maxLength={60}
                    aria-label="Name of this core line"
                    onBlur={(e) => e.target.value.trim() && e.target.value !== g.label && setGroups(groups.map((x, i) => (i === gi ? { ...x, label: e.target.value.trim() } : x)))}
                  />
                  <button className="btn-ghost !min-h-[36px] px-2 text-faint hover:text-danger" aria-label={`Remove ${g.label}`} onClick={() => setGroups(groups.filter((_, i) => i !== gi))}><Trash2 size={16} /></button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {roles.map((r) => {
                    const on = g.role_ids.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        aria-pressed={on}
                        className={`chip min-h-[32px] ${on ? "bg-accent text-white dark:text-brand-ink" : "bg-surface text-soft border border-line"}`}
                        onClick={() => setGroups(groups.map((x, i) => (i === gi ? { ...x, role_ids: on ? x.role_ids.filter((id) => id !== r.id) : [...x.role_ids, r.id] } : x)))}
                      >
                        {shortRole(r.name)}
                      </button>
                    );
                  })}
                </div>
                {g.role_ids.length > 1 && <p className="text-xs text-faint mt-1.5">Any one of these is enough.</p>}
              </li>
            ))}
          </ul>
          <button className="btn-ghost mt-2" onClick={() => setGroups([...groups, { label: "New core role", role_ids: [] }])}><Plus size={16} /> Add a line</button>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold text-sm">Preferences, most important first</h3>
        <p className="text-xs text-soft mt-0.5">When two clash, the higher one wins. “Yes before Maybe” sits between the rest week and households.</p>
        <ul className="mt-3 divide-y divide-line">
          {soft.map((r, i) => (
            <li key={r.id} className="py-3 flex items-start gap-2">
              <div className="flex flex-col">
                <button className="btn-ghost !min-h-[32px] px-1.5" aria-label={`Move “${r.label}” up`} disabled={i === 0 || update.isPending} onClick={() => move(i, -1)}><ArrowUp size={16} /></button>
                <button className="btn-ghost !min-h-[32px] px-1.5" aria-label={`Move “${r.label}” down`} disabled={i === soft.length - 1 || update.isPending} onClick={() => move(i, 1)}><ArrowDown size={16} /></button>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${r.enabled ? "" : "text-faint line-through"}`}>{i + 1}. {r.label}</p>
                {r.kind === "rest_gap" && (
                  <label className="text-xs text-soft flex items-center gap-2 mt-1.5">
                    Rest for
                    <select className="input !min-h-[32px] !py-0 !w-20 text-sm" value={Number(params(r).weeks ?? 1)} onChange={(e) => update.mutate([{ id: r.id, patch: { params: { ...params(r), weeks: Number(e.target.value) } as never } }])}>
                      {[1, 2, 3].map((n) => <option key={n} value={n}>{n} wk</option>)}
                    </select>
                    after serving
                  </label>
                )}
                {r.kind === "monthly_cap" && (
                  <label className="text-xs text-soft flex items-center gap-2 mt-1.5">
                    For people with no limit of their own:
                    <select className="input !min-h-[32px] !py-0 !w-28 text-sm" value={(params(r).default_max as number | null) ?? ""} onChange={(e) => update.mutate([{ id: r.id, patch: { params: { ...params(r), default_max: e.target.value ? Number(e.target.value) : null } as never } }])}>
                      <option value="">no limit</option>
                      {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} a month</option>)}
                    </select>
                  </label>
                )}
                {r.kind === "lead_share" && <p className="text-xs text-soft mt-1">Prefers a leader who hasn't led yet this month, so each leader usually gets one Sunday (depending on who's available).</p>}
                {r.kind === "households" && <p className="text-xs text-soft mt-1">Set households in the Team list. “Apart” households are kept on different services.</p>}
                {r.kind === "fairness" && <p className="text-xs text-soft mt-1">Fewest serves this month first, then first-choice instrument, then whoever served longest ago.</p>}
              </div>
              <Toggle on={r.enabled} label={r.label} onChange={(v) => update.mutate([{ id: r.id, patch: { enabled: v } }])} />
            </li>
          ))}
        </ul>
      </Card>

      {allIn && (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">Use everyone available</h3>
              <p className="text-xs text-soft mt-0.5">After the needed places are filled, extra places (a co-lead, a 2nd Vox… one per row in the month grid) go to anyone else who said yes, as long as that breaks none of the rules above. Empty extra places aren't gaps. (“All-in” on a Sunday just means no kids church; it doesn't change who's scheduled.)</p>
            </div>
            <Toggle on={allIn.enabled} label="Use everyone available" onChange={(v) => update.mutate([{ id: allIn.id, patch: { enabled: v } }])} />
          </div>
        </Card>
      )}

      {planned && (
        <Card>
          <h3 className="font-semibold text-sm">Roles the planner fills</h3>
          <p className="text-xs text-soft mt-0.5">Others (e.g. slides, camera) are left for you to sort out.</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {roles.map((r) => {
              const on = plannedIds.includes(r.id);
              return (
                <button
                  key={r.id}
                  aria-pressed={on}
                  className={`chip min-h-[36px] ${on ? "bg-accent text-white dark:text-brand-ink" : "bg-raised text-soft"}`}
                  onClick={() => update.mutate([{ id: planned.id, patch: { params: { role_ids: on ? plannedIds.filter((id) => id !== r.id) : [...plannedIds, r.id] } as never } }])}
                >
                  {r.name}
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}
