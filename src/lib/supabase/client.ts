// Supabase browser client — Agent 1 owned path (PRD §9.3).
// RLS is the security boundary; this client only ever holds the anon key.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // A human-readable failure beats a blank white screen: createClient throws
  // on a missing URL and would take the whole app down before first paint.
  document.getElementById("root")!.innerHTML =
    '<div style="font-family:system-ui;padding:3rem;text-align:center">' +
    "<h1>Configuration problem</h1>" +
    "<p>The app is missing its VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY environment variables.<br>" +
    "If you deployed on Vercel: Settings → Environment Variables, then redeploy.</p></div>";
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true, // AUTH-4: session survives PWA restarts
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type { Database } from "./database.types";
