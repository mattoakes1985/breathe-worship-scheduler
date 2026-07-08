// DASH-1: volunteer dashboard — upcoming assignments, pending availability,
// personal stats widget, action-first layout.
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, ChevronRight, Music2, PartyPopper } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Badge, Card, EmptyState, PageHeader, Spinner, statusBadgeTone } from "@/components/ui";
import { formatDate, formatTime, todayISO } from "@/lib/format";
import { useState } from "react";
import { Modal, Field } from "@/components/ui";

export default function Dashboard() {
  const { profile, session, isTeamLead, isAdmin } = useAuth();
  const qc = useQueryClient();
  const uid = session!.user.id;
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", uid],
    queryFn: async () => {
      const today = todayISO();
      const [assignments, openServices, myResponses, stats] = await Promise.all([
        supabase
          .from("assignments")
          .select("*, services!inner(id,title,service_date,start_time,status), roles(name)")
          .eq("profile_id", uid)
          .gte("services.service_date", today)
          .in("status", ["invited", "confirmed"])
          .order("assigned_at"),
        supabase
          .from("services")
          .select("id,title,service_date,start_time")
          .eq("status", "availability_open")
          .gte("service_date", today)
          .order("service_date"),
        supabase.from("availability_responses").select("service_id").eq("profile_id", uid),
        supabase.rpc("get_my_stats"),
      ]);
      const answered = new Set((myResponses.data ?? []).map((r) => r.service_id));
      return {
        assignments: assignments.data ?? [],
        pendingAvailability: (openServices.data ?? []).filter((s) => !answered.has(s.id)),
        stats: (stats.data ?? {}) as Record<string, number | string | null>,
      };
    },
  });

  const respond = useMutation({
    mutationFn: async (args: { id: string; response: "confirmed" | "declined"; reason?: string }) => {
      const { error } = await supabase.rpc("respond_to_assignment", {
        p_assignment_id: args.id,
        p_response: args.response,
        p_decline_reason: args.reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setDeclining(null);
      setReason("");
    },
  });

  if (isLoading) return <Spinner label="Loading your dashboard…" />;

  const firstName = (profile?.preferred_name || profile?.full_name || "").split(" ")[0];
  const served = Number(data?.stats?.served_this_month ?? 0);
  const cap = data?.stats?.preferred_max_per_period as number | null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hi ${firstName}`}
        subtitle="Here's what needs your attention."
      />

      {/* Attention banner: the one thing to do right now, impossible to miss */}
      {(() => {
        const pendingCount = data!.pendingAvailability.length;
        const toConfirm = data!.assignments.filter((a) => a.status === "invited").length;
        if (pendingCount === 0 && toConfirm === 0) return null;
        return (
          <div className="rounded-lg bg-brand-gradient p-[1.5px]">
            <div className="rounded-[14px] bg-surface px-4 py-3.5 flex items-center gap-3">
              <span className="font-display font-extrabold text-3xl bg-brand-gradient bg-clip-text text-transparent">
                {pendingCount + toConfirm}
              </span>
              <div className="flex-1 text-sm font-semibold">
                {pendingCount > 0 && (
                  <Link to="/availability" className="block hover:underline">
                    {pendingCount} upcoming {pendingCount === 1 ? "service needs" : "services need"} your availability →
                  </Link>
                )}
                {toConfirm > 0 && (
                  <span className="block text-soft">
                    {toConfirm} {toConfirm === 1 ? "assignment" : "assignments"} below waiting for you to confirm
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Pending availability first — the action volunteers do most */}
      {data!.pendingAvailability.length > 0 && (
        <section aria-label="Pending availability">
          <h2 className="font-display font-bold text-sm uppercase tracking-wide text-faint mb-2">
            Waiting on you
          </h2>
          <div className="space-y-2">
            {data!.pendingAvailability.map((s) => (
              <Link key={s.id} to="/availability" className="card flex items-center gap-3 p-4 hover:shadow-raised transition-shadow">
                <span className="bg-warning-soft text-warning rounded-md p-2">
                  <CalendarCheck size={18} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-sm truncate">{s.title}</span>
                  <span className="block text-soft text-xs">
                    {formatDate(s.service_date)} · {formatTime(s.start_time)} — are you available?
                  </span>
                </span>
                <ChevronRight size={18} className="text-faint" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Upcoming assignments">
        <h2 className="font-display font-bold text-sm uppercase tracking-wide text-faint mb-2">
          You're serving
        </h2>
        {data!.assignments.length === 0 ? (
          <EmptyState
            icon={<Music2 />}
            title="No upcoming services yet"
            body="When you're scheduled to serve, it'll show up here — and you'll get a notification too."
          />
        ) : (
          <div className="space-y-2">
            {data!.assignments.map((a) => (
              <div key={a.id} className="card p-4">
                <div className="flex items-center gap-3">
                  <Link to={`/services/${(a.services as { id: string }).id}`} className="flex-1 min-w-0">
                    <span className="block font-semibold text-sm truncate">
                      {(a.roles as { name: string } | null)?.name} · {(a.services as { title: string }).title}
                    </span>
                    <span className="block text-soft text-xs">
                      {formatDate((a.services as { service_date: string }).service_date)} ·{" "}
                      {formatTime((a.services as { start_time: string }).start_time)}
                    </span>
                  </Link>
                  <Badge tone={statusBadgeTone(a.status)}>{a.status}</Badge>
                </div>
                {a.status === "invited" && (
                  <div className="flex gap-2 mt-3">
                    <button
                      className="btn-primary flex-1"
                      onClick={() => respond.mutate({ id: a.id, response: "confirmed" })}
                      disabled={respond.isPending}
                    >
                      Confirm
                    </button>
                    <button className="btn-secondary flex-1" onClick={() => setDeclining(a.id)}>
                      Decline
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Personal stats widget (§6.11) — full card when there's activity,
          a quiet one-line link when there isn't. */}
      {Number(data?.stats?.served_total ?? 0) > 0 ? (
        <section aria-label="Your serving">
          <Link to="/stats" className="card block p-4 hover:shadow-raised transition-shadow">
            <div className="flex items-center gap-3">
              <span className="bg-brand-gradient text-white rounded-md p-2">
                <PartyPopper size={18} />
              </span>
              <div className="flex-1">
                <p className="font-semibold text-sm">
                  {cap != null
                    ? served >= cap
                      ? `You've served ${served} of the ${cap} times you wanted to this month — thank you. Enjoy being in the congregation.`
                      : `You've served ${served} of the ${cap} times you wanted to this month.`
                    : `You've served ${served} time${served === 1 ? "" : "s"} this month · ${data?.stats?.served_total} all time.`}
                </p>
                <p className="text-soft text-xs mt-0.5">See your serving story →</p>
              </div>
            </div>
          </Link>
        </section>
      ) : (
        <p className="text-center">
          <Link to="/stats" className="text-faint text-xs hover:text-soft transition-colors">
            Your serving story →
          </Link>
        </p>
      )}

      {/* Quick links — the only route to lead/admin/preferences on mobile */}
      <section aria-label="Quick links" className="md:hidden">
        <div className="flex flex-wrap gap-2">
          {isTeamLead && (
            <Link to="/team-lead" className="chip bg-accent-soft text-accent-strong !min-h-[40px]">
              Team Lead
            </Link>
          )}
          {(isTeamLead || isAdmin) && (
            <Link to="/team-lead/songs" className="chip bg-accent-soft text-accent-strong !min-h-[40px]">
              Songs
            </Link>
          )}
          {isAdmin && (
            <Link to="/admin" className="chip bg-accent-soft text-accent-strong !min-h-[40px]">
              Admin
            </Link>
          )}
          <Link to="/profile/preferences" className="chip bg-raised text-soft !min-h-[40px]">
            Preferences
          </Link>
        </div>
      </section>

      <Modal open={declining !== null} onClose={() => setDeclining(null)} title="Decline this assignment">
        <p className="text-soft text-sm mb-4">
          No guilt — life happens. A quick reason helps your team lead find a substitute (it's required).
        </p>
        <Field label="Reason">
          <textarea className="input py-2.5" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex gap-2 mt-4">
          <button
            className="btn-danger flex-1"
            disabled={reason.trim().length === 0 || respond.isPending}
            onClick={() => respond.mutate({ id: declining!, response: "declined", reason })}
          >
            Decline & notify team lead
          </button>
          <button className="btn-secondary" onClick={() => setDeclining(null)}>
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
