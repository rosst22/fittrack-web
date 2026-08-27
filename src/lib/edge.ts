import { createClient } from "@/lib/supabase/server";

// Calls a Supabase Edge Function as the signed-in user.
//
// WHY THIS EXISTS
//
// The AI features used to call Anthropic directly from Next.js route handlers,
// which meant the web app and the iOS app each enforced their own limits. They
// disagreed badly — web allowed $1.00/day of spend with no call limits at all,
// while iOS free was capped at $0.04/day and 3 photo meals. Two codebases
// implementing the same paywall is a bug factory, and the numbers had already
// drifted 25x apart.
//
// Now both clients call the same Edge Functions, so `_shared/guard.ts` in the
// functions repo is the single source of truth for tiers, quotas, model choice
// and spend caps. Changing a limit is one edit in one place.
//
// The user's access token is forwarded so the function can identify the caller.
// Everything it does with that identity — entitlement lookup, quota count,
// usage recording — happens server-side inside the function, because a client
// can lie about its own tier but cannot forge a signed token.

export type EdgeResult = {
  status: number;
  body: unknown;
};

/**
 * POST a JSON body to an Edge Function, authenticated as the current user.
 *
 * Returns the function's status and parsed body untouched, so callers can pass
 * quota errors (429) and their `usage`/`upgrade` fields straight through to the
 * browser rather than flattening them into a generic failure.
 */
export async function invokeEdgeFunction(
  name: string,
  payload: unknown
): Promise<EdgeResult> {
  const supabase = await createClient();

  // getSession() rather than getUser(): we need the raw access token to
  // forward, not just the decoded user. The function re-validates it anyway.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return { status: 401, body: { error: "Not signed in" } };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    return { status: 500, body: { error: "NEXT_PUBLIC_SUPABASE_URL is not configured" } };
  }

  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      // Photo analysis on a cold function start can be slow; well under
      // Vercel's function ceiling but above fetch's default expectations.
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    // A dead or slow function must produce a clear message, not a bare 500.
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      status: 504,
      body: {
        error: timedOut
          ? "The AI service took too long to respond. Please try again."
          : "Could not reach the AI service. Please try again.",
      },
    };
  }

  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: { error: text || "Unexpected AI service response" } };
  }
}
