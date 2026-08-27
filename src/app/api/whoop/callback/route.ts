import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCodeForToken, whoopRedirectUri } from "@/lib/whoop";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  const redirectToWhoop = (params: URLSearchParams) => {
    const res = NextResponse.redirect(`${origin}/whoop?${params.toString()}`);
    res.cookies.delete("whoop_oauth_state");
    return res;
  };

  if (error) {
    return redirectToWhoop(new URLSearchParams({ connectionError: error }));
  }
  if (!code) {
    return redirectToWhoop(new URLSearchParams({ connectionError: "missing_code" }));
  }

  // CSRF: state must match the cookie we set in /authorize.
  const cookieState = req.cookies.get("whoop_oauth_state")?.value;
  if (!state || !cookieState || state !== cookieState) {
    return redirectToWhoop(new URLSearchParams({ connectionError: "state_mismatch" }));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  try {
    const token = await exchangeCodeForToken(code, whoopRedirectUri(origin));
    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

    const { error: upErr } = await supabase.from("whoop_connections").upsert({
      user_id: user.id,
      access_token: token.access_token,
      ...(token.refresh_token ? { refresh_token: token.refresh_token } : {}),
      expires_at: expiresAt,
      scope: token.scope ?? null,
      updated_at: new Date().toISOString(),
    });
    if (upErr) throw upErr;

    return redirectToWhoop(new URLSearchParams({ connected: "1" }));
  } catch (err) {
    return redirectToWhoop(
      new URLSearchParams({ connectionError: (err as Error).message })
    );
  }
}
