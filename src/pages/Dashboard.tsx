// Home, built for worship leads: the next Sunday you're leading (and where its
// songs are up to), every Sunday you're on, and — for team leads and admins —
// where each month is in the import → plan → publish → songs cycle.
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarDays, Check, ChevronRight, FileUp, ListMusic, Mic2, Music2, Send, Wand2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Badge, Card, EmptyState, Field, Modal, PageHeader, Spinner } from "@/components/ui";
import { formatDate, formatTime, monthLabel, monthRange, shiftMonth, todayISO } from "@/lib/format";

type MyService = {
  id: string;
  title: string;
  date: string;
  time: string;
  roles: string[];
  invitedIds: string[];
  leading: boolean;
  band: string[];
};

type MonthStatus = {
  month: string;
  services: number;
  imported: boolean;
  planned: number; // services with at least one pick
  published: number;
  withSongs: number;
};

export default function Dashboard() {
  const { profile, session, isTeamLead, isAdmin } = useAuth();
  const planner = isTeamLead || isAdmin;
  const qc = useQueryClient();
  const uid = session!.user.id;
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", uid, planner],
    queryFn: async () => {
      const today = todayISO();
      const { data: rows, error } = await supabase
        .from("assignments")
        .select("id, status, roles(name), services!inner(id, title, service_date, start_time, published_rota, archived_at)")
        .eq("profile_id", uid)
        .gte("services.service_date", today)
        .in("status", ["invited", "confirmed"]);
      if (error) throw error;

      // one entry per service, roles merged ("Worship Leader & Acoustic Guitar")
      const byService = new Map<string, MyService>();
      for (const a of rows ?? []) {
        const s = a.services as { id: string; title: string; service_date: string; start_time: string; published_rota: unknown; archived_at: string | null };
        if (s.archived_at) continue;
        const role = (a.roles as { name: string } | null)?.name ?? "Serving";
        const cur = byService.get(s.id) ?? {
          id: s.id,
          title: s.title,
          date: s.service_date,
          time: formatTime(s.start_time),
          roles: [],
          invitedIds: [],
          leading: false,
          band: (Array.isArray(s.published_rota) ? (s.published_rota as { role: string; name: string }[]) : []).map((r) => r.name).filter((n, i, all) => n && all.indexOf(n) === i),
        };
        if (!cur.roles.includes(role)) cur.roles.push(role);
        if (role === "Worship Leader") cur.leading = true;
        if (a.status === "invited") cur.invitedIds.push(a.id);
        byService.set(s.id, cur);
      }
      const mine = [...byService.values()].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

      // where the songs are up to on the Sundays I lead
      const leadIds = mine.filter((m) => m.leading).map((m) => m.id);
      const [songs, shortlist] = leadIds.length
        ? await Promise.all([
            supabase.from("service_songs").select("service_id").in("service_id", leadIds),
            supabase.from("service_song_shortlist").select("service_id").in("service_id", leadIds),
          ])
        : [{ data: [] }, { data: [] }];
      const count = (list: { service_id: string }[] | null) => {
        const m = new Map<string, number>();
        for (const r of list ?? []) m.set(r.service_id, (m.get(r.service_id) ?? 0) + 1);
        return m;
      };

      // planners: this month and next through import → plan → publish → songs
      let months: MonthStatus[] = [];
      if (planner) {
        const thisMonth = today.slice(0, 7);
        const ms = [thisMonth, shiftMonth(thisMonth, 1)];
        const from = monthRange(ms[0]).from;
        const to = monthRange(ms[1]).to;
        const [svc, imports] = await Promise.all([
          supabase.from("services").select("id, service_date, published_at").is("archived_at", null).neq("status", "cancelled").gte("service_date", from).lte("service_date", to),
          supabase.from("availability_imports").select("month").in("month", ms.map((m) => `${m}-01`)),
        ]);
        const ids = (svc.data ?? []).map((s) => s.id);
        const [slots, setSongs] = ids.length
          ? await Promise.all([
              supabase.from("rota_plan_slots").select("service_id").in("service_id", ids).not("person_id", "is", null),
              supabase.from("service_songs").select("service_id").in("service_id", ids),
            ])
          : [{ data: [] }, { data: [] }];
        const planned = new Set((slots.data ?? []).map((r) => r.service_id));
        const withSongs = new Set((setSongs.data ?? []).map((r) => r.service_id));
        const imported = new Set((imports.data ?? []).map((r) => r.month.slice(0, 7)));
        months = ms.map((m) => {
          const list = (svc.data ?? []).filter((s) => s.service_date.startsWith(m) && (m !== thisMonth || s.service_date >= today));
          return {
            month: m,
            services: list.length,
            imported: imported.has(m),
            planned: list.filter((s) => planned.has(s.id)).length,
            published: list.filter((s) => s.published_at).length,
            withSongs: list.filter((s) => withSongs.has(s.id)).length,
          };
        });
      }

      return { mine, songCount: count(songs.data), shortlistCount: count(shortlist.data), months };
    },
  });

  const respond = useMutation({
    mutationFn: async (args: { ids: string[]; response: "confirmed" | "declined"; reason?: string }) => {
      for (const id of args.ids) {
        const { error } = await supabase.rpc("respond_to_assignment", { p_assignment_id: id, p_response: args.response, p_decline_reason: args.reason });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDeclining(null);
      setReason("");
    },
  });

  if (isLoading || !data) return <Spinner label="Loading…" />;

  const firstName = (profile?.preferred_name || profile?.full_name || "").split(" ")[0];
  const nextLead = data.mine.find((m) => m.leading);
  const others = data.mine.filter((m) => m.id !== nextLead?.id);
  const declineFor = data.mine.find((m) => m.id === declining);

  return (
    <div className="space-y-6">
      <PageHeader title={`Hi ${firstName}`} subtitle={nextLead ? "Here's your next Sunday." : planner ? "Here's where planning is up to." : "Here's what's coming up."} />

      {nextLead && (
        <NextLead s={nextLead} songs={data.songCount.get(nextLead.id) ?? 0} considering={data.shortlistCount.get(nextLead.id) ?? 0} />
      )}

      {planner && data.months.map((m) => <MonthProgress key={m.month} m={m} />)}

      <section aria-label="Your Sundays">
        <h2 className="font-display font-bold text-sm uppercase tracking-wide text-faint mb-2">{nextLead ? "Also coming up" : "You're on"}</h2>
        {others.length === 0 ? (
          nextLead ? (
            <p className="text-sm text-soft">Nothing else scheduled for you yet.</p>
          ) : (
            <EmptyState
              icon={<Music2 />}
              title="Nothing scheduled for you yet"
              body="When a month is published and you're on it, your Sundays appear here and in your calendar."
              action={<Link className="btn-secondary" to="/schedule"><CalendarDays size={16} /> See the schedule</Link>}
            />
          )
        ) : (
          <div className="space-y-2">
            {others.map((s) => (
              <div key={s.id} className="card p-4">
                <Link to={`/services/${s.id}`} className="flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-sm">{formatDate(s.date)} · {s.time}</span>
                    <span className="block text-soft text-xs truncate">{s.roles.join(" & ")}{s.leading && data.songCount.get(s.id) ? ` · ${data.songCount.get(s.id)} songs chosen` : s.leading ? " · songs not chosen yet" : ""}</span>
                  </span>
                  {s.invitedIds.length > 0 && <Badge tone="warning">please confirm</Badge>}
                  <ChevronRight size={18} className="text-faint" />
                </Link>
                {s.invitedIds.length > 0 && (
                  <div className="flex gap-2 mt-3">
                    <button className="btn-primary flex-1" disabled={respond.isPending} onClick={() => respond.mutate({ ids: s.invitedIds, response: "confirmed" })}>Confirm</button>
                    <button className="btn-secondary flex-1" onClick={() => setDeclining(s.id)}>Can't make it</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* the only route to these on a phone */}
      <section aria-label="Quick links" className="md:hidden">
        <div className="flex flex-wrap gap-2">
          {isTeamLead && <Link to="/team-lead" className="chip bg-accent-soft text-accent-strong !min-h-[40px]">Team Lead</Link>}
          {isAdmin && <Link to="/admin" className="chip bg-accent-soft text-accent-strong !min-h-[40px]">Admin</Link>}
          {planner && <Link to="/profile/preferences" className="chip bg-raised text-soft !min-h-[40px]">Preferences</Link>}
        </div>
      </section>

      <Modal open={declining !== null} onClose={() => setDeclining(null)} title="Can't make it?">
        <p className="text-soft text-sm mb-4">No guilt — life happens. A quick reason helps the team lead find cover.</p>
        <Field label="Reason">
          <textarea className="input py-2.5" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex gap-2 mt-4">
          <button
            className="btn-danger flex-1"
            disabled={reason.trim().length === 0 || respond.isPending || !declineFor}
            onClick={() => respond.mutate({ ids: declineFor!.invitedIds, response: "declined", reason })}
          >
            Tell the team lead
          </button>
          <button className="btn-secondary" onClick={() => setDeclining(null)}>Cancel</button>
        </div>
      </Modal>
    </div>
  );
}

function NextLead({ s, songs, considering }: { s: MyService; songs: number; considering: number }) {
  const days = Math.round((new Date(s.date + "T00:00:00").getTime() - new Date(todayISO() + "T00:00:00").getTime()) / 86_400_000);
  const when = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days < 7 ? `In ${days} days` : `In ${Math.round(days / 7)} week${Math.round(days / 7) === 1 ? "" : "s"}`;
  return (
    <div className="rounded-lg bg-brand-gradient p-[1.5px]">
      <div className="rounded-[14px] bg-surface p-4 sm:p-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent-strong">
          <Mic2 size={14} /> You're leading · {when}
        </p>
        <p className="font-display font-bold text-xl mt-1">{formatDate(s.date)}</p>
        <p className="text-soft text-sm">{s.time} · {s.title}{s.roles.length > 1 ? ` · ${s.roles.filter((r) => r !== "Worship Leader").join(", ")} too` : ""}</p>
        {s.band.length > 0 && <p className="text-sm mt-3"><span className="text-faint">Band:</span> {s.band.join(", ")}</p>}
        <p className="text-sm mt-1.5 flex items-center gap-1.5">
          <ListMusic size={15} className="text-accent" />
          {songs ? `${songs} song${songs === 1 ? "" : "s"} chosen` : "No songs chosen yet"}
          {considering > 0 && <span className="text-soft">· {considering} considering</span>}
        </p>
        <Link to={`/services/${s.id}`} className="btn-primary mt-4 w-full sm:w-auto">
          {songs ? "Open the Sunday" : "Choose the songs"} <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function MonthProgress({ m }: { m: MonthStatus }) {
  const steps = [
    { label: m.imported ? "Availability imported" : "Import availability", done: m.imported, icon: FileUp, to: `/team-lead/planner?tab=import&m=${m.month}`, cta: "Import the form" },
    { label: m.services ? `Planned ${m.planned}/${m.services}` : "Plan the band", done: m.services > 0 && m.planned === m.services, icon: Wand2, to: `/team-lead/planner?m=${m.month}`, cta: "Plan the month" },
    { label: m.services ? `Published ${m.published}/${m.services}` : "Publish", done: m.services > 0 && m.published === m.services, icon: Send, to: `/team-lead/planner?m=${m.month}`, cta: "Publish" },
    { label: m.services ? `Songs ${m.withSongs}/${m.services}` : "Leads choose songs", done: m.services > 0 && m.withSongs === m.services, icon: ListMusic, to: `/schedule?m=${m.month}`, cta: "See who's choosing" },
  ];
  const next = steps.find((s) => !s.done);
  if (!next && m.services > 0) {
    return (
      <Card className="!py-3">
        <p className="flex items-center gap-2 text-sm"><Check size={16} className="text-positive" /> <span className="font-semibold">{monthLabel(m.month)}</span> <span className="text-soft">is planned, published and has its songs.</span></p>
      </Card>
    );
  }
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display font-bold">{monthLabel(m.month)}</h2>
        <span className="text-xs text-soft">{m.services ? `${m.services} service${m.services === 1 ? "" : "s"}${m.month === todayISO().slice(0, 7) ? " left" : ""}` : "no services yet"}</span>
      </div>
      <ol className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {steps.map((s) => (
          <li key={s.label} className={`rounded-md px-2.5 py-2 text-xs flex items-center gap-1.5 ${s.done ? "bg-positive-soft text-positive" : s === next ? "bg-accent-soft text-accent-strong font-semibold" : "bg-raised text-faint"}`}>
            {s.done ? <Check size={14} /> : <s.icon size={14} />} {s.label}
          </li>
        ))}
      </ol>
      {next && (
        <Link to={next.to} className="btn-secondary mt-3 w-full sm:w-auto">
          {next.cta} <ChevronRight size={16} />
        </Link>
      )}
    </Card>
  );
}
