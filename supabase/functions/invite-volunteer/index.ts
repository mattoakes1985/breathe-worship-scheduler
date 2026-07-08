// AUTH-1: invite-only account creation. Admin-triggered.
// Uses generateLink (no email send) — the built-in Supabase mailer only
// delivers to project team members, and custom SMTP is pending domain
// permission. The admin shares the returned link directly (WhatsApp/text),
// which suits a small team better anyway.
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: cors });
    }
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .single();
    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: cors });
    }

    const { email, fullName, redirectTo } = await req.json();
    if (!email || !fullName) {
      return new Response(JSON.stringify({ error: "email and fullName required" }), { status: 400, headers: cors });
    }

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: { full_name: fullName },
        redirectTo: redirectTo || undefined,
      },
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: cors });
    }
    return new Response(
      JSON.stringify({ userId: data.user?.id, inviteLink: data.properties?.action_link }),
      { headers: { ...cors, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: cors });
  }
});
