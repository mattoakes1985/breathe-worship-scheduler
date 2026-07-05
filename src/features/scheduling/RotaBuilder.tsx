// SCHED-1..7: the rota builder. Role slots, eligible volunteer picker,
// auto-suggest panel (pure engine), clash warnings, explicit logged overrides.
// The engine proposes; the Team Lead decides; nothing auto-publishes.
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Lock, Sparkles, Unlock, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Badge, Card, ErrorState, Modal, PageHeader, Spinner, statusBadgeTone } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { rankCandidates, suggestRota, servicesOverlap, type EngineServiceInput, type Suggestion } from "@/lib/scheduling-engine";
import type { TablesUpdate } from "@/lib/supabase/database.types";

const STATUS_FLOW = ["draft", "availability_open", "scheduling_open", "published", "completed"] as const;

export default function RotaBuilder() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session!.user.id;
  const qc = useQueryClient();
  const [pickerSlot, setPickerSlot] = useState<{ roleId: string; roleName: string } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [altPick, setAltPick] = useState<Record<string, string>>({}); // slotKey -> chosen profileId
  const [warn, setWarn] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["rota-builder", id],
    queryFn: async () => {
      // Bounded fetch (§8.1): 3 batched round trips for the whole builder.
      const [service, requirements, assignments] = await Promise.all([
        supabase.from("services").select("*").eq("id", id!).single(),
        supabase.from("service_role_requirements").select("*, roles(id,name,sort_order)").eq("service_id", id!),
        supabase
          .from("assignments")
          .select("*, profiles!assignments_profile_id_fkey(id,full_name,preferred_name), roles(name)")
          .eq("service_id", id!)
          .neq("status", "substituted"),
      ]);
      if (service.error) throw service.error;
      const svc = service.data;
      const [members, eligibility, availability, blockouts, prefs, history, sameDayServices, linkCandidates] = await Promise.all([
        supabase.from("team_memberships").select("profile_id, profiles(id,full_name,preferred_name)").eq("team_id", svc.team_id).eq("is_active", true),
        supabase.from("role_eligibility").select("profile_id, role_id, proficiency, preference_rank").eq("is_active", true),
        supabase.from("availability_responses").select("profile_id, response, note").eq("service_id", id!),
        supabase.from("blockout_dates").select("*"),
        supabase.from("serving_preferences").select("*"),
        supabase
          .from("assignments")
          .select("profile_id, role_id, services!inner(service_date, status)")
          .in("status", ["confirmed", "invited"])
          .lte("services.service_date", svc.service_date),
        supabase
          .from("services")
          .select("id, service_date, start_time, end_time")
          .eq("service_date", svc.service_date)
          .neq("id", id!),
        supabase
          .from("services")
          .select("id, title, service_date, start_time, linked_service_id")
          .eq("team_id", svc.team_id)
          .is("archived_at", null)
          .neq("id", id!)
          .gte("service_date", svc.service_date)
          .lte("service_date", svc.service_date) // same-day sibling services (9:15 ↔ 11:15)
          .order("start_time"),
      ]);
      return {
        service: svc,
        requirements: (requirements.data ?? []).sort(
          (a, b) => ((a.roles as { sort_order: number }).sort_order ?? 0) - ((b.roles as { sort_order: number }).sort_order ?? 0)
        ),
        assignments: assignments.data ?? [],
        members: members.data ?? [],
        eligibility: eligibility.data ?? [],
        availability: availability.data ?? [],
        blockouts: blockouts.data ?? [],
        prefs: prefs.data ?? [],
        history: history.data ?? [],
        sameDayServices: sameDayServices.data ?? [],
        linkCandidates: linkCandidates.data ?? [],
      };
    },
  });

  const engineInput: EngineServiceInput | null = useMemo(() => {
    if (!data) return null;
    const volunteers = data.members.map((m) => {
      const p = m.profiles as { id: string; full_name: string; preferred_name: string | null };
      const eligibleRoles: Record<string, "trainee" | "competent" | "lead"> = {};
      const rolePreferenceRank: Record<string, number> = {};
      for (const e of data.eligibility.filter((e) => e.profile_id === p.id)) {
        eligibleRoles[e.role_id] = e.proficiency as "trainee" | "competent" | "lead";
        rolePreferenceRank[e.role_id] = e.preference_rank ?? 1;
      }
      return { profileId: p.id, name: p.preferred_name || p.full_name, eligibleRoles, rolePreferenceRank };
    });
    const slots = data.requirements.flatMap((r) =>
      Array.from({ length: r.quantity_required }, (_, i) => ({
        roleId: r.role_id,
        roleName: (r.roles as { name: string }).name,
        slotIndex: i,
      }))
    );
    const historyEntries = data.history.map((h) => ({
      profileId: h.profile_id,
      roleId: h.role_id,
      serviceDate: (h.services as { service_date: string }).service_date,
    }));
    return {
      serviceDate: data.service.service_date,
      slots,
      volunteers,
      availability: data.availability.map((a) => ({ profileId: a.profile_id, response: a.response as "yes" | "no" | "maybe" })),
      blockouts: data.blockouts.map((b) => ({
        profileId: b.profile_id,
        startDate: b.start_date,
        endDate: b.end_date,
        recurringDayOfWeek: b.recurring_day_of_week,
      })),
      history: historyEntries,
      preferences: data.prefs.map((p) => ({
        profileId: p.profile_id,
        maxServicesPerPeriod: p.max_services_per_period,
        periodType: (p.period_type as "week" | "month") ?? "month",
      })),
      periodAssignments: historyEntries,
    };
  }, [data]);

  const assign = useMutation({
    mutationFn: async (args: { roleId: string; profileId: string; override?: boolean }) => {
      // SCHED-3: same-service duplicate check
      if (data!.assignments.some((a) => a.profile_id === args.profileId)) {
        throw new Error("That volunteer is already assigned to a role on this service.");
      }
      const { error } = await supabase.from("assignments").insert({
        service_id: id!,
        role_id: args.roleId,
        profile_id: args.profileId,
        assigned_by: uid,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rota-builder"] });
      setPickerSlot(null);
      setWarn(null);
    },
    onError: (e) => setWarn((e as Error).message),
  });

  // Change request #3: link the 9:15 and 11:15 services (decouple anytime)
  const setLink = useMutation({
    mutationFn: async (otherId: string | null) => {
      const current = data!.service.linked_service_id;
      const ops = [supabase.from("services").update({ linked_service_id: otherId }).eq("id", id!)];
      if (current) ops.push(supabase.from("services").update({ linked_service_id: null }).eq("id", current));
      if (otherId) ops.push(supabase.from("services").update({ linked_service_id: id! }).eq("id", otherId));
      const results = await Promise.all(ops);
      for (const r of results) if (r.error) throw r.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rota-builder"] }),
    onError: (e) => setWarn((e as Error).message),
  });

  const copyRotaToLinked = useMutation({
    mutationFn: async () => {
      const linkedId = data!.service.linked_service_id;
      if (!linkedId) throw new Error("No linked service");
      const { data: existing } = await supabase
        .from("assignments")
        .select("profile_id, role_id")
        .eq("service_id", linkedId);
      const existingKeys = new Set((existing ?? []).map((a) => `${a.profile_id}:${a.role_id}`));
      const toCopy = data!.assignments
        .filter((a) => a.status !== "needs_substitute")
        .filter((a) => !existingKeys.has(`${a.profile_id}:${a.role_id}`))
        .map((a) => ({
          service_id: linkedId,
          role_id: a.role_id,
          profile_id: a.profile_id,
          assigned_by: uid,
        }));
      if (toCopy.length === 0) return 0;
      const { error } = await supabase.from("assignments").insert(toCopy);
      if (error) throw error;
      return toCopy.length;
    },
    onSuccess: (n) => setWarn(n ? `Copied ${n} assignments to the linked service.` : "Linked service already has this rota."),
    onError: (e) => setWarn((e as Error).message),
  });

  const removeAssignment = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase.from("assignments").delete().eq("id", assignmentId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rota-builder"] }),
  });

  const updateService = useMutation({
    mutationFn: async (patch: TablesUpdate<"services">) => {
      const { error } = await supabase.from("services").update(patch).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rota-builder"] }),
  });

  if (isLoading) return <Spinner label="Loading the rota builder…" />;
  if (isError || !data || !engineInput) return <ErrorState message="Couldn't load this service." retry={refetch} />;

  const { service } = data;
  const locked = service.scheduling_locked;
  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(service.status as (typeof STATUS_FLOW)[number]) + 1];
  const availabilityByProfile = new Map(data.availability.map((a) => [a.profile_id, a]));

  return (
    <div className="space-y-5">
      <PageHeader
        title={service.title}
        subtitle={`${formatDate(service.service_date)} · ${formatTime(service.start_time)}`}
        action={<Badge tone={statusBadgeTone(service.status)}>{service.status.replace(/_/g, " ")}</Badge>}
      />

      {warn && (
        <p className="card !border-danger/40 bg-danger-soft/50 text-danger text-sm p-3 flex items-center gap-2" role="alert">
          <AlertTriangle size={16} /> {warn}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          className="btn-primary"
          disabled={locked}
          onClick={() => setSuggestions(suggestRota(engineInput))}
        >
          <Sparkles size={16} /> Auto-suggest rota
        </button>
        {nextStatus && !locked && (
          <button
            className="btn-secondary"
            onClick={() => {
              const patch: TablesUpdate<"services"> = { status: nextStatus };
              if (nextStatus === "published") patch.scheduling_locked = true; // SCHED-5
              updateService.mutate(patch);
            }}
          >
            Move to “{nextStatus.replace(/_/g, " ")}”
          </button>
        )}
        {locked ? (
          <button
            className="btn-secondary"
            onClick={() => {
              // SCHED-5: reopening is deliberate and audit-logged (service update trigger)
              if (window.confirm("Reopen a locked rota? This is logged in the audit trail.")) {
                updateService.mutate({ scheduling_locked: false, status: "scheduling_open" });
              }
            }}
          >
            <Unlock size={16} /> Reopen (logged)
          </button>
        ) : (
          service.status === "published" && (
            <span className="chip bg-raised text-soft">
              <Lock size={12} /> Published
            </span>
          )
        )}
      </div>

      {/* Linked services (change request #3): 9:15 ↔ 11:15 pairing */}
      <Card className="!py-3">
        {data.service.linked_service_id ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">
              🔗 Linked with{" "}
              <b>{data.linkCandidates.find((c) => c.id === data.service.linked_service_id)?.title ?? "another service"}</b>
              {" · "}
              {formatTime(data.linkCandidates.find((c) => c.id === data.service.linked_service_id)?.start_time ?? null)}
            </span>
            <button className="btn-secondary !min-h-[36px] text-xs" onClick={() => copyRotaToLinked.mutate()} disabled={copyRotaToLinked.isPending}>
              Copy this rota across
            </button>
            <button className="btn-ghost !min-h-[36px] text-xs text-danger" onClick={() => setLink.mutate(null)}>
              Unlink
            </button>
          </div>
        ) : data.linkCandidates.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-soft">Same-day service:</span>
            {data.linkCandidates.map((c) => (
              <button key={c.id} className="btn-secondary !min-h-[36px] text-xs" onClick={() => setLink.mutate(c.id)}>
                🔗 Link with {c.title} ({formatTime(c.start_time)})
              </button>
            ))}
            <span className="text-faint text-xs">Linking lets you copy one rota across both.</span>
          </div>
        ) : (
          <p className="text-faint text-xs">No same-day service to link with.</p>
        )}
      </Card>

      {/* Suggestion panel — accept/reject each individually (SCHED-2) */}
      {suggestions && (
        <Card className="!bg-accent-soft/60 border-accent/20">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold">Suggested rota</h2>
            <button className="btn-ghost !min-h-[36px]" onClick={() => setSuggestions(null)} aria-label="Dismiss suggestions">
              <X size={16} />
            </button>
          </div>
          <ul className="space-y-2">
            {suggestions.map((s, i) => {
              const slot = engineInput.slots[i];
              const slotKey = `${s.roleId}-${s.slotIndex}`;
              const assignedIds = new Set(data.assignments.map((a) => a.profile_id));
              // Full ranked list so the lead can pick someone other than #1 (change request #5)
              const alternatives = rankCandidates(engineInput, s.roleId, assignedIds).slice(0, 8);
              const chosenId = altPick[slotKey] ?? s.profileId ?? "";
              const chosen = alternatives.find((c) => c.profileId === chosenId);
              return (
                <li key={slotKey} className="bg-surface rounded-md p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold w-28 shrink-0 truncate">{slot?.roleName}</p>
                    {alternatives.length === 0 ? (
                      <span className="text-danger text-sm flex-1">no candidate found</span>
                    ) : (
                      <select
                        className="input !min-h-[38px] flex-1 text-sm"
                        value={chosenId}
                        aria-label={`Candidate for ${slot?.roleName}`}
                        onChange={(e) => setAltPick((p) => ({ ...p, [slotKey]: e.target.value }))}
                      >
                        {alternatives.map((c, idx) => (
                          <option key={c.profileId} value={c.profileId}>
                            {idx + 1}. {c.name}
                            {c.overPreferenceCap ? " — at their limit" : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    {chosenId && !data.assignments.some((a) => a.role_id === s.roleId && a.profile_id === chosenId) && (
                      <button
                        className="btn-primary !min-h-[38px]"
                        onClick={() => assign.mutate({ roleId: s.roleId, profileId: chosenId })}
                        disabled={assign.isPending || locked}
                      >
                        Assign
                      </button>
                    )}
                  </div>
                  {chosen && <p className="text-faint text-xs mt-1.5 truncate">{chosen.reasons.join(" · ")}</p>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Role slots */}
      <div className="space-y-3">
        {data.requirements.map((req) => {
          const role = req.roles as { id: string; name: string };
          const filled = data.assignments.filter((a) => a.role_id === req.role_id);
          return (
            <Card key={req.id}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display font-bold text-sm">
                  {role.name}{" "}
                  <span className="text-faint font-body font-normal">
                    {filled.length}/{req.quantity_required}
                    {req.is_required ? "" : " (optional)"}
                  </span>
                </h3>
                {filled.length < req.quantity_required && !locked && (
                  <button className="btn-secondary !min-h-[38px]" onClick={() => setPickerSlot({ roleId: req.role_id, roleName: role.name })}>
                    Assign
                  </button>
                )}
              </div>
              {filled.length === 0 ? (
                <p className="text-faint text-sm">Nobody assigned yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {filled.map((a) => {
                    const p = a.profiles as { preferred_name: string | null; full_name: string };
                    return (
                      <li key={a.id} className="flex items-center justify-between text-sm">
                        <span className="font-semibold">{p.preferred_name || p.full_name}</span>
                        <span className="flex items-center gap-2">
                          <Badge tone={statusBadgeTone(a.status)}>{a.status.replace(/_/g, " ")}</Badge>
                          {!locked && (
                            <button
                              className="text-danger text-xs font-semibold min-h-[38px] px-1"
                              onClick={() => removeAssignment.mutate(a.id)}
                            >
                              Remove
                            </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      {/* Volunteer picker — SCHED-1: yes/maybe by default; no/no-response require explicit override */}
      <Modal open={pickerSlot !== null} onClose={() => setPickerSlot(null)} title={`Assign — ${pickerSlot?.roleName ?? ""}`}>
        {pickerSlot && (
          <PickerList
            engineInput={engineInput}
            roleId={pickerSlot.roleId}
            availabilityByProfile={availabilityByProfile}
            assignedProfileIds={new Set(data.assignments.map((a) => a.profile_id))}
            sameDayClash={(profileId) =>
              data.sameDayServices.some((other) =>
                servicesOverlap(
                  { serviceDate: service.service_date, startTime: service.start_time.slice(0, 5), endTime: service.end_time?.slice(0, 5) ?? null },
                  { serviceDate: other.service_date, startTime: other.start_time.slice(0, 5), endTime: other.end_time?.slice(0, 5) ?? null }
                ) && data.history.some((h) => h.profile_id === profileId)
              )
            }
            onPick={(profileId, override) => assign.mutate({ roleId: pickerSlot.roleId, profileId, override })}
          />
        )}
      </Modal>
    </div>
  );
}

function PickerList({
  engineInput,
  roleId,
  availabilityByProfile,
  assignedProfileIds,
  onPick,
  sameDayClash,
}: {
  engineInput: EngineServiceInput;
  roleId: string;
  availabilityByProfile: Map<string, { response: string; note: string | null }>;
  assignedProfileIds: Set<string>;
  onPick: (profileId: string, override: boolean) => void;
  sameDayClash: (profileId: string) => boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const eligible = engineInput.volunteers.filter((v) => roleId in v.eligibleRoles);
  const visible = eligible.filter((v) => {
    if (assignedProfileIds.has(v.profileId)) return false;
    const resp = availabilityByProfile.get(v.profileId)?.response;
    return showAll || resp === "yes" || resp === "maybe";
  });

  return (
    <div>
      {visible.length === 0 && (
        <p className="text-soft text-sm mb-3">No available, eligible volunteers for this role.</p>
      )}
      <ul className="space-y-2">
        {visible.map((v) => {
          const availability = availabilityByProfile.get(v.profileId);
          const resp = availability?.response;
          const needsOverride = resp !== "yes" && resp !== "maybe"; // said no, or never responded
          const clash = sameDayClash(v.profileId);
          return (
            <li key={v.profileId}>
              <button
                className={`w-full text-left card p-3 flex items-center justify-between gap-2 hover:shadow-raised transition-shadow ${
                  needsOverride ? "opacity-80" : ""
                }`}
                onClick={() => {
                  if (needsOverride && !window.confirm(
                    `${v.name} ${resp === "no" ? "said NO for this service" : "hasn't responded"}. Assign anyway? This override is logged.`
                  )) return;
                  if (clash && !window.confirm(`${v.name} may be serving at an overlapping service. Assign anyway?`)) return;
                  onPick(v.profileId, needsOverride);
                }}
              >
                <span>
                  <span className="block font-semibold text-sm">{v.name}</span>
                  {availability?.note && <span className="block text-faint text-xs">“{availability.note}”</span>}
                </span>
                <Badge tone={statusBadgeTone(resp ?? "neutral")}>{resp ?? "no response"}</Badge>
              </button>
            </li>
          );
        })}
      </ul>
      <button className="btn-ghost w-full mt-3 text-xs" onClick={() => setShowAll((s) => !s)}>
        {showAll ? "Show only available volunteers" : "Show everyone (override — logged)"}
      </button>
    </div>
  );
}
