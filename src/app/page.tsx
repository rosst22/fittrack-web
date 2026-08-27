import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { dayRange, todayStr, prettyDate } from "@/lib/day";
import { estimateMaintenance, type Profile } from "@/lib/profile";
import type { Goals } from "@/lib/goals";

export default async function DashboardPage() {
  const today = todayStr();
  const { start, end } = dayRange(today);
  const supabase = await createClient();

  const user = await getUser();

  // All six queries are independent, so they go out in one parallel batch
  // instead of paying a round trip each in sequence. The no-profile redirect
  // check happens after — it only needs the profile result.
  const [
    { data: profile },
    { data: goalsRow },
    { data: meals },
    { data: workouts },
    { data: waterLogs },
    { data: whoopConn },
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, height_in, age, weight_lb, sex")
        .eq("id", user!.id)
        .maybeSingle(),
      supabase
        .from("goals")
        .select("id, calorie_target, protein_target_g, carbs_target_g, fat_target_g, workouts_per_week, water_target_oz, notes")
        .eq("id", user!.id)
        .maybeSingle(),
      supabase
        .from("meals")
        .select("id, name, meal_ingredients(calories, protein_g, carbs_g, fat_g)")
        .gte("eaten_at", start)
        .lte("eaten_at", end),
      supabase
        .from("workouts")
        .select("id, name, workout_exercises(calories)")
        .gte("performed_at", start)
        .lte("performed_at", end),
      supabase
        .from("water_logs")
        .select("amount_oz")
        .gte("logged_at", start)
        .lte("logged_at", end),
      // Cached from the last explicit sync on /whoop — no live Whoop API
      // call (and no token refresh) happens on dashboard page loads.
      supabase
        .from("whoop_connections")
        .select("last_recovery_score, last_strain")
        .eq("user_id", user!.id)
        .maybeSingle(),
    ]);

  // First-run onboarding: no profile yet → collect height/age/weight.
  if (!profile) redirect("/profile");

  const maintenance = estimateMaintenance(profile as Profile);
  const goals = goalsRow as Goals | null;

  const waterTotal = (waterLogs ?? []).reduce((acc, w) => acc + (w.amount_oz ?? 0), 0);

  const recoveryScore = whoopConn?.last_recovery_score ?? undefined;
  const strain = whoopConn?.last_strain ?? undefined;

  const intake = (meals ?? []).reduce(
    (acc, m) => {
      for (const ing of m.meal_ingredients ?? []) {
        acc.calories += ing.calories ?? 0;
        acc.protein_g += ing.protein_g ?? 0;
        acc.carbs_g += ing.carbs_g ?? 0;
        acc.fat_g += ing.fat_g ?? 0;
      }
      return acc;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  const burned = (workouts ?? []).reduce((acc, w) => {
    for (const ex of w.workout_exercises ?? []) acc += ex.calories ?? 0;
    return acc;
  }, 0);

  const net = intake.calories - burned;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Today</h1>
        <p className="text-sm text-muted">{prettyDate(today)}</p>
      </div>

      {/* Net energy summary */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-xs uppercase tracking-wide text-muted">Net calories</p>
        <p className="mt-1 text-4xl font-bold text-foreground">{net.toFixed(0)}</p>
        <p className="mt-1 text-sm text-muted">
          {intake.calories.toFixed(0)} eaten − {burned.toFixed(0)} burned
        </p>
        {maintenance != null && (
          <p className="mt-2 text-xs text-muted">
            Est. maintenance ≈ {maintenance.toFixed(0)} kcal/day ·{" "}
            <span className={net - maintenance <= 0 ? "text-accent" : "text-danger"}>
              {net - maintenance <= 0 ? "deficit" : "surplus"} {Math.abs(net - maintenance).toFixed(0)} kcal
            </span>
          </p>
        )}
      </div>

      {/* Goals progress */}
      {goals && (goals.calorie_target || goals.protein_target_g || goals.water_target_oz) ? (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted">Today vs goals</p>
            <Link href="/goals" className="text-xs text-muted hover:text-foreground">
              edit
            </Link>
          </div>
          <div className="mt-3 space-y-3">
            {goals.calorie_target ? (
              <GoalBar
                label="Calories"
                value={intake.calories}
                target={goals.calorie_target}
                unit="kcal"
              />
            ) : null}
            {goals.protein_target_g ? (
              <GoalBar
                label="Protein"
                value={intake.protein_g}
                target={goals.protein_target_g}
                unit="g"
              />
            ) : null}
            {goals.water_target_oz ? (
              <GoalBar
                label="Water"
                value={waterTotal}
                target={goals.water_target_oz}
                unit="oz"
              />
            ) : null}
          </div>
          {goals.notes ? (
            <p className="mt-4 border-t border-border pt-3 text-sm text-muted">{goals.notes}</p>
          ) : null}
        </div>
      ) : (
        <Link
          href="/goals"
          className="block rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted hover:text-foreground"
        >
          + Set your calorie, protein, and workout goals
        </Link>
      )}

      {/* Two section cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/meals"
          className="group rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-accent">Nutrition</p>
            <span className="text-muted group-hover:text-foreground">→</span>
          </div>
          <p className="mt-3 text-3xl font-bold text-foreground">
            {intake.calories.toFixed(0)}{" "}
            <span className="text-base font-normal text-muted">kcal</span>
          </p>
          <div className="mt-2 flex gap-3 text-xs text-muted">
            <span>P {intake.protein_g.toFixed(0)}g</span>
            <span>C {intake.carbs_g.toFixed(0)}g</span>
            <span>F {intake.fat_g.toFixed(0)}g</span>
          </div>
          <p className="mt-3 text-xs text-muted">
            {(meals ?? []).length} meal{(meals ?? []).length === 1 ? "" : "s"} logged
          </p>
        </Link>

        <Link
          href="/workouts"
          className="group rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent-2"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-accent-2">Training</p>
            <span className="text-muted group-hover:text-foreground">→</span>
          </div>
          <p className="mt-3 text-3xl font-bold text-foreground">
            {burned.toFixed(0)}{" "}
            <span className="text-base font-normal text-muted">kcal burned</span>
          </p>
          <p className="mt-3 text-xs text-muted">
            {(workouts ?? []).length} workout{(workouts ?? []).length === 1 ? "" : "s"} logged
          </p>
        </Link>
      </div>

      {/* Whoop recovery/strain */}
      {whoopConn ? (
        <Link
          href="/whoop"
          className="group flex items-center justify-between rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent-2"
        >
          <div className="flex gap-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Recovery</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {recoveryScore != null ? recoveryScore.toFixed(0) : "—"}
                <span className="ml-1 text-sm font-normal text-muted">%</span>
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Strain</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {strain != null ? strain.toFixed(1) : "—"}
              </p>
            </div>
          </div>
          <span className="text-muted group-hover:text-foreground">→</span>
        </Link>
      ) : (
        <Link
          href="/whoop"
          className="block rounded-2xl border border-dashed border-border p-5 text-center text-sm text-muted hover:text-foreground"
        >
          + Connect Whoop for recovery & strain
        </Link>
      )}

      {/* Quick actions */}
      <div className="flex gap-3">
        <Link
          href="/meals/new"
          className="flex-1 rounded-lg bg-accent py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
        >
          + Log meal
        </Link>
        <Link
          href="/workouts/new"
          className="flex-1 rounded-lg bg-accent-2 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
        >
          + Log workout
        </Link>
      </div>
    </div>
  );
}

function GoalBar({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
}) {
  const pct = Math.min(100, (value / target) * 100);
  const over = value > target;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="text-muted">
          {value.toFixed(0)} / {target.toFixed(0)} {unit}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${over ? "bg-danger" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
