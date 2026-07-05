// Supabase browser client — Agent 1 owned path (PRD §9.3).
// RLS is the security boundary; this client only ever holds the anon key.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  // Fail loudly in dev; a blank screen with a console hint is worse.
  console.error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env.local"
  );
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true, // AUTH-4: session survives PWA restarts
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type { Database } from "./database.types";
