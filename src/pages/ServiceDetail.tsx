// WOR-4: rota + song set + running order together on one screen.
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock, ListMusic, Mic2, Printer, Share2, Users } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Badge, Card, ErrorState, PageHeader, Spinner, statusBadgeTone } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import ServicePlanner from "@/features/worship-planning/ServicePlanner";

type RotaEntry = { role: string; slot: number; name: string };

/** The band copied onto the service when the month was published (migration 00027). */
function groupRota(rota: unknown): { role: string; names: string[] }[] {
  const out: { role: string; names: string[] }[] = [];
  for (const e of Array.isArray(rota) ? (rota as RotaEntry[]) : []) {
    if (!e?.role || !e?.name) continue;
    const g = out.find((x) => x.role === e.role);
    if (g) g.names.push(e.name);
    else out.push({ role: e.role, names: [e.name] });
  }
  return out;
}

export default function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { isTeamLead, isAdmin } = useAuth();

  // Whoever is down to lead this Sunday may choose its songs and running order.
  const leading = useQuery({
    queryKey: ["service-detail", id, "am-i-leading"],
    enabled: !!id && !(isTeamLead || isAdmin),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("am_i_leading", { p_service_id: id! });
      if (error) throw error;
      return !!data;
    },
  });
  const canPlan = isTeamLead || isAdmin || leading.data === true;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["service-detail", id],
    queryFn: async () => {
      const [service, assignments, legacy, songs, order] = await Promise.all([
        supabase.from("services").select("*").eq("id", id!).single(),
        supabase
          .from("assignments")
          .select("*, roles(name,sort_order), profiles!assignments_profile_id_fkey(full_name,preferred_name)")
          .eq("service_id", id!)
          .in("status", ["invited", "confirmed", "needs_substitute"]),
        // Spreadsheet-era band members who haven't signed up (and so have no account yet)
        supabase
          .from("legacy_assignments")
          .select("person_name, roles(name,sort_order)")
          .eq("service_id", id!)
          .is("claimed_profile_id", null),
        supabase
          .from("service_songs")
          .select("*, songs(title,artist,default_key,chord_chart_url,audio_url)")
          .eq("service_id", id!)
          .order("order_index"),
        supabase.from("service_order_items").select("*").eq("service_id", id!).order("order_index"),
      ]);
      if (service.error) throw service.error;
      return {
        service: service.data,
        assignments: (assignments.data ?? []).sort(
          (a, b) =>
            ((a.roles as { sort_order: number } | null)?.sort_order ?? 0) -
            ((b.roles as { sort_order: number } | null)?.sort_order ?? 0)
        ),
        legacy: (legacy.data ?? []).sort(
          (a, b) =>
            ((a.roles as { sort_order: number } | null)?.sort_order ?? 0) -
            ((b.roles as { sort_order: number } | null)?.sort_order ?? 0)
        ),
        songs: songs.data ?? [],
        order: order.data ?? [],
      };
    },
  });

  if (isLoading) return <Spinner label="Loading service…" />;
  if (isError || !data) return <ErrorState message="This service isn't available to you, or it doesn't exist." retry={refetch} />;

  const { service, assignments, legacy, songs, order } = data;
  const band = groupRota(service.published_rota);
  const totalMinutes = order.reduce((sum, i) => sum + (i.duration_minutes ?? 0), 0);

  // Share: WhatsApp-friendly plain text of rota + set list
  function shareText() {
    const lines = [
      `🎵 ${service.title} — ${formatDate(service.service_date)} ${formatTime(service.start_time)}`,
      "",
      "Serving:",
      ...(band.length
        ? band.map((g) => `• ${g.role}: ${g.names.join(", ")}`)
        : assignments.map(
            (a) =>
              `• ${(a.roles as { name: string } | null)?.name}: ${
                (a.profiles as { preferred_name: string | null; full_name: string } | null)?.preferred_name ||
                (a.profiles as { full_name: string } | null)?.full_name
              }`
          )),
      "",
      "Songs:",
      ...songs.map((ss, i) => {
        const song = ss.songs as { title: string; default_key: string | null } | null;
        return `${i + 1}. ${song?.title} (${ss.key_override || song?.default_key || "—"})`;
      }),
    ];
    const text = lines.join("\n");
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  return (
    <div className="space-y-6 print-clean">
      <PageHeader
        back
        title={service.title}
        subtitle={`${formatDate(service.service_date)} · ${formatTime(service.start_time)}${
          service.end_time ? `–${formatTime(service.end_time)}` : ""
        }${service.location ? ` · ${service.location}` : ""}`}
        action={
          <div className="flex items-center gap-2 print:hidden">
            <button className="btn-ghost !min-h-[40px] px-2" onClick={shareText} aria-label="Share">
              <Share2 size={18} />
            </button>
            <button className="btn-ghost !min-h-[40px] px-2" onClick={() => window.print()} aria-label="Print run sheet">
              <Printer size={18} />
            </button>
            <Badge tone={statusBadgeTone(service.status)}>{service.status.replace("_", " ")}</Badge>
          </div>
        }
      />

      <section aria-label="Who's serving">
        <h2 className="flex items-center gap-2 font-display font-bold text-sm uppercase tracking-wide text-faint mb-2">
          <Users size={14} /> Who's serving
        </h2>
        {band.length > 0 ? (
          <Card className="!p-0 divide-y divide-line">
            {band.map((g) => (
              <div key={g.role} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <p className="font-semibold text-sm shrink-0">{g.role}</p>
                <p className="text-soft text-sm text-right">{g.names.join(", ")}</p>
              </div>
            ))}
          </Card>
        ) : assignments.length === 0 && legacy.length === 0 ? (
          <Card>
            <p className="text-soft text-sm">The rota for this service hasn't been published yet.</p>
          </Card>
        ) : (
          <Card className="!p-0 divide-y divide-line">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-semibold text-sm">{(a.roles as { name: string } | null)?.name}</p>
                  <p className="text-soft text-sm">
                    {(a.profiles as { preferred_name: string | null; full_name: string } | null)?.preferred_name ||
                      (a.profiles as { full_name: string } | null)?.full_name}
                  </p>
                </div>
                <Badge tone={statusBadgeTone(a.status)}>{a.status.replace("_", " ")}</Badge>
              </div>
            ))}
            {legacy.map((l, i) => (
              <div key={`legacy-${i}`} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-semibold text-sm">{(l.roles as { name: string } | null)?.name ?? "Serving"}</p>
                  <p className="text-soft text-sm">{l.person_name}</p>
                </div>
                <Badge tone="neutral">history</Badge>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section aria-label="Song set">
        <h2 className="flex items-center gap-2 font-display font-bold text-sm uppercase tracking-wide text-faint mb-2">
          <ListMusic size={14} /> Song set
        </h2>
        {songs.length === 0 ? (
          <Card>
            <p className="text-soft text-sm">No songs added yet.</p>
          </Card>
        ) : (
          <Card className="!p-0 divide-y divide-line">
            {songs.map((ss, i) => {
              const song = ss.songs as { title: string; artist: string | null; default_key: string | null; chord_chart_url: string | null; audio_url: string | null } | null;
              return (
                <div key={ss.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-faint font-display font-bold w-5 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{song?.title}</p>
                    <p className="text-soft text-xs">
                      {song?.artist}
                      {ss.notes && <span className="text-faint"> · {ss.notes}</span>}
                    </p>
                  </div>
                  <Badge tone="accent">Key {ss.key_override || song?.default_key || "—"}</Badge>
                  {song?.chord_chart_url && (
                    <a
                      className="text-accent-strong text-xs font-semibold min-h-[44px] flex items-center"
                      href={song.chord_chart_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Chart
                    </a>
                  )}
                </div>
              );
            })}
          </Card>
        )}
      </section>

      <section aria-label="Running order">
        <h2 className="flex items-center gap-2 font-display font-bold text-sm uppercase tracking-wide text-faint mb-2">
          <Clock size={14} /> Running order {totalMinutes > 0 && <span className="normal-case">· ~{totalMinutes} min</span>}
        </h2>
        {order.length === 0 ? (
          <Card>
            <p className="text-soft text-sm">The running order will appear here once it's planned.</p>
          </Card>
        ) : (
          <Card className="!p-0 divide-y divide-line">
            {order.map((item) => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <Badge tone={item.item_type === "song" ? "accent" : "neutral"}>{item.item_type}</Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{item.title}</p>
                  {item.notes && <p className="text-soft text-xs">{item.notes}</p>}
                </div>
                {item.duration_minutes != null && (
                  <span className="text-faint text-xs whitespace-nowrap">{item.duration_minutes} min</span>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>

      {canPlan && (
        <>
          {!(isTeamLead || isAdmin) && (
            <p className="flex items-center gap-2 text-sm text-accent-strong font-semibold print:hidden">
              <Mic2 size={16} /> You're leading this one — choose the songs and running order below.
            </p>
          )}
          <ServicePlanner serviceId={id!} />
        </>
      )}
    </div>
  );
}
