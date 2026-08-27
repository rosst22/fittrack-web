import type { SupabaseClient } from "@supabase/supabase-js";

export type Tier = "free" | "pro";

/**
 * Display-only copy of the per-day allowances.
 *
 * ⚠️ NOT the source of truth. Enforcement lives in `_shared/guard.ts` in the
 * Edge Functions repo, and that is the only thing that decides whether a call
 * is allowed. These numbers exist so the upgrade page can say what Pro buys
 * without a round trip.
 *
 * Anywhere a live number is available — every AI response carries
 * `usage: { used, limit, tier }` — prefer that over this table. If the two ever
 * disagree, guard.ts is right and this is stale.
 */
export const PLAN_COPY = {
  free: { photo_meal: 3, text_meal: 3, coach_chat: 1 },
  pro: { photo_meal: 15, text_meal: 30, coach_chat: 15 },
} as const;

export const PRO_PRICE_USD = 5;

/**
 * The caller's effective tier.
 *
 * Reads the `effective_entitlement` view rather than the `entitlements` table.
 * That matters: entitlements is keyed (user_id, source), so someone with both a
 * lapsed App Store subscription and an active Stripe one has two rows. The view
 * collapses them with "pro if ANY source is currently active" and enforces
 * expiry on read, so a dropped webhook cannot leave access switched on.
 *
 * Fails to "free" rather than throwing. A tier lookup that errors should show a
 * cheaper UI, never break the page — and enforcement happens server-side in the
 * Edge Function regardless of what this returns.
 */
export async function getTier(supabase: SupabaseClient): Promise<Tier> {
  const { data, error } = await supabase
    .from("effective_entitlement")
    .select("tier")
    .maybeSingle();

  if (error || !data) return "free";
  return data.tier === "pro" ? "pro" : "free";
}

export type UsageToday = Record<string, number>;

/** Today's AI call counts by feature, for "2 of 3 left" style hints. */
export async function getUsageToday(supabase: SupabaseClient): Promise<UsageToday> {
  const { data, error } = await supabase
    .from("ai_usage_today")
    .select("feature, calls");

  if (error || !data) return {};
  return Object.fromEntries(data.map((r) => [r.feature as string, Number(r.calls)]));
}

/**
 * The Stripe Payment Link, with the user's id attached.
 *
 * `client_reference_id` is how the stripe-webhook knows who paid — it is the
 * only link between a Stripe checkout and a Supabase user, and the webhook
 * refuses to guess if it is missing. Returns null when no link is configured,
 * which is the signal to hide the upgrade path entirely rather than show a
 * button that goes nowhere.
 */
export function checkoutUrl(userId: string): string | null {
  const link = process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK;
  if (!link) return null;

  const url = new URL(link);
  url.searchParams.set("client_reference_id", userId);
  return url.toString();
}
