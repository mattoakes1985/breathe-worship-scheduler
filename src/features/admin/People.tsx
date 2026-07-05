// PPL-1/3/4, AUTH-1/5, §8.3 GDPR: volunteer management, invites, role
// eligibility, deactivation (never deletion), export + anonymising erasure.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { Badge, Card, Field, Modal, PageHeader, Spinner } from "@/components/ui";
import type { Tables, TablesUpdate } from "@/lib/supabase/database.types";

type Profile = Tables<"profiles">;

export default function People() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Profile | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-people"],
    queryFn: async () => {
      const [profiles, memberships, roles, eligibility, team] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("team_memberships").select("*"),
        supabase.from("roles").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("role_eligibility").select("*"),
        supabase.from("teams").select("id").limit(1).single(),
      ]);
      return {
        profiles: (profiles.data ?? []) as Profile[],
        memberships: memberships.data ?? [],
        roles: roles.data ?? [],
        eligibility: eligibility.data ?? [],
        teamId: team.data?.id as string,
      };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-people"] });

  const invite = useMutation({
    mutationFn: async (args: { email: string; fullName: string }) => {
      const { data, error } = await supabase.functions.invoke("invite-volunteer", { body: args });
      if (error) throw new Error("Invite failed — is the invite-volunteer Edge Function deployed?");
      return data;
    },
    onSuccess: () => {
      invalidate();
      setInviteOpen(false);
      setMsg("Invite sent.");
    },
    onError: (e) => setMsg((e as Error).message),
  });

  const patchProfile = useMutation({
    mutationFn: async (args: { id: string; patch: Partial<Profile> }) => {
      const { error } = await supabase.from("profiles").update(args.patch).eq("id", args.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const toggleMembership = useMutation({
    mutationFn: async (args: { profileId: string; field: "is_team_lead" | "is_active"; value: boolean }) => {
      const existing = data!.memberships.find((m) => m.profile_id === args.profileId);
      const patch: TablesUpdate<"team_memberships"> =
        args.field === "is_team_lead" ? { is_team_lead: args.value } : { is_active: args.value };
      if (existing) {
        const { error } = await supabase.from("team_memberships").update(patch).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("team_memberships").insert({
          team_id: data!.teamId,
          profile_id: args.profileId,
          is_team_lead: args.field === "is_team_lead" ? args.value : false,
          is_active: args.field === "is_active" ? args.value : true,
        });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const toggleEligibility = useMutation({
    mutationFn: async (args: { profileId: string; roleId: string; eligible: boolean }) => {
      if (args.eligible) {
        const { error } = await supabase.from("role_eligibility").upsert(
          { profile_id: args.profileId, role_id: args.roleId, is_active: true },
          { onConflict: "profile_id,role_id" }
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("role_eligibility")
          .update({ is_active: false })
          .eq("profile_id", args.profileId)
          .eq("role_id", args.roleId);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const exportData = useMutation({
    mutationFn: async (profileId: string) => {
      const { data, error } = await supabase.rpc("export_profile_data", { p_profile_id: profileId });
      if (error) throw error;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `volunteer-data-export-${profileId}.json`;
      a.click();
    },
  });

  const erase = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase.rpc("erase_profile_personal_data", { p_profile_id: profileId });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setSelected(null);
    },
  });

  if (isLoading) return <Spinner label="Loading the team…" />;

  const membershipFor = (id: string) => data!.memberships.find((m) => m.profile_id === id);
  const eligibleRoleIds = (id: string) =>
    new Set(data!.eligibility.filter((e) => e.profile_id === id && e.is_active).map((e) => e.role_id));

  return (
    <div className="space-y-4">
      <PageHeader
        title="People"
        subtitle="Invite-only — volunteers can't sign themselves up."
        action={
          <button className="btn-primary" onClick={() => setInviteOpen(true)}>
            <UserPlus size={16} /> Invite
          </button>
        }
      />
      {msg && <p className="text-soft text-sm card p-3">{msg}</p>}

      <Card className="!p-0 divide-y divide-line">
        {data!.profiles.map((p) => {
          const m = membershipFor(p.id);
          return (
            <button
              key={p.id}
              className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-raised transition-colors"
              onClick={() => setSelected(p)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{p.full_name}</p>
                <p className="text-soft text-xs truncate">{p.email}</p>
              </div>
              {p.is_admin && <Badge tone="info">admin</Badge>}
              {m?.is_team_lead && <Badge tone="accent">team lead</Badge>}
              {!p.is_active && <Badge tone="danger">deactivated</Badge>}
            </button>
          );
        })}
      </Card>

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite a volunteer">
        <InviteForm onSubmit={(email, fullName) => invite.mutate({ email, fullName })} busy={invite.isPending} />
      </Modal>

      <Modal open={selected !== null} onClose={() => setSelected(null)} title={selected?.full_name ?? ""}>
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary"
                onClick={() => patchProfile.mutate({ id: selected.id, patch: { is_active: !selected.is_active } })}
              >
                {selected.is_active ? "Deactivate (keeps history)" : "Reactivate"}
              </button>
              <button
                className="btn-secondary"
                onClick={() => patchProfile.mutate({ id: selected.id, patch: { is_admin: !selected.is_admin } })}
              >
                {selected.is_admin ? "Remove admin" : "Make admin"}
              </button>
              <button
                className="btn-secondary"
                onClick={() =>
                  toggleMembership.mutate({
                    profileId: selected.id,
                    field: "is_team_lead",
                    value: !membershipFor(selected.id)?.is_team_lead,
                  })
                }
              >
                {membershipFor(selected.id)?.is_team_lead ? "Remove team lead" : "Make team lead"}
              </button>
            </div>

            <div>
              <h3 className="font-display font-bold text-sm mb-2">Role eligibility</h3>
              <div className="flex flex-wrap gap-2">
                {data!.roles.map((r) => {
                  const on = eligibleRoleIds(selected.id).has(r.id);
                  return (
                    <button
                      key={r.id}
                      className={`chip min-h-[36px] ${on ? "bg-accent text-white" : "bg-raised text-soft"}`}
                      onClick={() => toggleEligibility.mutate({ profileId: selected.id, roleId: r.id, eligible: !on })}
                    >
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-line pt-4">
              <h3 className="font-display font-bold text-sm mb-2">UK GDPR</h3>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={() => exportData.mutate(selected.id)}>
                  Export their data
                </button>
                <button
                  className="btn-danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Permanently anonymise this volunteer's personal details? Rota history is preserved but their name becomes 'Former volunteer'. This cannot be undone."
                      )
                    )
                      erase.mutate(selected.id);
                  }}
                >
                  Erase personal data
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function InviteForm({ onSubmit, busy }: { onSubmit: (email: string, fullName: string) => void; busy: boolean }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  return (
    <div className="space-y-3">
      <Field label="Full name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <button
        className="btn-primary w-full"
        disabled={busy || !email || !name}
        onClick={() => onSubmit(email, name)}
      >
        {busy ? "Sending…" : "Send invite"}
      </button>
      <p className="text-faint text-xs">
        They'll get an email to set a password. After they accept, come back here to add their team
        membership and role eligibility.
      </p>
    </div>
  );
}
