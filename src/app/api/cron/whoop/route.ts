import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncWhoopForUser } from "@/lib/whoopSync";

// Nightly Whoop refresh for every connected user.
//
// Why this exists: syncing only ever happened when someone pressed "Sync now",
// so a user who never opens the Whoop tab sees stale recovery/sleep data
// forever. This keeps snapshots current without anyone touching the app.
//
// Runs on a schedule via the crons entry in vercel.json.

// Whoop calls are network-bound and run per user, so give the function more
// than the default budget before Vercel kills it.
export const maxDuration = 300;

// Never serve a cached response for this route.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // This endpoint is a public URL that mutates every user's data, so it must
  // prove the caller is Vercel's scheduler. Vercel sends CRON_SECRET as a
  // bearer token when that env var is set. Refusing to run without the secret
  // configured is deliberate: failing closed beats leaving it open.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 }
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // RLS scopes every row to auth.uid(), and a cron has no logged-in user, so a
  // normal client would read back zero connections. The service-role client
  // bypasses RLS — which is exactly why it lives only in this trusted path.
  //
  // Caught explicitly: an uncaught throw here returns a bare 500 with no body,
  // which is miserable to diagnose from a cron log at 9am.
  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const { data: connections, error } = await supabase
    .from("whoop_connections")
    .select("user_id");

  if (error) {
    return NextResponse.json(
      { error: `Failed to list connections: ${error.message}` },
      { status: 500 }
    );
  }

  const results = { synced: 0, skipped: 0, failed: 0 };
  const failures: { userId: string; message: string }[] = [];

  // Sequential on purpose: syncing every user at once would burst Whoop's API
  // and risk rate limiting. This runs unattended at night, so it can be slow.
  for (const { user_id: userId } of connections ?? []) {
    try {
      const synced = await syncWhoopForUser(supabase, userId);
      if (synced) results.synced += 1;
      else results.skipped += 1;
    } catch (err) {
      // One user's revoked token must not abort everyone else's sync.
      results.failed += 1;
      failures.push({ userId, message: (err as Error).message });
    }
  }

  return NextResponse.json({ ...results, failures });
}
