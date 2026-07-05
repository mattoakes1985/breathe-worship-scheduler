// SWAP-1/2/3: swap board. Post your slot, claim others', lead approves.
// Claims are atomic server-side (claim_swap RPC locks the row).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Badge, Card, EmptyState, Modal, PageHeader, Spinner, statusBadgeTone } from "@/components/ui";
import { formatDate, formatTime, todayISO } from "@/lib/format";

export default function Swaps() {
  const { session, isTeamLead, isAdmin } = useAuth();
  const uid = session!.user.id;
  const qc = useQueryClient();
  const [postOpen, setPostOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["swaps", uid],
    queryFn: async () => {
      const [swaps, myAssignments] = await Promise.all([
        supabase
          .from("swap_requests")
          .select(
            "*, assignments!swap_requests_original_assignment_id_fkey(id, role_id, roles(name), profiles!assignments_profile_id_fkey(preferred_name, full_name), services(id,title,service_date,start_time))"
          )
          .in("status", ["open", "claimed"])
          .order("created_at", { ascending: false }),
        supabase
          .from("assignments")
          .select("id, roles(name), services!inner(title,service_date)")
          .eq("profile_id", uid)
          .in("status", ["invited", "confirmed"])
          .gte("services.service_date", todayISO()),
      ]);
      return { swaps: swaps.data ?? [], myAssignments: myAssignments.data ?? [] };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["swaps"] });

  const post = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from("swap_requests")
        .insert({ original_assignment_id: assignmentId, requested_by: uid });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setPostOpen(false);
    },
    onError: (e) => setError((e as Error).message),
  });

  const claim = useMutation({
    mutationFn: async (swapId: string) => {
      const { error } = await supabase.rpc("claim_swap", { p_swap_id: swapId });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (e) => setError((e as Error).message),
  });

  const resolve = useMutation({
    mutationFn: async (args: { swapId: string; approve: boolean }) => {
      const { error } = await supabase.rpc("resolve_swap", {
        p_swap_id: args.swapId,
        p_approve: args.approve,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (e) => setError((e as Error).message),
  });

  const cancel = useMutation({
    mutationFn: async (swapId: string) => {
      const { error } = await supabase.from("swap_requests").update({ status: "cancelled" }).eq("id", swapId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  if (isLoading) return <Spinner label="Loading the swap board…" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Swap board"
        subtitle="Can't make a service you're on? Post your slot and someone eligible can pick it up."
        action={
          <button className="btn-primary" onClick={() => setPostOpen(true)}>
            Post a swap
          </button>
        }
      />
      {error && (
        <p className="text-danger text-sm card !border-danger/30 p-3" role="alert">
          {error}
        </p>
      )}

      {data!.swaps.length === 0 ? (
        <EmptyState
          icon={<Repeat />}
          title="No open swaps"
          body="Nobody needs cover right now. If you can't make a service, post your slot here."
        />
      ) : (
        data!.swaps.map((sw) => {
          const a = sw.assignments as {
            role_id: string;
            roles: { name: string } | null;
            profiles: { preferred_name: string | null; full_name: string } | null;
            services: { id: string; title: string; service_date: string; start_time: string } | null;
          } | null;
          const mine = sw.requested_by === uid;
          return (
            <Card key={sw.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">
                    {a?.roles?.name} · {a?.services?.title}
                  </p>
                  <p className="text-soft text-xs">
                    {formatDate(a?.services?.service_date)} · {formatTime(a?.services?.start_time)} · posted by{" "}
                    {mine ? "you" : a?.profiles?.preferred_name || a?.profiles?.full_name}
                  </p>
                </div>
                <Badge tone={statusBadgeTone(sw.status)}>{sw.status}</Badge>
              </div>
              <div className="flex gap-2 mt-3">
                {sw.status === "open" && !mine && (
                  <button className="btn-primary flex-1" onClick={() => claim.mutate(sw.id)} disabled={claim.isPending}>
                    I can cover this
                  </button>
                )}
                {sw.status === "open" && mine && (
                  <button className="btn-secondary flex-1" onClick={() => cancel.mutate(sw.id)}>
                    Cancel my swap
                  </button>
                )}
                {sw.status === "claimed" && (isTeamLead || isAdmin) && (
                  <>
                    <button
                      className="btn-primary flex-1"
                      onClick={() => resolve.mutate({ swapId: sw.id, approve: true })}
                      disabled={resolve.isPending}
                    >
                      Approve transfer
                    </button>
                    <button
                      className="btn-secondary flex-1"
                      onClick={() => resolve.mutate({ swapId: sw.id, approve: false })}
                      disabled={resolve.isPending}
                    >
                      Reject
                    </button>
                  </>
                )}
                {sw.status === "claimed" && !(isTeamLead || isAdmin) && (
                  <p className="text-soft text-xs">Claimed — waiting for Team Lead approval.</p>
                )}
              </div>
            </Card>
          );
        })
      )}

      <Modal open={postOpen} onClose={() => setPostOpen(false)} title="Post a slot to the swap board">
        <p className="text-soft text-sm mb-4">
          You stay on the rota until someone claims your slot and your Team Lead approves the transfer.
        </p>
        {data!.myAssignments.length === 0 ? (
          <p className="text-soft text-sm">You have no upcoming assignments to swap.</p>
        ) : (
          <ul className="space-y-2">
            {data!.myAssignments.map((a) => (
              <li key={a.id}>
                <button
                  className="btn-secondary w-full justify-between"
                  onClick={() => post.mutate(a.id)}
                  disabled={post.isPending}
                >
                  <span>
                    {(a.roles as { name: string } | null)?.name} ·{" "}
                    {(a.services as { title: string } | null)?.title}
                  </span>
                  <span className="text-faint text-xs">
                    {formatDate((a.services as { service_date: string } | null)?.service_date)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
