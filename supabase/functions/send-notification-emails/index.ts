// Email dispatch (§12): sends unsent in-app notifications via Resend.
// NOT YET DEPLOYED — needs `supabase secrets set RESEND_API_KEY=...` first,
// then deploy and schedule (pg_cron http call or Supabase scheduled trigger,
// e.g. every 5 minutes). Failure never blocks the in-app notification (§8.5).
import { createClient } from "npm:@supabase/supabase-js@2";

const FROM = "Breathe Worship <rota@updates.breathenewlife.church>"; // verify domain in Resend first

Deno.serve(async () => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return new Response("RESEND_API_KEY not configured", { status: 500 });

  // in_app rows are the queue; sent_via flips to 'email' once dispatched
  const { data: pending } = await admin
    .from("notifications")
    .select("id, title, body, profile_id, profiles!inner(email, is_active), created_at")
    .eq("sent_via", "in_app")
    .gte("created_at", new Date(Date.now() - 864e5).toISOString())
    .limit(50);

  let sent = 0;
  for (const n of pending ?? []) {
    const p = n.profiles as unknown as { email: string; is_active: boolean };
    if (!p.is_active || p.email.endsWith("@invalid.local")) continue;
    const { data: prefs } = await admin
      .from("notification_preferences")
      .select("email_enabled")
      .eq("profile_id", n.profile_id)
      .maybeSingle();
    if (prefs && !prefs.email_enabled) continue;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: p.email,
        subject: n.title,
        text: `${n.body ?? ""}\n\nOpen the app: https://YOUR-PRODUCTION-DOMAIN`,
      }),
    });
    if (res.ok) {
      await admin.from("notifications").update({ sent_via: "email" }).eq("id", n.id);
      sent++;
    }
  }
  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
