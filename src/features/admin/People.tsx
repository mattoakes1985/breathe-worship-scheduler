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
      const [profiles, memberships, roles, eligibility, team, legacy] = await Promise.all([
        supabase.from("profiles").select("*").order("full_name"),
        supabase.from("team_memberships").select("*"),
        supabase.from("roles").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("role_eligibility").select("*"),
        supabase.from("teams").select("id").limit(1).single(),
        supabase.from("legacy_assignments").select("person_name").is("claimed_profile_id", null),
      ]);
      const legacyCounts = new Map<string, number>();
      for (const l of legacy.data ?? []) {
        legacyCounts.set(l.person_name, (legacyCounts.get(l.person_name) ?? 0) + 1);
      }
      return {
        profiles: (profiles.data ?? []) as Profile[],
        memberships: memberships.data ?? [],
        roles: roles.data ?? [],
        eligibility: eligibility.data ?? [],
        teamId: team.data?.id as string,
        legacyNames: [...legacyCounts.entries()].sort((a, b) => b[1] - a[1]),
      };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-people"] });

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [invitedName, setInvitedName] = useState("");

  const invite = useMutation({
    mutationFn: async (args: { email: string; fullName: string }) => {
      const { data, error } = await supabase.functions.invoke("invite-volunteer", {
        body: { ...args, redirectTo: window.location.origin },
      });
      if (error) {
        // Surface the function's real error body instead of a guess
        const ctx = (error as { context?: Response }).context;
        if (ctx) {
          const body = await ctx.json().catch(() => null);
          throw new Error(body?.error ?? error.message);
        }
        throw error;
      }
      if (data?.error) throw new Error(data.error);
      return data as { inviteLink: string };
    },
    onSuccess: (data, args) => {
      invalidate();
      setInviteOpen(false);
      setInviteLink(data.inviteLink);
      setInvitedName(args.fullName);
      setMsg(null);
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

  const claimLegacy = useMutation({
    mutationFn: async (args: { personName: string; profileId: string }) => {
      const { data, error } = await supabase.rpc("claim_legacy_history", {
        p_person_name: args.personName,
        p_profile_id: args.profileId,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      invalidate();
      setMsg(`Linked ${n} past services to this volunteer — their serving story and fairness history are now live.`);
    },
    onError: (e) => setMsg((e as Error).message),
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
        back="/admin"
        title="People"
        subtitle="Invite-only — volunteers can't sign themselves up."
        action={
          <button className="btn-primary" onClick={() => setInviteOpen(true)}>
            <UserPlus size={16} /> Invite
          </button>
        }
      />
      {msg && <p className="text-soft text-sm card p-3">{msg}</p>}

      {inviteLink && (
        <div className="card p-4">
          <p className="font-semibold text-sm mb-1">Invite link for {invitedName} — send it to them yourself</p>
          <p className="text-soft text-xs mb-2">
            No email is sent automatically. Share this link by WhatsApp or text; it lets them set a
            password and sign in. Treat it like a key — it's their account.
          </p>
          <div className="flex gap-2">
            <input className="input text-xs" readOnly value={inviteLink} onFocus={(e) => e.target.select()} />
            <button className="btn-secondary shrink-0" onClick={() => navigator.clipboard.writeText(inviteLink)}>
              Copy
            </button>
            <a
              className="btn-primary shrink-0"
              href={`https://wa.me/?text=${encodeURIComponent(
                `Hi ${invitedName.split(" ")[0]}! You're invited to the Breathe Worship rota app. Set up your account here: ${inviteLink}`
              )}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
            <button className="btn-ghost shrink-0" onClick={() => setInviteLink(null)}>
              Done
            </button>
          </div>
        </div>
      )}

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

            {data!.legacyNames.length > 0 && (
              <div className="border-t border-line pt-4">
                <h3 className="font-display font-bold text-sm mb-1">Link spreadsheet history</h3>
                <p className="text-soft text-xs mb-2">
                  Tap the name(s) this person went by in the old rota spreadsheet. Their past serving
                  becomes real history — stats, streaks and fair scheduling from day one. Likely
                  matches first.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[...data!.legacyNames]
                    .sort((a, b) => {
                      const nameMatch = (n: string) =>
                        n.toLowerCase().split(" ")[0] === selected.full_name.toLowerCase().split(" ")[0] ? -1 : 0;
                      return nameMatch(a[0]) - nameMatch(b[0]) || b[1] - a[1];
                    })
                    .map(([name, count]) => (
                      <button
                        key={name}
                        className={`chip min-h-[36px] ${
                          name.toLowerCase().split(" ")[0] === selected.full_name.toLowerCase().split(" ")[0]
                            ? "bg-accent text-white"
                            : "bg-raised text-soft"
                        }`}
                        disabled={claimLegacy.isPending}
                        onClick={() => {
                          if (window.confirm(`Link "${name}" (${count} past services) to ${selected.full_name}? This adds their serving history permanently.`))
                            claimLegacy.mutate({ personName: name, profileId: selected.id });
                        }}
                      >
                        {name} · {count}
                      </button>
                    ))}
                </div>
              </div>
            )}

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
