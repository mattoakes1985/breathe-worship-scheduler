// AVAIL-4: serving-frequency preference — a soft cap, stored separately from
// availability. "Available" and "want to be asked every time" are different facts.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card, Field, PageHeader, Spinner } from "@/components/ui";

export default function Preferences() {
  const { session, profile, refreshProfile } = useAuth();
  const uid = session!.user.id;
  const qc = useQueryClient();

  const { data: pref, isLoading } = useQuery({
    queryKey: ["serving-preference", uid],
    queryFn: async () => {
      const { data } = await supabase
        .from("serving_preferences")
        .select("*")
        .eq("profile_id", uid)
        .maybeSingle();
      return data;
    },
  });

  const [hasCap, setHasCap] = useState(false);
  const [max, setMax] = useState(2);
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [note, setNote] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (pref) {
      setHasCap(pref.max_services_per_period != null);
      setMax(pref.max_services_per_period ?? 2);
      setPeriod((pref.period_type as "week" | "month") ?? "month");
      setNote(pref.note ?? "");
    }
  }, [pref]);

  useEffect(() => {
    setPreferredName(profile?.preferred_name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile]);

  const save = useMutation({
    mutationFn: async () => {
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from("serving_preferences").upsert(
          {
            profile_id: uid,
            team_id: null,
            max_services_per_period: hasCap ? max : null,
            period_type: period,
            note: note || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "profile_id,team_id" }
        ),
        supabase
          .from("profiles")
          .update({ preferred_name: preferredName || null, phone: phone || null })
          .eq("id", uid),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["serving-preference"] });
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (isLoading) return <Spinner label="Loading your preferences…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Preferences"
        subtitle="How often you'd like to serve — separate from your availability, and always your call."
      />

      <Card>
        <h2 className="font-display font-bold mb-1">Serving frequency</h2>
        <p className="text-soft text-sm mb-4">
          Saying "yes, I'm free" never means "ask me every week." Set a rhythm you can sustain — the
          rota builder respects it, and your team lead sees it when scheduling.
        </p>
        <label className="flex items-center gap-3 mb-4 min-h-[44px]">
          <input
            type="checkbox"
            className="w-5 h-5 accent-[#17948C]"
            checked={hasCap}
            onChange={(e) => setHasCap(e.target.checked)}
          />
          <span className="text-sm font-semibold">I'd like a limit on how often I'm scheduled</span>
        </label>
        {hasCap && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="At most">
              <select className="input" value={max} onChange={(e) => setMax(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "service" : "services"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Per">
              <select className="input" value={period} onChange={(e) => setPeriod(e.target.value as "week" | "month")}>
                <option value="week">week</option>
                <option value="month">month</option>
              </select>
            </Field>
          </div>
        )}
        <div className="mt-3">
          <Field label="Anything your team lead should know? (optional)">
            <textarea className="input py-2.5" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card>
        <h2 className="font-display font-bold mb-4">Your details</h2>
        <div className="space-y-3">
          <Field label="Preferred name" hint="How you'd like to appear on the rota">
            <input className="input" value={preferredName} onChange={(e) => setPreferredName(e.target.value)} />
          </Field>
          <Field label="Phone">
            <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
      </Card>

      <button className="btn-primary w-full" onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "Saving…" : saved ? "Saved ✓" : "Save preferences"}
      </button>
    </div>
  );
}
