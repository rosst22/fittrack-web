import { NextRequest, NextResponse } from "next/server";
import { WHOOP_AUTH_URL, WHOOP_SCOPES, whoopRedirectUri } from "@/lib/whoop";

export async function GET(req: NextRequest) {
  const clientId = process.env.WHOOP_CLIENT_ID?.trim();
  const clientSecret = process.env.WHOOP_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    const missing = !clientId ? "WHOOP_CLIENT_ID" : "WHOOP_CLIENT_SECRET";
    return NextResponse.json({ error: `${missing} is not configured` }, { status: 500 });
  }

  const origin = req.nextUrl.origin;
  // WHOOP requires an eight-character state value.
  const state = crypto.randomUUID().replaceAll("-", "").slice(0, 8);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: whoopRedirectUri(origin),
    scope: WHOOP_SCOPES,
    state,
  });

  const res = NextResponse.redirect(`${WHOOP_AUTH_URL}?${params.toString()}`);
  // Store state in an httpOnly cookie for CSRF validation on callback.
  res.cookies.set("whoop_oauth_state", state, {
    httpOnly: true,
    secure: origin.startsWith("https"),
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
