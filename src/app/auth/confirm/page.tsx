"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Signup confirmation links land here (sign-in itself is password-only).
// Mirrors /auth/reset: the link carries a token (hash) or ?code= (PKCE);
// exchange it for a session, then go home. Kept working so the app still
// behaves if a deployment leaves Supabase email confirmation switched on.
export default function ConfirmSignInPage() {
  const router = useRouter();
  const supabase = createClient();
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.push("/");
        router.refresh();
      }
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.push("/");
        router.refresh();
        return;
      }
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) setLinkError("This sign-in link is invalid or has expired. Request a new one.");
        // Success is handled by onAuthStateChange above.
      } else {
        setTimeout(async () => {
          const { data: d2 } = await supabase.auth.getSession();
          if (!d2.session)
            setLinkError("This sign-in link is invalid or has expired. Request a new one.");
        }, 2500);
      }
    })();

    return () => sub.subscription.unsubscribe();
  }, [supabase, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-surface p-8 shadow-sm">
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
        ) : (
          <p className="text-center text-sm text-muted">Signing you in…</p>
        )}
      </div>
    </div>
  );
}
