import { NextRequest, NextResponse } from "next/server";
import { invokeEdgeFunction } from "@/lib/edge";

// Meal analysis from a photo, a description, or both.
//
// This is now a thin proxy to the `analyze-photo` Edge Function, which the iOS
// app calls too. All the real work — auth, entitlement, quota, spend cap, image
// validation, model choice, usage recording — happens there, so both clients
// get identical limits. See src/lib/edge.ts for why.
//
// The route is kept (rather than pointing the browser straight at the function)
// so the client keeps talking to a same-origin URL. That avoids CORS entirely
// and means the Supabase function URL is not baked into the page.

export async function POST(req: NextRequest) {
  let body: { image?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : undefined;
  const description = body.description?.trim() ?? "";

  if (!image && !description) {
    return NextResponse.json(
      { error: "Describe the meal or attach a photo (or both)." },
      { status: 400 }
    );
  }

  // `mediaType` is deliberately not forwarded. The function sniffs the real
  // type from the image's magic bytes and ignores any client claim, so passing
  // one along would be theatre — a caller can always lie about it.
  const { status, body: result } = await invokeEdgeFunction("analyze-photo", {
    image,
    description,
  });

  return NextResponse.json(result, { status });
}
