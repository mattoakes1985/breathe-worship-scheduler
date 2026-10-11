// WO-3 team list: everyone the planner can schedule, whether or not they use
// the app. Archive people who've left (history is kept), confirm households,
// record instruments, monthly limits and the names they use on the form.
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Home, Link2, Plus, Search, UserMinus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, ErrorState, Field, Modal, Spinner } from "@/components/ui";
import { formatDate, todayISO } from "@/lib/format";
import { suggestHouseholds } from "@/lib/scheduling-engine/monthPlanner";
import { shortRole, useInvalidatePlanner, usePlannerBase, type Person } from "./data";

const STALE_DAYS = 365;

function daysAgo(iso: string | null) {
  if (!iso) return Infinity;
  const t = todayISO();
  return Math.round((Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)) - Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))) / 86_400_000);
}

export default function TeamList() {
  const base = usePlannerBase();
  const invalidate = useInvalidatePlanner();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Person | "new" | null>(null);
  const [staleSel, setStaleSel] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  const archive = useMutation({
    mutationFn: async (args: { ids: string[]; active: boolean }) => {
      const { error } = await supabase.from("team_people").update({ is_active: args.active }).in("id", args.ids);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setStaleSel(new Set()); invalidate(); },
    onError: (e: Error) => setErr(e.message),
  });

  const makeHousehold = useMutation({
    mutationFn: async (args: { name: string; ids: string[] }) => {
      const { data, error } = await supabase.from("households").insert({ team_id: base.data!.teamId, name: args.name }).select("id").single();
      if (error) throw new Error(error.message);
      const { error: e2 } = await supabase.from("team_people").update({ household_id: data.id }).in("id", args.ids);
      if (e2) throw new Error(e2.message);
    },
    onSuccess: invalidate,
    onError: (e: Error) => setErr(e.message),
  });

  const people = base.data?.people ?? [];
  const active = people.filter((p) => p.is_active);
  const archived = people.filter((p) => !p.is_active);
  const stale = useMemo(() => active.filter((p) => daysAgo(p.lastServed) > STALE_DAYS), [active]);
  const households = useMemo(() => suggestHouseholds(active.map((p) => ({ id: p.id, name: p.full_name || p.display_name, householdId: p.household_id }))), [active]);
  const hhName = new Map((base.data?.households ?? []).map((h) => [h.id, h.name]));
  const roles = base.data?.roles ?? [];
  const roleName = new Map(roles.map((r) => [r.id, r.name]));

  if (base.isLoading) return <Spinner label="Loading the team list…" />;
  if (base.error) return <ErrorState message={base.error.message} retry={() => base.refetch()} />;

  const term = q.trim().toLowerCase();
  const shown = active.filter((p) => !term || p.display_name.toLowerCase().includes(term) || (p.full_name ?? "").toLowerCase().includes(term) || p.aliases.some((a) => a.alias.toLowerCase().includes(term)));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <label className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input className="input pl-9" placeholder="Search names" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the team list" />
        </label>
        <button className="btn-primary" onClick={() => setEditing("new")}><Plus size={16} /> <span className="hidden sm:inline">Add person</span></button>
      </div>
      {err && <p className="text-danger text-sm" role="alert">{err}</p>}

      {stale.length > 0 && !term && (
        <Card className="!border-warning/40">
          <h3 className="flex items-center gap-2 font-semibold text-sm"><UserMinus size={16} className="text-warning" /> Possibly left the team</h3>
          <p className="text-xs text-soft mt-1">No serve on record in the last 12 months. Archive anyone who has left — their history stays, and they can be restored any time.</p>
          <ul className="mt-2 grid sm:grid-cols-2 gap-x-4">
            {stale.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2 py-1.5 text-sm">
                  <input type="checkbox" checked={staleSel.has(p.id)} onChange={(e) => { const s = new Set(staleSel); if (e.target.checked) s.add(p.id); else s.delete(p.id); setStaleSel(s); }} />
                  <span className="flex-1 truncate">{p.display_name}</span>
                  <span className="text-xs text-faint">{p.lastServed ? `last ${formatDate(p.lastServed)}` : "no serves"}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn-secondary" disabled={!staleSel.size || archive.isPending} onClick={() => archive.mutate({ ids: [...staleSel], active: false })}>
              <Archive size={16} /> Archive {staleSel.size || ""} selected
            </button>
            <button className="btn-ghost" onClick={() => setStaleSel(staleSel.size === stale.length ? new Set() : new Set(stale.map((p) => p.id)))}>
              {staleSel.size === stale.length ? "Clear" : "Select all"}
            </button>
          </div>
        </Card>
      )}

      {households.length > 0 && !term && (
        <Card>
          <h3 className="flex items-center gap-2 font-semibold text-sm"><Home size={16} className="text-info" /> Possible households (same surname)</h3>
          <p className="text-xs text-soft mt-1">Only a suggestion — a shared surname doesn't always mean family. Confirm the ones that are.</p>
          <ul className="mt-2 space-y-2">
            {households.map((h) => (
              <li key={h.surname} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="flex-1 min-w-0">{h.personIds.map((id) => people.find((p) => p.id === id)?.display_name).join(" & ")}</span>
                <button className="btn-secondary !min-h-[36px]" disabled={makeHousehold.isPending} onClick={() => makeHousehold.mutate({ name: `${h.surname} household`, ids: h.personIds })}>Same household</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="!p-0">
        <p className="px-4 pt-3 pb-1 text-xs text-faint">{active.length} on the team{archived.length ? ` · ${archived.length} archived` : ""}</p>
        <ul className="divide-y divide-line">
          {shown.map((p) => (
            <li key={p.id}>
              <button className="w-full text-left px-4 py-3 hover:bg-raised/50 transition-colors" onClick={() => setEditing(p)}>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm flex-1 truncate">{p.display_name}{p.full_name && p.full_name !== p.display_name ? <span className="text-soft font-normal"> · {p.full_name}</span> : null}</span>
                  {p.profile_id && <span title="Has an app account"><Link2 size={14} className="text-info" aria-label="Has an app account" /></span>}
                  {p.household_id && <Badge tone="info">{hhName.get(p.household_id)}</Badge>}
                  {p.max_per_month && <Badge>max {p.max_per_month}/month</Badge>}
                  {p.always_role_id ? <Badge tone="accent">Always on {shortRole(roleName.get(p.always_role_id) ?? "")}</Badge>
                    : p.leads_on_role_id && <Badge tone="accent">Leads on {shortRole(roleName.get(p.leads_on_role_id) ?? "")}</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(p.roles).sort((a, b) => a[1] - b[1]).map(([rid, rank]) => (
                    <span key={rid} className={`chip !py-0.5 ${rank === 1 ? "bg-accent-soft text-accent-strong" : "bg-raised text-soft"}`}>{shortRole(roleName.get(rid) ?? "?")}</span>
                  ))}
                  {Object.keys(p.roles).length === 0 && <span className="text-xs text-warning">No instruments yet — the planner can't use them</span>}
                </div>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-4 py-6 text-sm text-soft text-center">Nobody matches “{q}”.</li>}
        </ul>
      </Card>

      {archived.length > 0 && (
        <details className="card p-4">
          <summary className="cursor-pointer font-semibold text-sm">Archived ({archived.length})</summary>
          <ul className="mt-2 divide-y divide-line">
            {archived.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1 truncate text-soft">{p.display_name}</span>
                <button className="btn-ghost !min-h-[36px]" onClick={() => archive.mutate({ ids: [p.id], active: true })}><ArchiveRestore size={16} /> Restore</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {editing && <PersonEditor person={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PersonEditor({ person, onClose }: { person: Person | null; onClose: () => void }) {
  const base = usePlannerBase().data!;
  const invalidate = useInvalidatePlanner();
  const [name, setName] = useState(person?.display_name ?? "");
  const [fullName, setFullName] = useState(person?.full_name ?? "");
  const [max, setMax] = useState<number | null>(person?.max_per_month ?? null);
  const [household, setHousehold] = useState<string>(person?.household_id ?? "");
  const [leadsOn, setLeadsOn] = useState<string>(person?.leads_on_role_id ?? "");
  const [always, setAlways] = useState<string>(person?.always_role_id ?? "");
  const leadRole = base.roles.find((r) => r.name === "Worship Leader");
  const [ranks, setRanks] = useState<Record<string, number>>(person?.roles ?? {});
  const [newAlias, setNewAlias] = useState("");
  const [mergeInto, setMergeInto] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const display = name.trim();
      if (!display) throw new Error("Give them a name.");
      const leadsOnValid = leadRole && leadRole.id in ranks && leadsOn && leadsOn in ranks ? leadsOn : null;
      const alwaysValid = always && always in ranks && Object.keys(ranks).length > 1 ? always : null;
      const row = { display_name: display.slice(0, 80), full_name: fullName.trim() || null, max_per_month: max, household_id: household || null, leads_on_role_id: leadsOnValid, always_role_id: alwaysValid };
      let id = person?.id;
      if (id) {
        const { error } = await supabase.from("team_people").update(row).eq("id", id);
        if (error) throw new Error(error.message.includes("uq_team_people_name") ? "Someone on the team list already has that name." : error.message);
      } else {
        const { data, error } = await supabase.from("team_people").insert({ ...row, team_id: base.teamId }).select("id").single();
        if (error) throw new Error(error.message.includes("uq_team_people_name") ? "Someone on the team list already has that name." : error.message);
        id = data.id;
        await supabase.from("name_aliases").insert({ person_id: id, alias: display.slice(0, 80), source: "manual" });
      }
      const before = person?.roles ?? {};
      const removed = Object.keys(before).filter((r) => !(r in ranks));
      if (removed.length) {
        const { error } = await supabase.from("person_roles").delete().eq("person_id", id!).in("role_id", removed);
        if (error) throw new Error(error.message);
      }
      const upserts = Object.entries(ranks).map(([role_id, rank]) => ({ person_id: id!, role_id, rank }));
      if (upserts.length) {
        const { error } = await supabase.from("person_roles").upsert(upserts, { onConflict: "person_id,role_id" });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e: Error) => setErr(e.message),
  });

  const aliasOp = useMutation({
    mutationFn: async (args: { add?: string; removeId?: string }) => {
      if (args.add) {
        const { error } = await supabase.from("name_aliases").insert({ person_id: person!.id, alias: args.add.slice(0, 80), source: "manual" });
        if (error) throw new Error(error.message.includes("uq_name_aliases_key") ? "That name is already remembered for someone." : error.message);
      }
      if (args.removeId) {
        const { error } = await supabase.from("name_aliases").delete().eq("id", args.removeId);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => { setNewAlias(""); setErr(null); invalidate(); },
    onError: (e: Error) => setErr(e.message),
  });

  const setActive = useMutation({
    mutationFn: async (active: boolean) => {
      const { error } = await supabase.from("team_people").update({ is_active: active }).eq("id", person!.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e: Error) => setErr(e.message),
  });

  const merge = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("merge_team_people", { p_keep: mergeInto, p_merge: person!.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e: Error) => setErr(e.message),
  });

  const hh = base.households;
  return (
    <Modal open onClose={onClose} title={person ? person.display_name : "Add someone to the team"}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name on the rota"><input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Full name (optional)"><input className="input" value={fullName} maxLength={120} onChange={(e) => setFullName(e.target.value)} /></Field>
        </div>

        <div>
          <span className="block text-sm font-semibold mb-1.5">Instruments <span className="font-normal text-faint">(1 = first choice)</span></span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {base.roles.map((r) => {
              const on = r.id in ranks;
              return (
                <div key={r.id} className="flex items-center gap-2">
                  <label className="flex items-center gap-2 flex-1 text-sm min-h-[40px]">
                    <input type="checkbox" checked={on} onChange={(e) => { const n = { ...ranks }; if (e.target.checked) n[r.id] = Object.keys(n).length + 1; else delete n[r.id]; setRanks(n); }} />
                    {r.name}
                  </label>
                  {on && (
                    <select className="input !min-h-[36px] !py-0 !w-16 text-sm" aria-label={`${r.name} preference`} value={ranks[r.id]} onChange={(e) => setRanks({ ...ranks, [r.id]: Number(e.target.value) })}>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {Object.keys(ranks).length > 1 && (
          <Field label="Always plays" hint="Whatever else they do (lead, vox…), they're on this instrument too. They won't be put in another role if it's already taken.">
            <select className="input" value={always} onChange={(e) => setAlways(e.target.value)}>
              <option value="">Nothing fixed</option>
              {base.roles.filter((r) => r.id in ranks).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        )}
        {leadRole && leadRole.id in ranks && !always && (
          <Field label="When leading, also plays" hint="They fill that slot too whenever they lead (e.g. leading from acoustic).">
            <select className="input" value={leadsOn} onChange={(e) => setLeadsOn(e.target.value)}>
              <option value="">Nothing — just leads</option>
              {base.roles.filter((r) => r.id !== leadRole.id && r.id in ranks).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Most times a month" hint="Soft limit — the planner can go over to fill a core role, and says so.">
            <select className="input" value={max ?? ""} onChange={(e) => setMax(e.target.value ? Number(e.target.value) : null)}>
              <option value="">No limit</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Household">
            <select className="input" value={household} onChange={(e) => setHousehold(e.target.value)}>
              <option value="">None</option>
              {hh.map((h) => <option key={h.id} value={h.id}>{h.name}{h.preference === "apart" ? " (apart)" : ""}</option>)}
            </select>
          </Field>
        </div>
        {household && <HouseholdPreference id={household} />}

        {person && (
          <div>
            <span className="block text-sm font-semibold mb-1.5">Names they use on the form</span>
            <div className="flex flex-wrap gap-1.5">
              {person.aliases.map((a) => (
                <span key={a.id} className="chip bg-raised text-soft">
                  {a.alias}
                  <button className="ml-1 text-faint hover:text-danger" aria-label={`Forget ${a.alias}`} onClick={() => aliasOp.mutate({ removeId: a.id })}>×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input className="input !min-h-[40px]" placeholder="e.g. Baz" value={newAlias} maxLength={80} onChange={(e) => setNewAlias(e.target.value)} aria-label="Add a name they use" />
              <button className="btn-secondary !min-h-[40px]" disabled={!newAlias.trim()} onClick={() => aliasOp.mutate({ add: newAlias.trim() })}>Add</button>
            </div>
          </div>
        )}

        {err && <p className="text-danger text-sm" role="alert">{err}</p>}
        <div className="flex flex-wrap gap-2 justify-end">
          {person && (
            <button className="btn-ghost mr-auto" onClick={() => setActive.mutate(!person.is_active)}>
              {person.is_active ? <><Archive size={16} /> Archive</> : <><ArchiveRestore size={16} /> Restore</>}
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save</button>
        </div>

        {person && (
          <details className="border-t border-line pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-soft">Same person as someone else?</summary>
            <p className="text-xs text-soft mt-2">Merging moves {person.display_name}'s names, instruments, availability and rota picks onto the person you choose. {person.display_name} is then archived (not deleted).</p>
            <div className="flex gap-2 mt-2">
              <select className="input !min-h-[40px] text-sm" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)} aria-label="Merge into">
                <option value="">Choose who to keep…</option>
                {base.people.filter((p) => p.id !== person.id).map((p) => <option key={p.id} value={p.id}>{p.display_name}{p.is_active ? "" : " (archived)"}</option>)}
              </select>
              <button className="btn-secondary !min-h-[40px]" disabled={!mergeInto || merge.isPending} onClick={() => merge.mutate()}>Merge</button>
            </div>
          </details>
        )}
      </div>
    </Modal>
  );
}

function HouseholdPreference({ id }: { id: string }) {
  const base = usePlannerBase().data!;
  const invalidate = useInvalidatePlanner();
  const h = base.households.find((x) => x.id === id);
  const set = useMutation({
    mutationFn: async (preference: string) => {
      const { error } = await supabase.from("households").update({ preference }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
  if (!h) return null;
  const members = base.people.filter((p) => p.household_id === id).map((p) => p.display_name);
  return (
    <div className="text-sm rounded-md bg-raised/60 p-3">
      <p className="text-soft text-xs mb-2">{h.name}: {members.join(", ") || "no one yet"}</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Household preference">
        {([["together", "Serve together"], ["apart", "Serve apart"], ["none", "No preference"]] as const).map(([v, label]) => (
          <button key={v} role="radio" aria-checked={h.preference === v} className={`chip min-h-[36px] ${h.preference === v ? "bg-accent text-white dark:text-brand-ink" : "bg-surface text-soft border border-line"}`} onClick={() => set.mutate(v)}>{label}</button>
        ))}
      </div>
    </div>
  );
}
