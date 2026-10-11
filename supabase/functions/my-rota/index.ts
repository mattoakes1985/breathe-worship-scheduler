// Per-volunteer iCal feed: subscribe once in Apple/Google Calendar and every
// confirmed assignment just appears. Auth = unguessable token from the
// owner-only calendar_tokens table (WO-2; verify_jwt disabled deliberately —
// calendar apps can't send JWTs). Tokens are rotatable from Preferences.
import { createClient } from "npm:@supabase/supabase-js@2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RFC 5545 TEXT escaping. Also strips CR/LF so a value can never start a new
 *  iCal property (header-injection style), and drops other control chars. */
export function icsText(v: string): string {
  return v
    .replace(/[\r\n]+/g, " ")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .trim();
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function ics(events: { uid: string; date: string; start: string; end: string | null; title: string; role: string }[]) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Breathe Worship Scheduler//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Breathe Worship — My Rota",
    "X-WR-TIMEZONE:Europe/London",
    // Service times are UK wall-clock times; say so, so a phone abroad shows
    // them correctly instead of treating them as "floating" local times.
    "BEGIN:VTIMEZONE",
    "TZID:Europe/London",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0000",
    "TZOFFSETTO:+0100",
    "TZNAME:BST",
    "DTSTART:19700329T010000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0000",
    "TZNAME:GMT",
    "DTSTART:19701025T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const e of events) {
    const d = e.date.replace(/[^0-9]/g, "");
    const t = (s: string) => s.replace(/[^0-9]/g, "").slice(0, 4).padEnd(4, "0") + "00";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid.replace(/[^0-9a-f-]/gi, "")}@breathe-worship`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Europe/London:${d}T${t(e.start)}`,
      `DTEND;TZID=Europe/London:${d}T${e.end ? t(e.end) : t(e.start)}`,
      `SUMMARY:${icsText(`${e.role} — ${e.title}`)}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!UUID.test(token)) return new Response("Missing or malformed token", { status: 400 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: tok } = await admin.from("calendar_tokens").select("profile_id").eq("token", token).maybeSingle();
  if (!tok) return new Response("Not found", { status: 404 });
  const { data: profile } = await admin.from("profiles").select("id").eq("id", tok.profile_id).eq("is_active", true).maybeSingle();
  if (!profile) return new Response("Not found", { status: 404 });

  const { data: assignments } = await admin
    .from("assignments")
    .select("id, status, roles(name), services!inner(title, service_date, start_time, end_time, status)")
    .eq("profile_id", profile.id)
    .in("status", ["invited", "confirmed"]);

  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const events = (assignments ?? [])
    .filter((a) => {
      const s = a.services as unknown as { status: string; service_date: string };
      return s.status === "published" && s.service_date >= since;
    })
    .map((a) => {
      const s = a.services as unknown as { title: string; service_date: string; start_time: string; end_time: string | null };
      return {
        uid: a.id,
        date: s.service_date,
        start: s.start_time,
        end: s.end_time,
        title: s.title,
        role: (a.roles as unknown as { name: string } | null)?.name ?? "Serving",
      };
    });

  return new Response(ics(events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
});
