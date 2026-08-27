"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"magic" | "signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    if (mode === "magic") {
      // Passwordless: email the user a one-time sign-in link.
      // shouldCreateUser: false — strangers can't create accounts this way.
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
          shouldCreateUser: false,
        },
      });
      if (error) setError(error.message);
      else setMessage("Check your email — your sign-in link is on its way. (Look in spam too.)");
    } else if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error)
        setError(
          error.message === "Invalid login credentials"
            ? "Email or password didn't match. New here? Tap “Create account” above."
            : error.message
        );
      else {
        router.push("/");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else if (data.session) {
        // Email confirmation is disabled — the user is signed in immediately.
        router.push("/");
        router.refresh();
      } else {
        setMessage("Check your email to confirm your account, then sign in.");
      }
    }
    setLoading(false);
  }

  async function handleForgotPassword() {
    setError(null);
    setMessage(null);
    if (!email) {
      setError("Enter your email above first, then click reset.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    if (error) setError(error.message);
    else setMessage("If that email has an account, a password reset link is on its way. Check your inbox (and spam).");
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">FitTrack</h1>
          <p className="mt-1 text-sm text-muted">
            {mode === "magic"
              ? "Enter your email — we'll send you a sign-in link"
              : mode === "signin"
                ? "Welcome back"
                : "New here? Just pick a password"}
          </p>
        </div>

        {mode !== "magic" && (
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                  setMessage(null);
                }}
                className={`rounded-md py-2 text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground">Email</label>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm  focus:outline-none"
            />
          </div>
          {mode !== "magic" && (
            <div>
              <label className="block text-sm font-medium text-foreground">Password</label>
              <input
                type="password"
                name="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm  focus:outline-none"
              />
            </div>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
          {message && <p className="text-sm text-accent">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-accent py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading
              ? "Please wait..."
              : mode === "magic"
                ? "Email me a sign-in link"
                : mode === "signin"
                  ? "Sign in"
                  : "Sign up"}
          </button>

          {mode === "signin" && (
            <button
              type="button"
              onClick={handleForgotPassword}
              className="w-full text-center text-xs text-muted hover:text-foreground"
            >
              Forgot password?
            </button>
          )}
        </form>

        <button
          onClick={() => {
            setMode(mode === "magic" ? "signin" : "magic");
            setError(null);
            setMessage(null);
          }}
          className="w-full text-center text-sm text-muted hover:text-foreground"
        >
          {mode === "magic"
            ? "Use password instead"
            : "Email me a sign-in link instead (no password)"}
        </button>
      </div>
    </div>
  );
}
