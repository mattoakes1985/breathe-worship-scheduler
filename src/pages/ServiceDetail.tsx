// WOR-4: rota + song set + running order together on one screen.
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Clock, ListMusic, Users } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, ErrorState, PageHeader, Spinner, statusBadgeTone } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";

export default function ServiceDetail() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["service-detail", id],
    queryFn: async () => {
      const [service, assignments, songs, order] = await Promise.all([
        supabase.from("services").select("*").eq("id", id!).single(),
        supabase
          .from("assignments")
          .select("*, roles(name,sort_order), profiles!assignments_profile_id_fkey(full_name,preferred_name)")
          .eq("service_id", id!)
          .in("status", ["invited", "confirmed", "needs_substitute"]),
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
        songs: songs.data ?? [],
        order: order.data ?? [],
      };
    },
  });

  if (isLoading) return <Spinner label="Loading service…" />;
  if (isError || !data) return <ErrorState message="This service isn't available to you, or it doesn't exist." retry={refetch} />;

  const { service, assignments, songs, order } = data;
  const totalMinutes = order.reduce((sum, i) => sum + (i.duration_minutes ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={service.title}
        subtitle={`${formatDate(service.service_date)} · ${formatTime(service.start_time)}${
          service.end_time ? `–${formatTime(service.end_time)}` : ""
        }${service.location ? ` · ${service.location}` : ""}`}
        action={<Badge tone={statusBadgeTone(service.status)}>{service.status.replace("_", " ")}</Badge>}
      />

      <section aria-label="Who's serving">
        <h2 className="flex items-center gap-2 font-display font-bold text-sm uppercase tracking-wide text-faint mb-2">
          <Users size={14} /> Who's serving
        </h2>
        {assignments.length === 0 ? (
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
    </div>
  );
}
