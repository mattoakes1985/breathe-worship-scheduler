// Admin access requests — grant/deny, per Appendix A /admin/access-requests.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Badge, Card, EmptyState, PageHeader, Spinner, statusBadgeTone } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { KeyRound } from "lucide-react";

export default function AccessRequests() {
  const { session } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["access-requests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_access_requests")
        .select("*, profiles!admin_access_requests_profile_id_fkey(full_name,email)")
        .order("requested_at", { ascending: false });
      return data ?? [];
    },
  });

  const review = useMutation({
    mutationFn: async (args: { id: string; profileId: string; approve: boolean }) => {
      const { error } = await supabase
        .from("admin_access_requests")
        .update({
          status: args.approve ? "approved" : "denied",
          reviewed_by: session!.user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", args.id);
      if (error) throw error;
      if (args.approve) {
        const { error: e2 } = await supabase.from("profiles").update({ is_admin: true }).eq("id", args.profileId);
        if (e2) throw e2;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["access-requests"] }),
  });

  if (isLoading) return <Spinner label="Loading access requests…" />;

  return (
    <div className="space-y-4">
      <PageHeader title="Admin access requests" />
      {data!.length === 0 ? (
        <EmptyState icon={<KeyRound />} title="No requests" body="When someone asks for admin access, you'll review it here." />
      ) : (
        <Card className="!p-0 divide-y divide-line">
          {data!.map((r) => {
            const p = r.profiles as { full_name: string; email: string } | null;
            return (
              <div key={r.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{p?.full_name}</p>
                    <p className="text-soft text-xs">
                      {p?.email} · {formatDateTime(r.requested_at)}
                    </p>
                    {r.reason && <p className="text-soft text-sm mt-1">“{r.reason}”</p>}
                  </div>
                  <Badge tone={statusBadgeTone(r.status === "pending" ? "open" : r.status)}>{r.status}</Badge>
                </div>
                {r.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <button
                      className="btn-primary flex-1"
                      onClick={() => review.mutate({ id: r.id, profileId: r.profile_id, approve: true })}
                      disabled={review.isPending}
                    >
                      Approve
                    </button>
                    <button
                      className="btn-secondary flex-1"
                      onClick={() => review.mutate({ id: r.id, profileId: r.profile_id, approve: false })}
                      disabled={review.isPending}
                    >
                      Deny
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
