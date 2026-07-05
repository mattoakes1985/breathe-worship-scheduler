// DASH-2: Team Lead dashboard — action items first, not just a calendar.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarPlus, ChevronRight, ClipboardList, Repeat } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, PageHeader, Spinner, statusBadgeTone } from "@/components/ui";
import { formatDate, todayISO } from "@/lib/format";

export default function TeamLeadDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["team-lead-dashboard"],
    queryFn: async () => {
      const today = todayISO();
      const [services, openSwaps, needsSub, activeMembers] = await Promise.all([
        supabase
          .from("services")
          .select("id,title,service_date,status,scheduling_locked")
          .gte("service_date", today)
          .neq("status", "cancelled")
          .is("archived_at", null)
          .order("service_date")
          .limit(15),
        supabase.from("swap_requests").select("id,status").in("status", ["open", "claimed"]),
        supabase
          .from("assignments")
          .select("id, services!inner(id,title,service_date)")
          .eq("status", "needs_substitute")
          .gte("services.service_date", today),
        supabase.from("team_memberships").select("profile_id").eq("is_active", true),
      ]);
      const ids = (services.data ?? []).map((s) => s.id);
      const responses = ids.length
        ? await supabase.from("availability_responses").select("service_id, profile_id").in("service_id", ids)
        : { data: [] };
      const respByService = new Map<string, number>();
      for (const r of responses.data ?? []) {
        respByService.set(r.service_id, (respByService.get(r.service_id) ?? 0) + 1);
      }
      return {
        services: services.data ?? [],
        openSwaps: openSwaps.data ?? [],
        needsSub: needsSub.data ?? [],
        teamSize: (activeMembers.data ?? []).length,
        respByService,
      };
    },
  });

  if (isLoading) return <Spinner label="Loading your team view…" />;

  const claimedSwaps = data!.openSwaps.filter((s) => s.status === "claimed").length;

  return (
    <div className="space-y-6">
      <PageHeader title="Team Lead" subtitle="What needs your attention first." />

      {/* Action items */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ActionCard
          to="/swaps"
          icon={<Repeat size={18} />}
          tone={claimedSwaps > 0 ? "warning" : "neutral"}
          label="Swaps to approve"
          value={claimedSwaps}
        />
        <ActionCard
          to="/schedule"
          icon={<AlertTriangle size={18} />}
          tone={data!.needsSub.length > 0 ? "danger" : "neutral"}
          label="Slots needing a substitute"
          value={data!.needsSub.length}
        />
        <ActionCard
          to="/admin/templates"
          icon={<CalendarPlus size={18} />}
          tone="neutral"
          label="Create services"
          value={null}
        />
      </div>

      <section>
        <h2 className="flex items-center gap-2 font-display font-bold text-sm uppercase tracking-wide text-faint mb-2">
          <ClipboardList size={14} /> Upcoming services
        </h2>
        {data!.services.length === 0 ? (
          <Card>
            <p className="text-soft text-sm">
              No upcoming services. Generate some from a template to get the rhythm going.
            </p>
            <Link className="btn-primary mt-3" to="/admin/templates">
              <CalendarPlus size={16} /> Generate services
            </Link>
          </Card>
        ) : (
          <div className="space-y-2">
            {data!.services.map((s) => {
              const responded = data!.respByService.get(s.id) ?? 0;
              const pending = Math.max(0, data!.teamSize - responded);
              return (
                <Link
                  key={s.id}
                  to={`/team-lead/services/${s.id}/build`}
                  className="card flex items-center gap-3 p-4 hover:shadow-raised transition-shadow"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{s.title}</p>
                    <p className="text-soft text-xs">
                      {formatDate(s.service_date)}
                      {s.status === "availability_open" && (
                        <span className={pending > 0 ? "text-warning font-semibold" : "text-positive font-semibold"}>
                          {" "}
                          · {pending > 0 ? `${pending} yet to respond` : "everyone has responded"}
                        </span>
                      )}
                    </p>
                  </div>
                  <Badge tone={statusBadgeTone(s.status)}>{s.status.replace(/_/g, " ")}</Badge>
                  <ChevronRight size={18} className="text-faint" />
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function ActionCard({
  to,
  icon,
  label,
  value,
  tone,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: number | null;
  tone: "neutral" | "warning" | "danger";
}) {
  const tones = {
    neutral: "bg-raised text-soft",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <Link to={to} className="card p-4 flex items-center gap-3 hover:shadow-raised transition-shadow">
      <span className={`rounded-md p-2 ${tones[tone]}`}>{icon}</span>
      <span className="flex-1 text-sm font-semibold">{label}</span>
      {value !== null && <span className="font-display font-extrabold text-2xl">{value}</span>}
    </Link>
  );
}
