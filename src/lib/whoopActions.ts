"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WhoopReconnectRequired } from "@/lib/whoop";
import { syncWhoopForUser } from "@/lib/whoopSync";

// Triggered solely by the "Sync now" button on /whoop — never during a page
// render — so a dead or revoked refresh token can't slow down or crash normal
// page loads. The actual Whoop work lives in syncWhoopForUser, shared with the
// nightly cron; this wrapper only handles session, cache, and redirects.
export async function syncWhoop() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let noConnection = false;
  let errorMessage: string | null = null;
  let reconnectRequired = false;

  try {
    const synced = await syncWhoopForUser(supabase, user.id);
    if (!synced) noConnection = true;
  } catch (err) {
    errorMessage = (err as Error).message;
    reconnectRequired = err instanceof WhoopReconnectRequired;
  }

  revalidatePath("/whoop");
  revalidatePath("/");
  revalidatePath("/sleep");
  revalidatePath("/workouts");

  // redirect() throws internally, so it must run outside the try/catch above
  // or it gets swallowed as a regular error.
  if (noConnection) redirect("/whoop");
  if (errorMessage) {
    const reconnect = reconnectRequired ? "&reconnect=1" : "";
    redirect(`/whoop?error=${encodeURIComponent(errorMessage)}${reconnect}`);
  }
  redirect("/whoop?synced=1");
}
