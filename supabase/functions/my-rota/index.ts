// Per-volunteer iCal feed: subscribe once in Apple/Google Calendar and every
// confirmed assignment just appears. Auth = unguessable calendar_token
// (verify_jwt disabled deliberately; calendar apps can't send JWTs).
import { createClient } from "npm:@supabase/supabase-js@2";

function ics(events: { uid: string; date: string; start: string; end: string | null; title: string; role: string }[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Breathe Worship Scheduler//EN",
    "X-WR-CALNAME:Breathe Worship — My Rota",
  ];
  for (const e of events) {
    const d = e.date.replace(/-/g, "");
    const t = (s: string) => s.replace(/:/g, "").slice(0, 4) + "00";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@breathe-worship`,
      `DTSTART:${d}T${t(e.start)}`,
      `DTEND:${d}T${e.end ? t(e.end) : t(e.start)}`,
      `SUMMARY:${e.role} — ${e.title.replace(/[,;]/g, " ")}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return new Response("Missing token", { status: 400 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("calendar_token", token)
    .eq("is_active", true)
    .maybeSingle();
  if (!profile) return new Response("Not found", { status: 404 });

  const { data: assignments } = await admin
    .from("assignments")
    .select("id, status, roles(name), services!inner(title, service_date, start_time, end_time, status)")
    .eq("profile_id", profile.id)
    .in("status", ["invited", "confirmed"]);

  const events = (assignments ?? [])
    .filter((a) => {
      const s = a.services as { status: string; service_date: string };
      return s.status === "published" && s.service_date >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    })
    .map((a) => {
      const s = a.services as { title: string; service_date: string; start_time: string; end_time: string | null };
      return {
        uid: a.id,
        date: s.service_date,
        start: s.start_time,
        end: s.end_time,
        title: s.title,
        role: (a.roles as { name: string } | null)?.name ?? "Serving",
      };
    });

  return new Response(ics(events), {
    headers: { "Content-Type": "text/calendar; charset=utf-8" },
  });
});
