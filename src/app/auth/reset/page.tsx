"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // The recovery link puts a token in the URL; the browser client exchanges
    // it for a temporary session. Watch for that session, with a fallback.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setReady(true);
        return;
      }
      // PKCE recovery links carry a ?code= param to exchange manually.
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) setReady(true);
        else setLinkError("This reset link is invalid or has expired. Request a new one.");
      } else {
        // Give onAuthStateChange a moment, then error if still nothing.
        setTimeout(async () => {
          const { data: d2 } = await supabase.auth.getSession();
          if (!d2.session)
            setLinkError("This reset link is invalid or has expired. Request a new one.");
        }, 2500);
      }
    })();

    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-surface p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">Set a new password</h1>
          <p className="mt-1 text-sm text-muted">Choose a password you&apos;ll remember.</p>
        </div>

        {linkError ? (
          <div className="space-y-4">
            <p className="text-sm text-danger">{linkError}</p>
            <a
              href="/login"
              className="block w-full rounded-md bg-accent py-2 text-center text-sm font-semibold text-white hover:opacity-90"
            >
              Back to sign in
            </a>
          </div>
        ) : !ready ? (
          <p className="text-center text-sm text-muted">Verifying your reset link…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground">New password</label>
              <input
                type="password"
                name="new-password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground">Confirm password</label>
              <input
                type="password"
                name="confirm-password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-accent py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
