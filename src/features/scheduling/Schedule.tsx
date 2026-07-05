// SCHED-6: read-only master schedule — any active volunteer sees who's
// serving in every role for upcoming published services.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { formatDate, formatTime, todayISO } from "@/lib/format";

interface RotaRow {
  service_id: string;
  status: string;
  roles: { name: string; sort_order: number } | null;
  profiles: { preferred_name: string | null; full_name: string } | null;
}

interface ScheduleService {
  id: string;
  title: string;
  service_date: string;
  start_time: string;
}

export default function Schedule() {
  const { data, isLoading } = useQuery({
    queryKey: ["master-schedule"],
    queryFn: async () => {
      const { data: services } = await supabase
        .from("services")
        .select("id,title,service_date,start_time")
        .in("status", ["published"])
        .gte("service_date", todayISO())
        .order("service_date")
        .limit(20);
      const ids = (services ?? []).map((s) => s.id);
      const byService = new Map<string, RotaRow[]>();
      if (ids.length === 0) return { services: [] as ScheduleService[], byService };
      const { data: assignments } = await supabase
        .from("assignments")
        .select("service_id, status, roles(name,sort_order), profiles!assignments_profile_id_fkey(preferred_name,full_name)")
        .in("service_id", ids)
        .in("status", ["invited", "confirmed"]);
      for (const a of (assignments ?? []) as RotaRow[]) {
        const list = byService.get(a.service_id) ?? [];
        list.push(a);
        byService.set(a.service_id, list);
      }
      return { services: (services ?? []) as ScheduleService[], byService };
    },
  });

  if (isLoading) return <Spinner label="Loading the schedule…" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Master schedule" subtitle="Everyone serving, every upcoming service." />
      {data!.services.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title="No published services yet"
          body="Once a rota is published, the full team schedule appears here."
        />
      ) : (
        data!.services.map((s) => {
          const rota = (data!.byService.get(s.id) ?? []).sort(
            (a, b) =>
              ((a.roles as { sort_order: number } | null)?.sort_order ?? 0) -
              ((b.roles as { sort_order: number } | null)?.sort_order ?? 0)
          );
          return (
            <Card key={s.id}>
              <Link to={`/services/${s.id}`} className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-display font-bold">{s.title}</p>
                  <p className="text-soft text-sm">
                    {formatDate(s.service_date)} · {formatTime(s.start_time)}
                  </p>
                </div>
                <ChevronRight size={18} className="text-faint" />
              </Link>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                {rota.map((a, i) => (
                  <div key={i} className="flex justify-between text-sm border-b border-line/60 py-1">
                    <dt className="text-soft">{(a.roles as { name: string } | null)?.name}</dt>
                    <dd className="font-semibold">
                      {(a.profiles as { preferred_name: string | null; full_name: string } | null)?.preferred_name ||
                        (a.profiles as { full_name: string } | null)?.full_name}
                    </dd>
                  </div>
                ))}
                {rota.length === 0 && <p className="text-faint text-sm">Rota being finalised…</p>}
              </dl>
            </Card>
          );
        })
      )}
    </div>
  );
}
