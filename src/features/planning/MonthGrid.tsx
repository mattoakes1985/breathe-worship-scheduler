// WO-4 month grid: the master sheet's layout (one column per Sunday) with
// copy-as-text, print/PDF and .xlsx export in the same layout. Mobile:
// scrolls sideways with the row labels pinned.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, Download, ListOrdered, Pencil, Plus, Printer, Settings2, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { EmptyState, ErrorState, Field, Modal, Spinner } from "@/components/ui";
import { buildMonthGrid, columnText, monthText, monthXlsx, runSheet, type GridFlow, type GridRowDef, type GridSong, type MonthGrid as Grid } from "./gridModel";
import { mergedAvailability, monthRange, savePick, shiftMonth, useInvalidatePlanner, usePlannerBase, usePlannerMonth } from "./data";
import PersonPicker from "./PersonPicker";

const monthLabel = (m: string) => new Date(+m.slice(0, 4), +m.slice(5, 7) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

function useGridExtras(month: string, serviceIds: string[]) {
  return useQuery({
    queryKey: ["planner-grid", month, serviceIds.join(",")],
    queryFn: async () => {
      const { from, to } = monthRange(month);
      const [fields, songs, flow, settings] = await Promise.all([
        supabase.from("services").select("id, theme, other_items, preacher, events_note").is("archived_at", null).gte("service_date", from).lte("service_date", to),
        serviceIds.length
          ? supabase.from("service_songs").select("service_id, order_index, key_override, songs(title, default_key, tempo_bpm, time_signature, click_signature)").in("service_id", serviceIds)
          : Promise.resolve({ data: [], error: null }),
        serviceIds.length ? supabase.from("service_order_items").select("id, service_id, order_index, title, after_song, item_type, linked_song_id").in("service_id", serviceIds) : Promise.resolve({ data: [], error: null }),
        supabase.from("team_settings").select("team_id, grid_rows").limit(1),
      ]);
      for (const r of [fields, songs, flow, settings]) if (r.error) throw new Error(r.error.message);
      type SongRow = { service_id: string; order_index: number; key_override: string | null; songs: { title: string; default_key: string | null; tempo_bpm: number | null; time_signature: string | null; click_signature: string | null } | null };
      return {
        fields: new Map((fields.data ?? []).map((f) => [f.id, f])),
        songs: ((songs.data ?? []) as unknown as SongRow[]).filter((s) => s.songs).map<GridSong>((s) => ({
          service_id: s.service_id,
          order_index: s.order_index,
          title: s.songs!.title,
          key: s.key_override || s.songs!.default_key,
          bpm: s.songs!.tempo_bpm,
          time_signature: s.songs!.time_signature,
          click_signature: s.songs!.click_signature,
        })),
        // song-type order items duplicate service_songs; the grid shows running-order lines only
        flow: ((flow.data ?? []) as (GridFlow & { item_type: string; linked_song_id: string | null })[]).filter((f) => !(f.item_type === "song" && f.linked_song_id)),
        teamId: settings.data?.[0]?.team_id as string | undefined,
        rows: ((settings.data?.[0]?.grid_rows ?? []) as unknown as GridRowDef[]),
      };
    },
  });
}

export default function MonthGrid({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const base = usePlannerBase();
  const monthQ = usePlannerMonth(month);
  const serviceIds = (monthQ.data?.services ?? []).map((s) => s.id);
  const extras = useGridExtras(month, serviceIds);
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [picking, setPicking] = useState<{ serviceId: string; roleId: string; slot: number; label: string } | null>(null);

  useEffect(() => {
    // Print the grid on landscape pages with the sideways scroll flattened.
    const style = document.createElement("style");
    style.textContent = "@media print { @page { size: A4 landscape; margin: 8mm; } .grid-scroll { overflow: visible !important; } .grid-table { font-size: 8.5px; } .grid-table th, .grid-table td { position: static !important; } }";
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  const grid: Grid | null = useMemo(() => {
    if (!base.data || !monthQ.data || !extras.data) return null;
    const names = new Map(base.data.people.map((p) => [p.id, p.display_name]));
    const active = new Set(base.data.people.filter((p) => p.is_active).map((p) => p.id));
    return buildMonthGrid({
      month,
      services: monthQ.data.services.map((s) => {
        const f = extras.data!.fields.get(s.id);
        return {
          id: s.id, date: s.service_date, start_time: s.start_time, title: s.title, linked_service_id: s.linked_service_id, is_all_in: s.is_all_in,
          theme: f?.theme ?? null, other_items: f?.other_items ?? null, preacher: f?.preacher ?? null, events_note: f?.events_note ?? null,
        };
      }),
      rows: extras.data.rows,
      slots: monthQ.data.slots.filter((s) => s.person_id).map((s) => ({ service_id: s.service_id, role_id: s.role_id, slot_index: s.slot_index, name: names.get(s.person_id!) ?? "?" })),
      songs: extras.data.songs,
      flow: extras.data.flow,
      available: mergedAvailability(base.data, monthQ.data).filter((a) => a.response === "yes" && active.has(a.personId)).map((a) => ({ service_id: a.serviceId, name: names.get(a.personId) ?? "?" })),
    });
  }, [base.data, monthQ.data, extras.data, month]);

  const err = base.error ?? monthQ.error ?? extras.error;
  if (err) return <ErrorState message={err.message} />;
  if (!grid) return <Spinner label="Building the month…" />;

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied("failed");
    }
  };
  const download = () => {
    const bytes = monthXlsx(grid);
    const blob = new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${grid.title.replace(/\s+/g, " ")} rota.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const rowTone = (kind: string, label: string) =>
    kind === "events" ? "bg-[#F4B084]/40 dark:bg-[#F4B084]/20" : /^pa$/i.test(label) ? "bg-[#FFD966]/45 dark:bg-[#FFD966]/15" : "";
  const editingService = editing ? monthQ.data!.services.find((s) => s.id === editing) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <button className="btn-ghost px-2" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={20} /></button>
        <h2 className="font-display font-bold text-lg text-center">{monthLabel(month)}</h2>
        <button className="btn-ghost px-2" aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={20} /></button>
      </div>

      {grid.columns.length === 0 ? (
        <EmptyState icon={<ListOrdered />} title="No services this month" body="Create the Sundays from a service template first." />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button className="btn-secondary !min-h-[40px]" onClick={() => copy(monthText(grid), "month")}>
              {copied === "month" ? <Check size={16} /> : <Copy size={16} />} {copied === "month" ? "Copied" : "Copy month"}
            </button>
            <button className="btn-secondary !min-h-[40px]" onClick={download}><Download size={16} /> .xlsx</button>
            <button className="btn-secondary !min-h-[40px]" onClick={() => window.print()}><Printer size={16} /> Print / PDF</button>
            <button className="btn-ghost !min-h-[40px] ml-auto" onClick={() => setLayoutOpen(true)} aria-label="Grid rows"><Settings2 size={16} /> <span className="hidden sm:inline">Rows</span></button>
          </div>
          {copied === "failed" && <p className="text-danger text-sm print:hidden">Couldn't copy — your browser blocked the clipboard.</p>}

          <h2 className="hidden print:block font-bold text-base">{grid.title}</h2>
          <div className="grid-scroll overflow-x-auto -mx-4 sm:mx-0 rounded-none sm:rounded-lg border-y sm:border border-line bg-surface/80">
            <table className="grid-table border-collapse text-[13px] leading-snug">
              <tbody>
                {grid.rows.map((r, ri) => (
                  <tr key={ri} className={`border-b border-line ${rowTone(r.kind, r.label)}`}>
                    <th scope="row" className={`sticky left-0 z-10 text-left align-top font-semibold px-2.5 py-1.5 w-[5.5rem] min-w-[5.5rem] bg-raised ${rowTone(r.kind, r.label)} ${r.kind === "date" ? "font-bold" : ""}`}>
                      {r.label}
                    </th>
                    {r.cells.map((v, ci) => (
                      <td key={ci} className={`align-top px-2.5 py-1.5 min-w-[13rem] max-w-[18rem] border-l border-line ${r.kind === "date" ? "font-bold bg-raised" : r.kind === "theme" || r.kind === "text" ? "bg-raised/50" : ""}`}>
                        {r.kind === "date" ? (
                          <div className="flex items-start justify-between gap-2">
                            <span>{v}</span>
                            <span className="flex shrink-0 -mr-1 print:hidden">
                              <button className="btn-ghost !min-h-[28px] !px-1" aria-label={`Copy ${v}`} onClick={() => copy(columnText(grid, ci), grid.columns[ci].key)}>
                                {copied === grid.columns[ci].key ? <Check size={14} /> : <Copy size={14} />}
                              </button>
                              <button className="btn-ghost !min-h-[28px] !px-1" aria-label={`Edit ${v}`} onClick={() => setEditing(grid.columns[ci].primaryId)}><Pencil size={14} /></button>
                            </span>
                          </div>
                        ) : r.kind === "person" && r.roleId ? (
                          <button
                            className="w-full text-left -mx-1 px-1 rounded hover:bg-raised focus-visible:bg-raised print:pointer-events-none"
                            aria-label={`Change ${r.label} on ${grid.columns[ci].header}`}
                            onClick={() => setPicking({ serviceId: grid.columns[ci].primaryId, roleId: r.roleId!, slot: r.slot ?? 0, label: `${r.label} · ${grid.columns[ci].header}` })}
                          >
                            {v || <span className="text-faint print:hidden">—</span>}
                          </button>
                        ) : v || <span className="text-faint print:hidden">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-b border-line">
                  <th scope="row" className="sticky left-0 z-10 text-left align-top font-bold px-2.5 py-1.5 bg-raised">Songs</th>
                  {grid.songs.map((lines, ci) => (
                    <td key={ci} className="align-top px-2.5 py-1.5 border-l border-line">
                      {lines.length === 0 ? <span className="text-faint print:hidden">—</span> : (
                        <ul className="space-y-0.5">
                          {lines.map((l, i) => (
                            <li key={i} className={l.kind === "song" ? "font-medium" : /^preach/i.test(l.text) ? "font-bold text-soft" : "text-soft"}>{l.text}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row" className="sticky left-0 z-10 text-left align-top font-semibold px-2.5 py-1.5 bg-raised">Availability</th>
                  {grid.availability.map((names, ci) => (
                    <td key={ci} className="align-top px-2.5 py-1.5 border-l border-line text-soft">
                      {names.length ? names.map((n) => <div key={n}>{n}</div>) : <span className="text-faint">nobody yet</span>}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-faint print:hidden">Names come from the month plan; availability lists everyone who said yes. Tap ✎ on a date to fill in theme, preacher and the running order.</p>
        </>
      )}

      {editingService && (
        <ServiceEditor
          serviceId={editingService.id}
          title={grid.columns.find((c) => c.primaryId === editingService.id)?.header ?? ""}
          fields={extras.data!.fields.get(editingService.id)}
          songs={extras.data!.songs.filter((s) => s.service_id === editingService.id)}
          flow={extras.data!.flow.filter((f) => f.service_id === editingService.id)}
          previous={(() => {
            const prior = monthQ.data!.services.filter((s) => s.service_date < editingService.service_date || (s.service_date === editingService.service_date && s.id !== editingService.id));
            for (const p of [...prior].reverse()) {
              const f = extras.data!.flow.filter((x) => x.service_id === p.id);
              if (f.length) return f;
            }
            return [];
          })()}
          onClose={() => setEditing(null)}
        />
      )}
      {picking && <GridPick {...picking} month={month} onClose={() => setPicking(null)} />}
      {layoutOpen && <RowsEditor rows={extras.data!.rows} teamId={extras.data!.teamId} onClose={() => setLayoutOpen(false)} />}
    </div>
  );
}

const PRESETS = ["Welcome", "Communion", "Kids Exit", "Offering", "Preach", "Response", "Prayer", "Testimony", "Close"];
const itemType = (t: string) => (/^welcome|update/i.test(t) ? "announcement" : /^preach|sermon/i.test(t) ? "sermon" : /^communion/i.test(t) ? "communion" : /^offering/i.test(t) ? "offering" : "custom");

function ServiceEditor({
  serviceId, title, fields, songs, flow, previous, onClose,
}: {
  serviceId: string;
  title: string;
  fields?: { theme: string | null; other_items: string | null; preacher: string | null; events_note: string | null };
  songs: GridSong[];
  flow: GridFlow[];
  previous: GridFlow[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [theme, setTheme] = useState(fields?.theme ?? "");
  const [other, setOther] = useState(fields?.other_items ?? "");
  const [preacher, setPreacher] = useState(fields?.preacher ?? "");
  const [events, setEvents] = useState(fields?.events_note ?? "");
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["planner-grid"] });

  const saveFields = useMutation({
    mutationFn: async () => {
      const t = (s: string, n: number) => s.trim().slice(0, n) || null;
      const { error } = await supabase.from("services").update({ theme: t(theme, 200), other_items: t(other, 500), preacher: t(preacher, 120), events_note: t(events, 500) }).eq("id", serviceId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { refresh(); onClose(); },
    onError: (e: Error) => setErr(e.message),
  });

  // Reordering: flatten songs + lines, move a line, then write back each line's
  // position (after_song = how many songs come before it).
  const lines = runSheet(songs, flow);
  const persist = async (order: typeof lines) => {
    let songsBefore = 0;
    const counter = new Map<number, number>();
    const updates: { id: string; after_song: number; order_index: number }[] = [];
    for (const l of order) {
      if (l.kind === "song") { songsBefore += 1; continue; }
      const idx = (counter.get(songsBefore) ?? 0) + 1;
      counter.set(songsBefore, idx);
      updates.push({ id: l.id, after_song: songsBefore, order_index: idx });
    }
    for (const u of updates) {
      const { error } = await supabase.from("service_order_items").update({ after_song: u.after_song, order_index: u.order_index }).eq("id", u.id);
      if (error) throw new Error(error.message);
    }
  };
  const move = useMutation({
    mutationFn: async (args: { i: number; dir: -1 | 1 }) => {
      const order = [...lines];
      const j = args.i + args.dir;
      if (j < 0 || j >= order.length) return;
      [order[args.i], order[j]] = [order[j], order[args.i]];
      await persist(order);
    },
    onSuccess: refresh,
    onError: (e: Error) => setErr(e.message),
  });
  const add = useMutation({
    mutationFn: async (text: string) => {
      const t = text.trim().slice(0, 120);
      if (!t) return;
      const { error } = await supabase.from("service_order_items").insert({ service_id: serviceId, title: t, item_type: itemType(t), after_song: songs.length, order_index: 99 });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setCustom(""); refresh(); },
    onError: (e: Error) => setErr(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("service_order_items").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => setErr(e.message),
  });
  const copyPrevious = useMutation({
    mutationFn: async () => {
      const rows = previous.map((f) => ({ service_id: serviceId, title: f.title, item_type: itemType(f.title), after_song: f.after_song == null ? null : Math.min(f.after_song, songs.length), order_index: f.order_index }));
      if (!rows.length) return;
      const { error } = await supabase.from("service_order_items").insert(rows);
      if (error) throw new Error(error.message);
    },
    onSuccess: refresh,
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Theme"><input className="input" value={theme} maxLength={200} onChange={(e) => setTheme(e.target.value)} /></Field>
          <Field label="Preach"><input className="input" value={preacher} maxLength={120} onChange={(e) => setPreacher(e.target.value)} /></Field>
          <Field label="Other items"><input className="input" value={other} maxLength={500} placeholder="e.g. Communion" onChange={(e) => setOther(e.target.value)} /></Field>
          <Field label="Events"><input className="input" value={events} maxLength={500} onChange={(e) => setEvents(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={saveFields.isPending} onClick={() => saveFields.mutate()}>Save details</button>
        </div>

        <div className="border-t border-line pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Running order</span>
            <Link to={`/services/${serviceId}`} className="text-xs text-accent-strong underline">Edit songs</Link>
          </div>
          {lines.length === 0 && <p className="text-xs text-soft mt-2">No songs or lines yet.</p>}
          <ul className="mt-2 divide-y divide-line rounded-md border border-line">
            {lines.map((l, i) => (
              <li key={l.kind === "song" ? `s${l.n}` : l.id} className={`flex items-center gap-1 px-2 py-1.5 text-sm ${l.kind === "song" ? "bg-raised/60 font-medium" : ""}`}>
                <span className="flex-1 min-w-0 truncate">{l.text}</span>
                {l.kind === "flow" && (
                  <>
                    <button className="btn-ghost !min-h-[32px] !px-1.5" aria-label={`Move ${l.text} up`} disabled={i === 0 || move.isPending} onClick={() => move.mutate({ i, dir: -1 })}><ArrowUp size={14} /></button>
                    <button className="btn-ghost !min-h-[32px] !px-1.5" aria-label={`Move ${l.text} down`} disabled={i === lines.length - 1 || move.isPending} onClick={() => move.mutate({ i, dir: 1 })}><ArrowDown size={14} /></button>
                    <button className="btn-ghost !min-h-[32px] !px-1.5 text-faint hover:text-danger" aria-label={`Remove ${l.text}`} onClick={() => remove.mutate(l.id)}><Trash2 size={14} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {PRESETS.map((p) => (
              <button key={p} className="chip min-h-[32px] bg-raised text-soft hover:text-ink" onClick={() => add.mutate(p)}><Plus size={12} /> {p}</button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <input className="input !min-h-[40px]" placeholder="Another line, e.g. Preach 1 (10 mins)" value={custom} maxLength={120} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add.mutate(custom)} />
            <button className="btn-secondary !min-h-[40px]" disabled={!custom.trim()} onClick={() => add.mutate(custom)}>Add</button>
          </div>
          {flow.length === 0 && previous.length > 0 && (
            <button className="btn-ghost mt-2 text-sm" disabled={copyPrevious.isPending} onClick={() => copyPrevious.mutate()}>
              <Copy size={14} /> Use the previous Sunday's running order
            </button>
          )}
        </div>
        {err && <p className="text-danger text-sm" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}

function RowsEditor({ rows, teamId, onClose }: { rows: GridRowDef[]; teamId?: string; onClose: () => void }) {
  const base = usePlannerBase().data!;
  const qc = useQueryClient();
  const initial = rows.some((r) => r.field === "events_note")
    ? rows
    : (() => {
        const copy = [...rows];
        const pa = copy.findIndex((r) => /^pa$/i.test(r.label));
        copy.splice(pa >= 0 ? pa : copy.length, 0, { label: "Events", field: "events_note" });
        return copy;
      })();
  const [list, setList] = useState<GridRowDef[]>(initial);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      if (!teamId) throw new Error("No team settings found.");
      const clean = list.map((r) => (r.field ? { label: r.label.trim() || "Events", field: r.field } : { label: r.label.trim().slice(0, 30) || "Role", role_id: r.role_id, slot: r.slot ?? 0 }));
      const { error } = await supabase.from("team_settings").update({ grid_rows: clean as never }).eq("team_id", teamId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["planner-grid"] }); onClose(); },
    onError: (e: Error) => setErr(e.message),
  });
  const mv = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const n = [...list];
    [n[i], n[j]] = [n[j], n[i]];
    setList(n);
  };
  return (
    <Modal open onClose={onClose} title="Grid rows">
      <p className="text-xs text-soft">Theme, Date, Other Items and Preach always come first; Songs and Availability always come last. Use “2nd” for a second Lead or Vox row.</p>
      <ul className="mt-3 space-y-1.5">
        {list.map((r, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <input className="input !min-h-[36px] !w-24 text-sm" value={r.label} maxLength={30} aria-label="Row label" onChange={(e) => setList(list.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
            {r.field ? (
              <span className="flex-1 text-xs text-soft">Free text (Events)</span>
            ) : (
              <>
                <select className="input !min-h-[36px] text-sm flex-1 min-w-0" aria-label="Role" value={r.role_id ?? ""} onChange={(e) => setList(list.map((x, k) => (k === i ? { ...x, role_id: e.target.value } : x)))}>
                  {base.roles.map((ro) => <option key={ro.id} value={ro.id}>{ro.name}</option>)}
                </select>
                <select className="input !min-h-[36px] !w-20 text-sm" aria-label="Which one" value={r.slot ?? 0} onChange={(e) => setList(list.map((x, k) => (k === i ? { ...x, slot: Number(e.target.value) } : x)))}>
                  <option value={0}>1st</option>
                  <option value={1}>2nd</option>
                  <option value={2}>3rd</option>
                </select>
              </>
            )}
            <button className="btn-ghost !min-h-[32px] !px-1" aria-label="Up" onClick={() => mv(i, -1)}><ArrowUp size={14} /></button>
            <button className="btn-ghost !min-h-[32px] !px-1" aria-label="Down" onClick={() => mv(i, 1)}><ArrowDown size={14} /></button>
            {!r.field && <button className="btn-ghost !min-h-[32px] !px-1 text-faint hover:text-danger" aria-label="Remove row" onClick={() => setList(list.filter((_, k) => k !== i))}><X size={14} /></button>}
          </li>
        ))}
      </ul>
      <button className="btn-ghost mt-2" onClick={() => setList([...list, { label: "New", role_id: base.roles[0]?.id, slot: 0 }])}><Plus size={14} /> Add a row</button>
      {err && <p className="text-danger text-sm mt-2" role="alert">{err}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save rows</button>
      </div>
    </Modal>
  );
}

/** Pick who fills one slot straight from the grid (same rules as the month plan). */
function GridPick({ serviceId, roleId, slot, label, month, onClose }: { serviceId: string; roleId: string; slot: number; label: string; month: string; onClose: () => void }) {
  const base = usePlannerBase().data!;
  const data = usePlannerMonth(month).data!;
  const invalidate = useInvalidatePlanner();
  const qc = useQueryClient();
  const service = data.services.find((s) => s.id === serviceId)!;
  const slots = data.slots.filter((s) => s.service_id === serviceId);
  const current = slots.find((s) => s.role_id === roleId && s.slot_index === slot)?.person_id ?? null;
  const response = new Map(mergedAvailability(base, data).filter((a) => a.serviceId === serviceId).map((a) => [a.personId, a.response as string]));
  const onService = new Set(slots.filter((s) => s.person_id).map((s) => s.person_id!));
  const roleNames = new Map(base.roles.map((r) => [r.id, r.name]));
  const save = useMutation({
    mutationFn: (personId: string | null) =>
      savePick({
        serviceId, roleId, slotIndex: slot, personId, people: base.people, slots, roleNames,
        hasRole: (r) => service.requirements.some((q) => q.role_id === r && q.quantity_required > 0),
      }),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["planner-grid"] }); onClose(); },
  });
  return (
    <Modal open onClose={onClose} title={label}>
      <PersonPicker roleId={roleId} value={current} people={base.people} response={response} onService={onService} onChange={(pid) => save.mutate(pid)} ariaLabel={label} className="w-full" />
      <p className="text-xs text-soft mt-2">Picking someone locks the slot, so re-planning keeps it. Anyone can be picked by hand; the planner only uses people who said yes or maybe.</p>
      {save.error && <p className="text-danger text-sm mt-2" role="alert">{(save.error as Error).message}</p>}
    </Modal>
  );
}
