import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

// The coach runs on Sonnet 4.6 — fast, cheap, great at food photos/labels.
// Swap this one string to change models later.
export const COACH_MODEL = "claude-sonnet-4-6";

// Sonnet 4.6 pricing (USD per million tokens).
const INPUT_PRICE_PER_MTOK = 3.0;
const OUTPUT_PRICE_PER_MTOK = 15.0;

// Hard daily spend cap per user, enforced before every AI call.
export const DAILY_SPEND_CAP_USD = 1.0;

export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

export function costUsd(inputTokens: number, outputTokens: number) {
  return (
    (inputTokens * INPUT_PRICE_PER_MTOK) / 1_000_000 +
    (outputTokens * OUTPUT_PRICE_PER_MTOK) / 1_000_000
  );
}

/** Sum of today's (UTC) AI spend for this user. */
export async function getTodaySpendUsd(supabase: SupabaseClient, userId: string) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("ai_usage")
    .select("cost_usd")
    .eq("user_id", userId)
    .gte("created_at", startOfDay.toISOString());
  if (error) throw error;

  return (data ?? []).reduce((sum, row) => sum + Number(row.cost_usd), 0);
}

export async function recordUsage(
  supabase: SupabaseClient,
  userId: string,
  feature: string,
  inputTokens: number,
  outputTokens: number
) {
  const { error } = await supabase.from("ai_usage").insert({
    user_id: userId,
    feature,
    model: COACH_MODEL,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd(inputTokens, outputTokens),
  });
  if (error) throw error;
}
