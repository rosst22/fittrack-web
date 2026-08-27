import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { todayStr, shiftDate, dayRange, dayKey } from "@/lib/day";
import type { WhoopSleepRecord } from "@/lib/whoop";
import TrendChart from "@/components/TrendChart";

const DAYS = 14;

function shortLabel(dateStr: string) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function TrendsPage() {
  const supabase = await createClient();
  const today = todayStr();
  const startDate = shiftDate(today, -(DAYS - 1));
  const { start } = dayRange(startDate);
  const { end } = dayRange(today);

  const user = await getUser();

  const [{ data: meals }, { data: workouts }, { data: connection }] = await Promise.all([
    supabase
      .from("meals")
      .select("eaten_at, meal_ingredients(calories, protein_g, carbs_g, fat_g)")
      .gte("eaten_at", start)
      .lte("eaten_at", end),
    supabase
      .from("workouts")
      .select("performed_at, workout_exercises(calories)")
      .gte("performed_at", start)
      .lte("performed_at", end),
    supabase
      .from("whoop_connections")
      .select("last_sleep_json")
      .eq("user_id", user!.id)
      .maybeSingle(),
  ]);

  interface DayAcc {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    burned: number;
    sleepMs: number | null;
  }

  const days: Record<string, DayAcc> = {};
  for (let i = 0; i < DAYS; i++) {
    days[shiftDate(startDate, i)] = {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      burned: 0,
      sleepMs: null,
    };
  }

  for (const meal of meals ?? []) {
    const key = dayKey(meal.eaten_at);
    if (!days[key]) continue;
    for (const ing of meal.meal_ingredients ?? []) {
      days[key].calories += ing.calories ?? 0;
      days[key].protein_g += ing.protein_g ?? 0;
      days[key].carbs_g += ing.carbs_g ?? 0;
      days[key].fat_g += ing.fat_g ?? 0;
    }
  }

  for (const w of workouts ?? []) {
    const key = dayKey(w.performed_at);
    if (!days[key]) continue;
    for (const ex of w.workout_exercises ?? []) {
      days[key].burned += ex.calories ?? 0;
    }
  }

  // Sleep is a JSON snapshot on the connection row, not a per-night table, so
  // it only reaches back as far as the last sync pulled (14 records). A night
  // is filed under the day it ENDS — Sunday night into Monday is Monday's sleep.
  const sleepRecords = ((connection?.last_sleep_json as WhoopSleepRecord[] | null) ?? []).filter(
    (r) => r.score_state === "SCORED" && !r.nap
  );
  for (const r of sleepRecords) {
    const key = dayKey(r.end);
    if (!days[key]) continue;
    const stages = r.score?.stage_summary;
    const asleep =
      (stages?.total_light_sleep_time_milli ?? 0) +
      (stages?.total_slow_wave_sleep_time_milli ?? 0) +
      (stages?.total_rem_sleep_time_milli ?? 0);
    days[key].sleepMs = (days[key].sleepMs ?? 0) + asleep;
  }

  const series = Object.entries(days).map(([date, d]) => ({
    label: shortLabel(date),
    calories: Math.round(d.calories),
    burned: Math.round(d.burned),
    protein_g: Math.round(d.protein_g),
    carbs_g: Math.round(d.carbs_g),
    fat_g: Math.round(d.fat_g),
    sleepHours: d.sleepMs == null ? null : Number((d.sleepMs / 3_600_000).toFixed(1)),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Trends</h1>
          <p className="text-sm text-muted">Last {DAYS} days.</p>
        </div>
        <Link href="/week" className="text-xs text-muted underline hover:text-foreground">
          Weekly review →
        </Link>
      </div>
      <TrendChart data={series} />
    </div>
  );
}
