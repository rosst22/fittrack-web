import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  COACH_MODEL,
  DAILY_SPEND_CAP_USD,
  getAnthropicClient,
  getTodaySpendUsd,
  recordUsage,
} from "@/lib/ai";

const SYSTEM_PROMPT = `You are a nutrition assistant inside a meal-tracking app. The user describes a meal in words, sends a photo, or both. A photo is either (a) a plate/bowl of food, (b) a packaged product, or (c) a nutrition-facts label.

Your job: identify what was eaten and estimate nutrition as accurately as possible.

Rules:
- Break the meal into individual ingredients (e.g. "grilled chicken breast", "white rice", "olive oil").
- "grams" is your best estimate of the weight of that ingredient AS EATEN.
- calories/protein_g/carbs_g/fat_g/fiber_g/sugar_g/sodium_mg/potassium_mg/cholesterol_mg are the TOTALS for that ingredient's grams (NOT per 100g).
- For a nutrition label: use the label's numbers. If the user says how much they ate, scale to that; otherwise assume one serving.
- If the user gives portion info (e.g. "I ate half", "about 2 cups"), respect it.
- When both a photo and a description are given, the description overrides the photo wherever they disagree — the user knows what they ate.
- With a description and no photo, estimate typical portions for the foods named. Assume standard restaurant/home serving sizes unless told otherwise.
- Prefer realistic, slightly conservative estimates. Never invent foods that are not visible or described.
- meal_name: a short human name for the meal (e.g. "Chicken & rice bowl").`;

const OUTPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    meal_name: { type: "string" as const },
    ingredients: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          name: { type: "string" as const },
          grams: { type: "number" as const },
          calories: { type: "number" as const },
          protein_g: { type: "number" as const },
          carbs_g: { type: "number" as const },
          fat_g: { type: "number" as const },
          fiber_g: { type: "number" as const },
          sugar_g: { type: "number" as const },
          sodium_mg: { type: "number" as const },
          potassium_mg: { type: "number" as const },
          cholesterol_mg: { type: "number" as const },
        },
        required: [
          "name",
          "grams",
          "calories",
          "protein_g",
          "carbs_g",
          "fat_g",
          "fiber_g",
          "sugar_g",
          "sodium_mg",
          "potassium_mg",
          "cholesterol_mg",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["meal_name", "ingredients"],
  additionalProperties: false,
};

const ALLOWED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type AllowedMediaType = (typeof ALLOWED_MEDIA_TYPES)[number];

export async function POST(req: NextRequest) {
  // 1. Must be signed in (RLS also enforces this on the usage insert).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // 2. Parse input.
  let body: { image?: string; mediaType?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { image, mediaType, description } = body;
  const note = description?.trim() ?? "";
  // Either input alone is enough; a photo, a description, or both.
  if (!image && !note) {
    return NextResponse.json(
      { error: "Describe the meal or attach a photo (or both)." },
      { status: 400 }
    );
  }
  if (image && (!mediaType || !ALLOWED_MEDIA_TYPES.includes(mediaType as AllowedMediaType))) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
  }

  // 3. Enforce the daily spend cap BEFORE calling the API.
  try {
    const spent = await getTodaySpendUsd(supabase, user.id);
    if (spent >= DAILY_SPEND_CAP_USD) {
      return NextResponse.json(
        {
          error: `Daily AI limit reached ($${DAILY_SPEND_CAP_USD.toFixed(2)}). Resets at midnight UTC.`,
        },
        { status: 429 }
      );
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  // 4. Ask Claude to analyze whatever we were given.
  try {
    const anthropic = getAnthropicClient();

    const content: Anthropic.ContentBlockParam[] = [];
    if (image) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType as AllowedMediaType,
          data: image,
        },
      });
    }
    content.push({
      type: "text",
      text: image
        ? note
          ? `Analyze this photo. My note about it: ${note}`
          : "Analyze this photo."
        : `Estimate the nutrition for this meal: ${note}`,
    });

    const response = await anthropic.messages.create({
      model: COACH_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content }],
    });

    // 5. Record the cost (this is what the daily cap sums over). Text-only
    // requests are far cheaper than photos, so they're tracked separately.
    const { input_tokens, output_tokens } = response.usage;
    await recordUsage(
      supabase,
      user.id,
      image ? "photo_meal" : "text_meal",
      input_tokens,
      output_tokens
    );

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        {
          error: image
            ? "The AI couldn't analyze this image. Try a clearer photo of the food or label."
            : "The AI couldn't estimate that meal. Try describing it in more detail.",
        },
        { status: 422 }
      );
    }

    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) throw new Error("Empty AI response");

    return NextResponse.json(JSON.parse(text));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
