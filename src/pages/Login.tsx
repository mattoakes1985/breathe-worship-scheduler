// AUTH-1/2/3: invite-only. No sign-up form exists — only login + magic link + reset.
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { Field } from "@/components/ui";

type Mode = "password" | "magic" | "reset";

export default function Login() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        // AUTH-2: never reveal whether the email exists
        if (error) throw new Error("Email or password isn't right. Try again, or use a magic link.");
        navigate("/");
      } else if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false }, // invite-only (AUTH-1)
        });
        if (error) throw new Error("We couldn't send a link to that address.");
        setInfo("Check your inbox — your sign-in link is on its way.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw new Error("We couldn't send a reset email to that address.");
        setInfo("If that address has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <img src="/brand/breathe-black-colour.png" alt="Breathe Worship" className="h-28 object-contain dark:hidden" />
          <img src="/brand/breathe-all-white.png" alt="Breathe Worship" className="h-28 object-contain hidden dark:block" />
        </div>
        <div className="card p-6">
          <h1 className="text-xl font-bold mb-1">
            {mode === "password" ? "Welcome back" : mode === "magic" ? "Magic link sign-in" : "Reset your password"}
          </h1>
          <p className="text-soft text-sm mb-5">
            This app is invite-only. No account? Contact your team lead.
          </p>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <input
                className="input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            {mode === "password" && (
              <Field label="Password">
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
            )}
            {error && <p className="text-danger text-sm" role="alert">{error}</p>}
            {info && <p className="text-positive text-sm" role="status">{info}</p>}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "One moment…" : mode === "password" ? "Sign in" : mode === "magic" ? "Send magic link" : "Send reset link"}
            </button>
          </form>
          <div className="flex flex-col gap-1 mt-4 text-sm">
            {mode !== "magic" && (
              <button className="text-accent-strong font-semibold text-left" onClick={() => setMode("magic")}>
                Email me a magic link instead
              </button>
            )}
            {mode !== "password" && (
              <button className="text-accent-strong font-semibold text-left" onClick={() => setMode("password")}>
                Sign in with a password
              </button>
            )}
            {mode !== "reset" && (
              <button className="text-soft text-left" onClick={() => setMode("reset")}>
                Forgotten your password?
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-faint text-xs mt-6">
          <Link to="/privacy" className="underline">Privacy & data</Link> · Breathe New Life Church
        </p>
      </div>
    </div>
  );
}
