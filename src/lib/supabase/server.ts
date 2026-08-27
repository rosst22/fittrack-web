import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component; ignore if middleware refreshes sessions
          }
        },
      },
    }
  );
}

// A client that bypasses Row Level Security, for trusted server-only work that
// has no logged-in user (the nightly Whoop cron, which must read every user's
// connection). The service role key must never reach the browser: it is not
// NEXT_PUBLIC_, and this module is server-only.
//
// Cookie handlers are deliberately no-ops — there is no session to read or
// refresh here, and the key alone grants full access. Using createServerClient
// keeps the returned type identical to createClient() above, so helpers like
// syncWhoopWorkouts accept either without a second signature.
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {},
    },
  });
}

// supabase.auth.getUser() is a network round trip to the auth server. The
// proxy already validates the session on every request, but the layout and
// the page it renders each asked again — three round trips per navigation.
// cache() dedupes this per request: layout, page, and any lib code share one
// call. (Server actions run as their own request, so they get their own.)
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
