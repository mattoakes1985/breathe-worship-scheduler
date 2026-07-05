// REP-1/2/3: serving frequency (CSV export), burnout flag, decline tracking.
// Team Lead/Admin eyes only — never surfaced to peers (REP-3, STAT-1).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, Field, PageHeader, Spinner } from "@/components/ui";
import { todayISO } from "@/lib/format";

export default function Reports() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(todayISO());

  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", from, to],
    queryFn: async () => {
      const [assignments, profiles, roles, recentServices] = await Promise.all([
        supabase
          .from("assignments")
          .select("profile_id, role_id, status, services!inner(service_date,status)")
          .gte("services.service_date", from)
          .lte("services.service_date", to),
        supabase.from("profiles").select("id,full_name,is_active"),
        supabase.from("roles").select("id,name"),
        supabase
          .from("services")
          .select("id,service_date")
          .in("status", ["published", "completed"])
          .lte("service_date", todayISO())
          .order("service_date", { ascending: false })
          .limit(4),
      ]);
      return {
        assignments: assignments.data ?? [],
        profiles: profiles.data ?? [],
        roles: new Map((roles.data ?? []).map((r) => [r.id, r.name])),
        last4ServiceDates: (recentServices.data ?? []).map((s) => s.service_date),
      };
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const byProfile = new Map<
      string,
      { name: string; served: number; declined: number; byRole: Map<string, number>; last4: number }
    >();
    for (const p of data.profiles.filter((p) => p.is_active)) {
      byProfile.set(p.id, { name: p.full_name, served: 0, declined: 0, byRole: new Map(), last4: 0 });
    }
    const last4 = new Set(data.last4ServiceDates);
    for (const a of data.assignments) {
      const rec = byProfile.get(a.profile_id);
      if (!rec) continue;
      const date = (a.services as { service_date: string }).service_date;
      if (a.status === "confirmed" || a.status === "substituted") {
        rec.served += 1;
        const roleName = data.roles.get(a.role_id) ?? "?";
        rec.byRole.set(roleName, (rec.byRole.get(roleName) ?? 0) + 1);
        if (last4.has(date)) rec.last4 += 1;
      }
      if (a.status === "needs_substitute" || a.status === "declined") rec.declined += 1;
    }
    return [...byProfile.entries()]
      .map(([id, r]) => ({ id, ...r }))
      .sort((a, b) => b.served - a.served);
  }, [data]);

  function exportCSV() {
    const header = "Volunteer,Services served,Declines,By role,At burnout risk\n";
    const body = rows
      .map(
        (r) =>
          `"${r.name}",${r.served},${r.declined},"${[...r.byRole.entries()]
            .map(([role, n]) => `${role}: ${n}`)
            .join("; ")}",${r.last4 > 3 ? "YES" : "no"}`
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `serving-frequency-${from}-to-${to}.csv`;
    a.click();
  }

  if (isLoading) return <Spinner label="Crunching the numbers…" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports & fairness"
        subtitle="Pastoral-care data — not visible to volunteers."
        action={
          <button className="btn-secondary" onClick={exportCSV}>
            <Download size={16} /> CSV
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="From">
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      <Card className="!p-0 divide-y divide-line">
        {rows.map((r) => (
          <div key={r.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm">{r.name}</p>
              <div className="flex gap-2">
                {/* REP-2 default threshold: more than 3 of the last 4 services */}
                {r.last4 > 3 && <Badge tone="danger">burnout risk</Badge>}
                {r.declined > 0 && <Badge tone="warning">{r.declined} declined</Badge>}
                <Badge tone="accent">{r.served} served</Badge>
              </div>
            </div>
            {r.byRole.size > 0 && (
              <p className="text-faint text-xs mt-1">
                {[...r.byRole.entries()].map(([role, n]) => `${role} ×${n}`).join(" · ")}
              </p>
            )}
          </div>
        ))}
      </Card>
      <p className="text-faint text-xs">
        Burnout flag = served more than 3 of the last 4 services (REP-2 default). Use it to start a
        kind conversation, not as a verdict.
      </p>
    </div>
  );
}
