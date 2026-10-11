// Master schedule, a month at a time: who's serving (the published band, or
// history for past services), the songs and keys, theme and preacher. Members
// see published services; team leads and admins also see unpublished ones with
// the plan so far. Download any date range as CSV.
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Download, ListMusic } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Badge, Card, EmptyState, ErrorState, Field, Modal, PageHeader, Spinner } from "@/components/ui";
import { formatDate, formatTime, monthLabel, monthRange, shiftMonth, todayISO } from "@/lib/format";
import { buildBand, scheduleCsv, setLine, type Band, type PersonInRole, type SetSong } from "./scheduleModel";

export interface ScheduleEntry {
  id: string;
  title: string;
  date: string;
  time: string;
  status: string;
  theme: string | null;
  preacher: string | null;
  otherItems: string | null;
  band: Band;
  songs: SetSong[];
}

type Named = { preferred_name: string | null; full_name: string } | null;
const nameOf = (p: Named) => p?.preferred_name || p?.full_name || null;

async function chunked<T>(ids: string[], run: (part: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await run(ids.slice(i, i + 100));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

/** Everything the schedule shows for services between two dates (inclusive). */
export async function loadSchedule(from: string, to: string, planner: boolean): Promise<ScheduleEntry[]> {
  const [svc, roles] = await Promise.all([
    supabase
      .from("services")
      .select("id, title, service_date, start_time, status, published_rota, theme, preacher, other_items")
      .is("archived_at", null)
      .neq("status", "cancelled")
      .gte("service_date", from)
      .lte("service_date", to)
      .order("service_date")
      .order("start_time"),
    supabase.from("roles").select("name, sort_order"),
  ]);
  if (svc.error) throw new Error(svc.error.message);
  const services = svc.data ?? [];
  const ids = services.map((s) => s.id);
  const roleOrder = new Map((roles.data ?? []).map((r) => [r.name, r.sort_order]));
  if (!ids.length) return [];

  const [assignments, legacy, songs, plan] = await Promise.all([
    chunked<{ service_id: string; status: string; roles: { name: string; sort_order: number } | null; profiles: Named }>(ids, (part) =>
      supabase
        .from("assignments")
        .select("service_id, status, roles(name, sort_order), profiles!assignments_profile_id_fkey(preferred_name, full_name)")
        .in("service_id", part)
        .in("status", ["invited", "confirmed", "needs_substitute"])
    ),
    chunked<{ service_id: string; person_name: string; roles: { name: string; sort_order: number } | null }>(ids, (part) =>
      supabase.from("legacy_assignments").select("service_id, person_name, roles(name, sort_order)").in("service_id", part)
    ),
    chunked<{ service_id: string; order_index: number; key_override: string | null; songs: { title: string; default_key: string | null } | null }>(ids, (part) =>
      supabase.from("service_songs").select("service_id, order_index, key_override, songs(title, default_key)").in("service_id", part)
    ),
    planner
      ? chunked<{ service_id: string; person_id: string | null; slot_index: number; roles: { name: string; sort_order: number } | null; team_people: { display_name: string } | null }>(ids, (part) =>
          supabase.from("rota_plan_slots").select("service_id, person_id, slot_index, roles(name, sort_order), team_people(display_name)").in("service_id", part).not("person_id", "is", null)
        )
      : Promise.resolve([]),
  ]);

  const by = <T extends { service_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.service_id, [...(m.get(r.service_id) ?? []), r]);
    return m;
  };
  const aBy = by(assignments), lBy = by(legacy), sBy = by(songs), pBy = by(plan);

  return services.map((s) => {
    const asg: PersonInRole[] = (aBy.get(s.id) ?? []).map((a) => ({ role: a.roles, name: nameOf(a.profiles), needsCover: a.status === "needs_substitute" }));
    const hist: PersonInRole[] = (lBy.get(s.id) ?? []).map((l) => ({ role: l.roles, name: l.person_name }));
    const planned: PersonInRole[] = (pBy.get(s.id) ?? []).sort((a, b) => a.slot_index - b.slot_index).map((p) => ({ role: p.roles, name: p.team_people?.display_name }));
    return {
      id: s.id,
      title: s.title,
      date: s.service_date,
      time: formatTime(s.start_time),
      status: s.status,
      theme: s.theme,
      preacher: s.preacher,
      otherItems: s.other_items,
      band: buildBand({ publishedRota: s.published_rota, assignments: asg, legacy: hist, plan: s.status === "draft" ? planned : [], roleOrder }),
      songs: (sBy.get(s.id) ?? []).filter((x) => x.songs).map((x) => ({ order: x.order_index, title: x.songs!.title, key: x.key_override || x.songs!.default_key })),
    };
  });
}

export default function Schedule() {
  const { isTeamLead, isAdmin } = useAuth();
  const planner = isTeamLead || isAdmin;
  const [params, setParams] = useSearchParams();
  const thisMonth = todayISO().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(params.get("m") ?? "") ? params.get("m")! : thisMonth;
  const go = (m: string) => setParams(m === thisMonth ? {} : { m }, { replace: true });
  const { from, to } = monthRange(month);
  const today = todayISO();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["master-schedule", month, planner],
    queryFn: () => loadSchedule(from, to, planner),
  });

  const upcoming = (data ?? []).filter((s) => s.date >= today);
  const nextId = upcoming[0]?.id;

  return (
    <div className="space-y-4">
      <PageHeader title="Master schedule" subtitle="Who's serving and what we're singing, month by month." action={<CsvExport month={month} planner={planner} />} />

      <div className="flex items-center justify-between gap-2">
        <button className="btn-ghost px-2" aria-label="Previous month" onClick={() => go(shiftMonth(month, -1))}>
          <ChevronLeft size={20} />
        </button>
        <div className="text-center min-w-0">
          <label className="relative inline-flex items-center justify-center cursor-pointer">
            <h2 className="font-display font-bold text-lg">{monthLabel(month)}</h2>
            <input
              type="month"
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Jump to month"
              value={month}
              min="2021-01"
              onChange={(e) => /^\d{4}-\d{2}$/.test(e.target.value) && go(e.target.value)}
            />
          </label>
          <p className="text-soft text-xs">
            {data ? `${data.length} service${data.length === 1 ? "" : "s"}${upcoming.length && upcoming.length < data.length ? ` · ${upcoming.length} to come` : ""}` : " "}
            {month !== thisMonth && (
              <button className="ml-2 text-accent-strong font-semibold hover:underline min-h-0" onClick={() => go(thisMonth)}>
                This month
              </button>
            )}
          </p>
        </div>
        <button className="btn-ghost px-2" aria-label="Next month" onClick={() => go(shiftMonth(month, 1))}>
          <ChevronRight size={20} />
        </button>
      </div>

      {isLoading ? (
        <Spinner label="Loading the schedule…" />
      ) : error ? (
        <ErrorState message={(error as Error).message} retry={() => refetch()} />
      ) : data!.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={`Nothing in ${monthLabel(month)}`}
          body={planner ? "No services this month." : "Rotas appear here once they're published."}
        />
      ) : (
        <div className="space-y-3">
          {data!.map((s) => (
            <ServiceCard key={s.id} s={s} past={s.date < today} next={s.id === nextId} planner={planner} />
          ))}
        </div>
      )}
    </div>
  );
}

