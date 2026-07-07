// DASH-3 / §7.4.3: audit log viewer — answers "who moved me off this week?"
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, PageHeader, Spinner } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export default function AuditLog() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async () => {
      const [log, profiles] = await Promise.all([
        supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("profiles").select("id,full_name"),
      ]);
      return {
        log: log.data ?? [],
        names: new Map((profiles.data ?? []).map((p) => [p.id, p.full_name])),
      };
    },
  });

  if (isLoading) return <Spinner label="Loading the audit trail…" />;

  const tone = (action: string) =>
    action === "insert" ? "positive" : action === "delete" ? "danger" : "info";

  return (
    <div className="space-y-4">
      <PageHeader back="/admin" title="Audit log" subtitle="Every scheduling and admin mutation, automatically recorded." />
      <Card className="!p-0 divide-y divide-line">
        {data!.log.map((e) => (
          <div key={e.id} className="px-4 py-3 flex items-center gap-3">
            <Badge tone={tone(e.action)}>{e.action}</Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{e.entity_type}</p>
              <p className="text-faint text-xs">
                {e.actor_profile_id ? data!.names.get(e.actor_profile_id) ?? "Unknown" : "System"} ·{" "}
                {formatDateTime(e.created_at)}
              </p>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
