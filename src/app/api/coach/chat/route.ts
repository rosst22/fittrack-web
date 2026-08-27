import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  COACH_MODEL,
  DAILY_SPEND_CAP_USD,
  getAnthropicClient,
  getTodaySpendUsd,
  recordUsage,
} from "@/lib/ai";
import { estimateMaintenance, type Profile } from "@/lib/profile";
import type { Goals } from "@/lib/goals";
import { dayRange, todayStr } from "@/lib/day";
import { TRACKED_MICROS, emptyMicroTotals, addMicros, formatMicro } from "@/lib/micros";

const SYSTEM_PROMPT = `You are the FitTrack coach — a friendly, practical nutrition and fitness assistant living inside the user's personal meal-and-workout tracking app.

Rules:
- You are given a snapshot of the user's day (profile, goals, meals eaten, workouts, water). Use it to give specific, personal answers — reference their actual numbers.
- Keep answers short and conversational: a few sentences, or a short list when suggesting foods/meals. No long essays.
- Be encouraging but honest. If they're way over/under a target, say so plainly and suggest one concrete next step.
- Suggest realistic everyday foods and workouts; never prescribe medical treatment. For medical questions, tell them to ask a doctor.
- If asked something unrelated to food, fitness, sleep, or health, politely steer back to coaching.`;

// Keep request sizes sane so a runaway client can't burn tokens.
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** One compact text snapshot of the user's day for the system prompt. */
async function buildDayContext(supabase: SupabaseClient, userId: string) {
  const today = todayStr();
  const { start, end } = dayRange(today);

  const [{ data: profile }, { data: goals }, { data: meals }, { data: workouts }, { data: waterLogs }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("goals").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("meals")
        .select(
          "name, eaten_at, meal_ingredients(name, weight_g, calories, protein_g, carbs_g, fat_g, micronutrients)"
        )
        .gte("eaten_at", start)
        .lte("eaten_at", end)
        .order("eaten_at", { ascending: true }),
      supabase
        .from("workouts")
        .select("name, performed_at, workout_exercises(name, calories)")
        .gte("performed_at", start)
        .lte("performed_at", end),
      supabase.from("water_logs").select("amount_oz").gte("logged_at", start).lte("logged_at", end),
    ]);

  const lines: string[] = [`Date: ${today}`];

  if (profile) {
    const p = profile as Profile;
    const bits = [
      p.age ? `age ${p.age}` : null,
      p.sex ?? null,
      p.height_in ? `${p.height_in} in tall` : null,
      p.weight_lb ? `${p.weight_lb} lb` : null,
    ].filter(Boolean);
    if (bits.length) lines.push(`Profile: ${bits.join(", ")}`);
    const maint = estimateMaintenance(p);
    if (maint) lines.push(`Estimated maintenance: ~${Math.round(maint)} kcal/day (sedentary)`);
  }

  if (goals) {
    const g = goals as Goals;
    const bits = [
      g.calorie_target ? `${g.calorie_target} kcal` : null,
      g.protein_target_g ? `${g.protein_target_g}g protein` : null,
      g.carbs_target_g ? `${g.carbs_target_g}g carbs` : null,
      g.fat_target_g ? `${g.fat_target_g}g fat` : null,
      g.water_target_oz ? `${g.water_target_oz}oz water` : null,
      g.workouts_per_week ? `${g.workouts_per_week} workouts/week` : null,
    ].filter(Boolean);
    if (bits.length) lines.push(`Daily targets: ${bits.join(", ")}`);
    if (g.notes) lines.push(`Goal notes: ${g.notes}`);
  }

  let cal = 0,
    protein = 0,
    carbs = 0,
    fat = 0;
  const micros = emptyMicroTotals();
  const mealLines: string[] = [];
  for (const m of meals ?? []) {
    let mCal = 0;
    const items: string[] = [];
    for (const i of m.meal_ingredients ?? []) {
      mCal += i.calories ?? 0;
      protein += i.protein_g ?? 0;
      carbs += i.carbs_g ?? 0;
      fat += i.fat_g ?? 0;
      addMicros(micros, i.micronutrients);
      items.push(`${i.name} ${Math.round(i.weight_g ?? 0)}g`);
    }
    cal += mCal;
    mealLines.push(`- ${m.name} (~${Math.round(mCal)} kcal): ${items.join(", ")}`);
  }
  const microSummary = TRACKED_MICROS.map((t) => `${t.label} ${formatMicro(t.label, micros[t.label])}`).join(", ");
  lines.push(
    meals?.length
      ? `Meals eaten today (${Math.round(cal)} kcal, ${Math.round(protein)}g protein, ${Math.round(carbs)}g carbs, ${Math.round(fat)}g fat; ${microSummary}):\n${mealLines.join("\n")}`
      : "No meals logged yet today."
  );

  const workoutLines = (workouts ?? []).map((w) => {
    const burned = (w.workout_exercises ?? []).reduce(
      (s: number, e: { calories: number | null }) => s + (e.calories ?? 0),
      0
    );
    return `- ${w.name}${burned ? ` (~${Math.round(burned)} kcal burned)` : ""}`;
  });
  lines.push(workoutLines.length ? `Workouts today:\n${workoutLines.join("\n")}` : "No workouts logged today.");

  const waterOz = (waterLogs ?? []).reduce((s, w) => s + Number(w.amount_oz ?? 0), 0);
  lines.push(`Water today: ${Math.round(waterOz)} oz`);

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { messages?: ChatMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const messages = (body.messages ?? [])
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "No message to answer" }, { status: 400 });
  }

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

  try {
    const context = await buildDayContext(supabase, user.id);
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: COACH_MODEL,
      max_tokens: 800,
      system: `${SYSTEM_PROMPT}\n\n--- User's day so far ---\n${context}`,
      messages,
    });

    const { input_tokens, output_tokens } = response.usage;
    await recordUsage(supabase, user.id, "chat", input_tokens, output_tokens);

    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) throw new Error("Empty AI response");

    return NextResponse.json({ reply: text });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