function ServiceCard({ s, past, next, planner }: { s: ScheduleEntry; past: boolean; next: boolean; planner: boolean }) {
  const notes = [s.theme && `Theme: ${s.theme}`, s.preacher && `Preach: ${s.preacher}`, s.otherItems].filter(Boolean).join(" · ");
  return (
    <Card className={`${past ? "opacity-75" : ""} ${next ? "!border-accent/50" : ""}`}>
      <Link to={`/services/${s.id}`} className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display font-bold">{formatDate(s.date)}</p>
          <p className="text-soft text-sm truncate">
            {s.time} · {s.title}
          </p>
          {notes && <p className="text-soft text-xs mt-0.5">{notes}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {next && <Badge tone="accent">Next</Badge>}
          {planner && s.status === "draft" && <Badge tone="warning">not published</Badge>}
          <ChevronRight size={18} className="text-faint" />
        </div>
      </Link>

      {s.band.lines.length > 0 ? (
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {s.band.lines.map((l) => (
            <div key={l.role} className="flex items-baseline justify-between gap-3 text-sm border-b border-line/60 py-1.5">
              <dt className="text-soft shrink-0">{l.role}</dt>
              <dd className="font-semibold text-right">
                {l.names.join(", ")}
                {l.needsCover && <span className="ml-1.5 text-danger text-xs font-semibold">needs cover</span>}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-faint text-sm">{past ? "Nobody recorded for this service." : "Rota not published yet."}</p>
      )}
      {s.band.source === "plan" && <p className="text-xs text-warning mt-1.5">Planned, not published — only team leads see this.</p>}
      {s.band.source === "history" && <p className="text-xs text-faint mt-1.5">From the old spreadsheet.</p>}

      {s.songs.length > 0 && (
        <p className="mt-2.5 text-sm flex gap-2">
          <ListMusic size={16} className="text-accent shrink-0 mt-0.5" />
          <span className="text-soft">{setLine(s.songs)}</span>
        </p>
      )}
    </Card>
  );
}

/** Download the schedule between any two dates (defaults to the month shown). */
function CsvExport({ month, planner }: { month: string; planner: boolean }) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState(() => monthRange(month));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setErr(null);
    try {
      const rows = await loadSchedule(range.from, range.to, planner);
      const csv = scheduleCsv(rows.map((r) => ({ date: r.date, time: r.time, title: r.title, theme: r.theme, preacher: r.preacher, band: r.band, songs: r.songs })));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = `master-schedule-${range.from}-to-${range.to}.csv`;
      a.click();
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="btn-secondary"
        onClick={() => {
          setRange(monthRange(month));
          setOpen(true);
        }}
      >
        <Download size={16} /> CSV
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Download the schedule">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <input type="date" className="input" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            </Field>
            <Field label="To">
              <input type="date" className="input" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-soft">One row per person and per song. Opens in Excel or Google Sheets.</p>
          {err && <p className="text-sm text-danger" role="alert">{err}</p>}
          <button className="btn-primary w-full" onClick={download} disabled={busy || !range.from || !range.to || range.from > range.to}>
            {busy ? "Building…" : "Download CSV"}
          </button>
        </div>
      </Modal>
    </>
  );
}
