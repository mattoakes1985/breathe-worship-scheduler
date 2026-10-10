// WO-3 import: upload the MS Forms export, check the dates and names, then
// apply everything in one step (atomic RPC). Names you confirm are remembered,
// so next month they match automatically.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileUp, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, Spinner } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { interpretForm, matchName, readCsv, readXlsx, type InterpretedForm } from "./formImport";
import { useInvalidatePlanner, usePlannerBase } from "./data";

type Decision = { kind: "person"; personId: string } | { kind: "new"; name: string } | { kind: "skip" } | { kind: "undecided" };

export default function ImportAvailability({ onDone }: { onDone: (month: string) => void }) {
  const base = usePlannerBase();
  const invalidate = useInvalidatePlanner();
  const [fileName, setFileName] = useState("");
  const [form, setForm] = useState<InterpretedForm | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [restore, setRestore] = useState<Record<string, boolean>>({});
  const [allIn, setAllIn] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<null | { rows: number; answers: number; new_people: number; aliases: number; skipped: number }>(null);

  const range = form ? { from: form.dates[0].date, to: form.dates[form.dates.length - 1].date } : null;
  const servicesQ = useQuery({
    queryKey: ["import-services", range?.from, range?.to],
    enabled: !!range,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, title, service_date, start_time, is_all_in")
        .is("archived_at", null)
        .neq("status", "cancelled")
        .gte("service_date", range!.from)
        .lte("service_date", range!.to)
        .order("start_time");
      if (error) throw new Error(error.message);
      return data;
    },
  });

  async function onFile(f: File) {
    setReadError(null);
    setResult(null);
    setForm(null);
    try {
      if (f.size > 5 * 1024 * 1024) throw new Error("That file is too large (over 5 MB).");
      const grid = /\.csv$/i.test(f.name) ? readCsv(await f.text()) : readXlsx(new Uint8Array(await f.arrayBuffer()));
      const parsed = interpretForm(grid);
      const people = base.data!.people;
      const d: Record<string, Decision> = {};
      const r: Record<string, boolean> = {};
      for (const e of parsed.entries) {
        const m = matchName(e.rawName, base.data!.aliasMap, people.map((p) => ({ id: p.id, name: p.display_name })));
        d[e.key] = m.personId ? { kind: "person", personId: m.personId } : { kind: "undecided" };
        if (m.personId && !people.find((p) => p.id === m.personId)?.is_active) r[m.personId] = true;
      }
      setDecisions(d);
      setRestore(r);
      setAllIn(Object.fromEntries(parsed.dates.map((x) => [x.date, x.allIn])));
      setFileName(f.name.slice(0, 200));
      setForm(parsed);
    } catch (e) {
      setReadError((e as Error).message);
    }
  }

  const servicesByDate = useMemo(() => {
    const m = new Map<string, { id: string; title: string; start_time: string | null }[]>();
    for (const s of servicesQ.data ?? []) m.set(s.service_date, [...(m.get(s.service_date) ?? []), s]);
    return m;
  }, [servicesQ.data]);

  const apply = useMutation({
    mutationFn: async () => {
      const entries = form!.entries.map((e) => {
        const d = decisions[e.key];
        const availability = d.kind === "person" || d.kind === "new"
          ? form!.dates.flatMap((col) => {
              const a = e.answers[col.date];
              return a ? (servicesByDate.get(col.date) ?? []).map((s) => ({ service_id: s.id, response: a })) : [];
            })
          : [];
        return {
          raw_name: e.rawName,
          person_id: d.kind === "person" ? d.personId : null,
          new_person_name: d.kind === "new" ? d.name : null,
          remember: d.kind === "person" || d.kind === "new",
          request: e.request,
          submitted_at: e.submittedAt ? e.submittedAt.replace(" ", "T") + ":00" : null,
          answers: e.answers,
          availability,
        };
      });
      const allInIds = form!.dates.filter((d) => allIn[d.date]).flatMap((d) => (servicesByDate.get(d.date) ?? []).map((s) => s.id));
      const { data, error } = await supabase.rpc("apply_availability_import", {
        p: { file_name: fileName, month: `${form!.month}-01`, all_in_service_ids: allInIds, entries },
      });
      if (error) throw new Error(error.message);
      const toRestore = Object.entries(restore).filter(([id, on]) => on && Object.values(decisions).some((d) => d.kind === "person" && d.personId === id)).map(([id]) => id);
      if (toRestore.length) {
        const { error: e2 } = await supabase.from("team_people").update({ is_active: true }).in("id", toRestore);
        if (e2) throw new Error(e2.message);
      }
      return data as { rows: number; answers: number; new_people: number; aliases: number; skipped: number };
    },
    onSuccess: (r) => { setResult(r); invalidate(); },
  });

  if (base.isLoading) return <Spinner />;
  const people = base.data!.people;
  const undecided = form ? form.entries.filter((e) => decisions[e.key]?.kind === "undecided").length : 0;
  const missingDates = form ? form.dates.filter((d) => !servicesByDate.get(d.date)?.length) : [];

  if (result) {
    return (
      <Card>
        <h3 className="flex items-center gap-2 font-semibold text-positive"><CheckCircle2 size={18} /> Imported</h3>
        <p className="text-sm text-soft mt-2">
          {result.answers} answers saved from {result.rows - result.skipped} people
          {result.new_people ? `, ${result.new_people} added to the team list` : ""}
          {result.skipped ? `, ${result.skipped} skipped` : ""}. {result.aliases ? `${result.aliases} name${result.aliases === 1 ? "" : "s"} remembered for next time.` : ""}
        </p>
        <div className="flex gap-2 mt-4">
          <button className="btn-primary" onClick={() => onDone(form!.month)}>Plan {new Date(+form!.month.slice(0, 4), +form!.month.slice(5, 7) - 1).toLocaleDateString("en-GB", { month: "long" })}</button>
          <button className="btn-secondary" onClick={() => { setResult(null); setForm(null); }}>Import another</button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="font-semibold">Import the availability form</h3>
        <p className="text-sm text-soft mt-1">Download the responses from Microsoft Forms (Open in Excel) and choose the file here. Nothing is saved until you press Import.</p>
        <label className="btn-secondary mt-3 cursor-pointer">
          <FileUp size={16} /> Choose .xlsx or .csv
          <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {fileName && form && <p className="text-xs text-faint mt-2">{fileName} · {form.entries.length} people</p>}
        {readError && <p className="text-danger text-sm mt-2" role="alert">{readError}</p>}
      </Card>

      {form && (
        <>
          <Card>
            <h3 className="font-semibold text-sm">Dates in the form</h3>
            <ul className="mt-2 divide-y divide-line">
              {form.dates.map((d) => {
                const svcs = servicesByDate.get(d.date) ?? [];
                const yes = form.entries.filter((e) => e.answers[d.date] === "yes").length;
                return (
                  <li key={d.date} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold w-36">{formatDate(d.date)}</span>
                    <span className="text-soft flex-1 min-w-[8rem]">
                      {servicesQ.isLoading ? "…" : svcs.length ? svcs.map((s) => formatTime(s.start_time)).join(" + ") : <span className="text-warning">No service on this date</span>}
                      {" · "}{yes} yes
                    </span>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={!!allIn[d.date]} onChange={(e) => setAllIn({ ...allIn, [d.date]: e.target.checked })} /> All-in
                    </label>
                  </li>
                );
              })}
            </ul>
            {missingDates.length > 0 && (
              <p className="text-warning text-xs mt-2 flex gap-1.5"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> Answers for dates without a service are kept in the import record but can't be planned. Create those services first if you need them.</p>
            )}
          </Card>

          <Card className="!p-0">
            <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2">
              <h3 className="font-semibold text-sm">Names</h3>
              <div className="flex items-center gap-2">
                {undecided > 0 && (
                  <button
                    className="btn-ghost !min-h-[32px] text-xs"
                    title="Only do this for people genuinely new to the team — otherwise pick who they are, so you don't create duplicates"
                    onClick={() => setDecisions(Object.fromEntries(form.entries.map((e) => [e.key, decisions[e.key].kind === "undecided" ? { kind: "new", name: e.rawName } : decisions[e.key]])))}
                  >
                    <UserPlus size={14} /> Add the rest as new
                  </button>
                )}
                {undecided > 0 ? <Badge tone="warning">{undecided} need a decision</Badge> : <Badge tone="positive">All decided</Badge>}
              </div>
            </div>
            <ul className="divide-y divide-line">
              {form.entries.map((e) => {
                const d = decisions[e.key];
                const m = matchName(e.rawName, base.data!.aliasMap, people.map((p) => ({ id: p.id, name: p.display_name })));
                const matched = d.kind === "person" ? people.find((p) => p.id === d.personId) : undefined;
                const value = d.kind === "person" ? d.personId : d.kind === "new" ? "__new" : d.kind === "skip" ? "__skip" : "";
                return (
                  <li key={e.key} className={`px-4 py-2.5 ${d.kind === "undecided" ? "bg-warning-soft/30" : ""}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm w-32 truncate" title={e.rawName}>{e.rawName}</span>
                      <select
                        className="input !min-h-[40px] !py-1 text-sm flex-1 min-w-[10rem]"
                        aria-label={`Who is ${e.rawName}?`}
                        value={value}
                        onChange={(ev) => {
                          const v = ev.target.value;
                          setDecisions({ ...decisions, [e.key]: v === "__new" ? { kind: "new", name: e.rawName } : v === "__skip" ? { kind: "skip" } : v ? { kind: "person", personId: v } : { kind: "undecided" } });
                          if (v && !v.startsWith("__") && !people.find((p) => p.id === v)?.is_active) setRestore({ ...restore, [v]: true });
                        }}
                      >
                        <option value="">Choose who this is…</option>
                        {m.suggestions.length > 0 && (
                          <optgroup label="Suggestions">
                            {m.suggestions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </optgroup>
                        )}
                        <optgroup label="Team list">
                          {people.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                        </optgroup>
                        {people.some((p) => !p.is_active) && (
                          <optgroup label="Archived">
                            {people.filter((p) => !p.is_active).map((p) => <option key={p.id} value={p.id}>{p.display_name} (archived)</option>)}
                          </optgroup>
                        )}
                        <option value="__new">+ Add “{e.rawName}” as a new person</option>
                        <option value="__skip">Skip this response</option>
                      </select>
                    </div>
                    <div className="mt-1 ml-0 sm:ml-[8.5rem] text-xs text-soft flex flex-wrap gap-x-3 gap-y-1">
                      {d.kind === "person" && m.how !== "none" && m.personId === d.personId && <span className="text-positive">Matched {m.how === "alias" ? "a remembered name" : "by name"}</span>}
                      {d.kind === "new" && <span className="flex items-center gap-1"><UserPlus size={12} /> Will be added to the team list</span>}
                      {matched && !matched.is_active && (
                        <label className="flex items-center gap-1 text-warning">
                          <input type="checkbox" checked={!!restore[matched.id]} onChange={(ev) => setRestore({ ...restore, [matched.id]: ev.target.checked })} />
                          {matched.display_name} is archived — restore to the team
                        </label>
                      )}
                      {e.superseded > 0 && <span>Used their latest of {e.superseded + 1} responses</span>}
                      {e.request && <span className="text-ink">“{e.request}”</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {form.problems.length > 0 && (
            <Card>
              <h3 className="font-semibold text-sm text-warning flex items-center gap-2"><AlertTriangle size={16} /> Answers we couldn't read (left blank)</h3>
              <ul className="mt-2 text-xs text-soft space-y-1">{form.problems.slice(0, 20).map((p, i) => <li key={i}>{p}</li>)}</ul>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={undecided > 0 || apply.isPending || servicesQ.isLoading} onClick={() => apply.mutate()}>
              {apply.isPending ? "Importing…" : `Import ${form.entries.filter((e) => decisions[e.key]?.kind !== "skip").length} responses`}
            </button>
            {undecided > 0 && <span className="text-xs text-warning">Choose who each highlighted name is, add them, or skip them.</span>}
            {apply.error && <span className="text-danger text-sm" role="alert">{(apply.error as Error).message}</span>}
          </div>
        </>
      )}
    </div>
  );
}
