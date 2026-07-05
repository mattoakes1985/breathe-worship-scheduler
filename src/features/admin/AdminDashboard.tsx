// DASH-3: admin dashboard — roster health, system checks, audit access.
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarCog, FileClock, KeyRound, ListChecks, Users, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Card, PageHeader, Spinner } from "@/components/ui";

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const [profiles, pendingAccess, recentAudit] = await Promise.all([
        supabase.from("profiles").select("id,is_active"),
        supabase.from("admin_access_requests").select("id").eq("status", "pending"),
        supabase.from("audit_log").select("id").gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()),
      ]);
      const all = profiles.data ?? [];
      return {
        active: all.filter((p) => p.is_active).length,
        inactive: all.filter((p) => !p.is_active).length,
        pendingAccess: (pendingAccess.data ?? []).length,
        auditWeek: (recentAudit.data ?? []).length,
      };
    },
  });

  if (isLoading) return <Spinner label="Loading admin overview…" />;

  const links = [
    { to: "/admin/people", icon: Users, label: "People", sub: `${data!.active} active · ${data!.inactive} deactivated` },
    { to: "/admin/roles", icon: Wrench, label: "Roles", sub: "Breathe Worship role list" },
    { to: "/admin/templates", icon: CalendarCog, label: "Templates & services", sub: "Recurring patterns, generation" },
    { to: "/admin/services", icon: ListChecks, label: "All services", sub: "Including drafts & archived" },
    { to: "/admin/reports", icon: FileClock, label: "Reports & fairness", sub: "Serving frequency, burnout flags" },
    { to: "/admin/audit-log", icon: FileClock, label: "Audit log", sub: `${data!.auditWeek} actions this week` },
    { to: "/admin/access-requests", icon: KeyRound, label: "Access requests", sub: `${data!.pendingAccess} pending` },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Admin" subtitle="Roster health, configuration and oversight." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {links.map(({ to, icon: Icon, label, sub }) => (
          <Link key={to} to={to} className="card p-4 flex items-center gap-3 hover:shadow-raised transition-shadow">
            <span className="bg-accent-soft text-accent-strong rounded-md p-2.5">
              <Icon size={18} />
            </span>
            <span>
              <span className="block font-semibold text-sm">{label}</span>
              <span className="block text-soft text-xs">{sub}</span>
            </span>
          </Link>
        ))}
      </div>
      <Card>
        <p className="text-soft text-xs">
          UK GDPR: each volunteer's data can be exported or anonymised from their entry in{" "}
          <Link to="/admin/people" className="text-accent-strong font-semibold">People</Link>. Erasure keeps rota
          history but removes personal details permanently.
        </p>
      </Card>
    </div>
  );
}
