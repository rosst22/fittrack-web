import { NextRequest, NextResponse } from "next/server";
import { invokeEdgeFunction } from "@/lib/edge";

// The AI coach.
//
// A thin proxy to the `coach-chat` Edge Function, shared with the iOS app.
// Auth, entitlement, quota, spend cap, model choice (Haiku for free, Sonnet for
// Pro) and usage recording all live in the function. So does the "today's
// numbers" context the coach answers with — it is fetched server-side from the
// same database, so neither client has to assemble or send it.
//
// One behaviour change worth knowing: usage is now recorded under the feature
// name `coach_chat`, matching iOS. Older web rows written as `chat` are simply
// not counted by the new quota, which only ever makes limits more generous for
// existing users on the day of the switch.

export async function POST(req: NextRequest) {
  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "No message to answer" }, { status: 400 });
  }

  // Message trimming and sanitising happen inside the function, so that the
  // rules cannot differ between the two clients.
  const { status, body: result } = await invokeEdgeFunction("coach-chat", {
    messages: body.messages,
  });

  return NextResponse.json(result, { status });
}
