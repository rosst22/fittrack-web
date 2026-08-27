import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { dayKey, dayRange, prettyDate, shiftDate, todayStr, weekDates } from "@/lib/day";
import type { WhoopSleepRecord } from "@/lib/whoop";
import {
  averageOf,
  buildGoalRows,
  hitRate,
  hoursMin,
  type DayTotals,
  type GoalStatus,
  type GoalTargets,
} from "@/lib/weekReview";
import { formatVolume, volume } from "@/lib/strength";
import WeekCharts, { type WeekPoint } from "@/components/WeekCharts";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const anchor = date ?? todayStr();
  const dates = weekDates(anchor);
  const { start } = dayRange(dates[0]);
  const { end } = dayRange(dates[6]);

  const supabase = await createClient();
  const user = await getUser();

  // Independent reads go out together — see the CLAUDE.md perf guardrail.
  const [
    { data: meals },
    { data: workouts },
    { data: water },
    { data: goals },
    { data: connection },
  ] = await Promise.all([
    supabase
      .from("meals")
      .select("eaten_at, meal_ingredients(calories, protein_g, carbs_g, fat_g)")
      .gte("eaten_at", start)
      .lte("eaten_at", end),
    supabase
      .from("workouts")
      .select(
        "id, name, performed_at, workout_exercises(calories, exercise_sets(set_index, weight_lb, reps))"
      )
      .gte("performed_at", start)
      .lte("performed_at", end),
    supabase
      .from("water_logs")
      .select("amount_oz, logged_at")
      .gte("logged_at", start)
      .lte("logged_at", end),
    supabase
      .from("goals")
      .select(
        "calorie_target, protein_target_g, carbs_target_g, fat_target_g, water_target_oz, workouts_per_week"
      )
      .eq("id", user!.id)
      .maybeSingle(),
    supabase
      .from("whoop_connections")
      .select("last_sleep_json")
      .eq("user_id", user!.id)
      .maybeSingle(),
  ]);

  // ---- bucket everything into the seven Toronto days ----
  const byDate = new Map<string, DayTotals>(
    dates.map((d) => [
      d,
      {
        date: d,
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        burned: 0,
        waterOz: 0,
        workouts: 0,
        sleepMs: null,
        sleepPerformance: null,
        logged: false,
      },
    ])
  );

  for (const m of meals ?? []) {
    const d = byDate.get(dayKey(m.eaten_at));
    if (!d) continue;
    d.logged = true;
    for (const ing of m.meal_ingredients ?? []) {
      d.calories += ing.calories ?? 0;
      d.protein_g += ing.protein_g ?? 0;
      d.carbs_g += ing.carbs_g ?? 0;
      d.fat_g += ing.fat_g ?? 0;
    }
  }

  let weekVolume = 0;
  const workoutsByDate = new Map<string, string[]>();
  for (const w of workouts ?? []) {
    const key = dayKey(w.performed_at);
    const d = byDate.get(key);
    if (!d) continue;
    d.logged = true;
    d.workouts += 1;
    for (const ex of w.workout_exercises ?? []) {
      d.burned += ex.calories ?? 0;
      weekVolume += volume(ex.exercise_sets ?? []);
    }
    workoutsByDate.set(key, [...(workoutsByDate.get(key) ?? []), w.name]);
  }

  for (const l of water ?? []) {
    const d = byDate.get(dayKey(l.logged_at));
    if (!d) continue;
    d.logged = true;
    // `??` would not help here — Number() yields NaN, not null, on bad input,
    // and one NaN would wipe out the whole day's total.
    d.waterOz += Number(l.amount_oz) || 0;
  }

  // WHOOP sleep lives as a JSON snapshot of recent nights on the connection row
  // (there is no per-night table). A sleep is filed under the day it ENDS —
  // the night of Sunday into Monday is Monday's sleep, which is how WHOOP
  // itself presents it.
  const sleepRecords = ((connection?.last_sleep_json as WhoopSleepRecord[] | null) ?? []).filter(
    (r) => r.score_state === "SCORED" && !r.nap
  );
  for (const r of sleepRecords) {
    const d = byDate.get(dayKey(r.end));
    if (!d) continue;
    const stages = r.score?.stage_summary;
    const asleep =
      (stages?.total_light_sleep_time_milli ?? 0) +
      (stages?.total_slow_wave_sleep_time_milli ?? 0) +
      (stages?.total_rem_sleep_time_milli ?? 0);
    // Multiple records for one morning (a split night) add up.
    d.sleepMs = (d.sleepMs ?? 0) + asleep;
    d.sleepPerformance = r.score?.sleep_performance_percentage ?? d.sleepPerformance;
  }

  const days = dates.map((d) => byDate.get(d)!);
  const targets = (goals ?? null) as GoalTargets | null;
  const goalRows = buildGoalRows(days, targets);

  const points: WeekPoint[] = days.map((d, i) => ({
    label: DOW[i],
    calories: Math.round(d.calories),
    burned: Math.round(d.burned),
    protein_g: Math.round(d.protein_g),
    carbs_g: Math.round(d.carbs_g),
    fat_g: Math.round(d.fat_g),
    sleepHours: d.sleepMs == null ? null : Number((d.sleepMs / 3_600_000).toFixed(1)),
  }));

  // Averages skip untracked days rather than dragging the mean toward zero.
  const avgCalories = averageOf(days.map((d) => (d.calories > 0 ? d.calories : null)));
  const avgProtein = averageOf(days.map((d) => (d.protein_g > 0 ? d.protein_g : null)));
  const avgSleep = averageOf(days.map((d) => d.sleepMs));
  const workoutCount = days.reduce((a, d) => a + d.workouts, 0);
  const overallHitRate = hitRate(goalRows.flatMap((r) => r.statuses));

  const isThisWeek = dates.includes(todayStr());
  const rangeLabel = `${prettyDate(dates[0])} – ${prettyDate(dates[6])}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {isThisWeek ? "This week" : "Week"}
          </h1>
          <p className="text-xs text-muted">{rangeLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          <WeekNavLink date={shiftDate(dates[0], -7)} label="‹" title="Previous week" />
          {!isThisWeek && <WeekNavLink date={todayStr()} label="This week" />}
          <WeekNavLink date={shiftDate(dates[0], 7)} label="›" title="Next week" />
        </div>
      </div>

      {/* Headline numbers: no plot needed, so these are stat tiles. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Avg calories"
          value={avgCalories == null ? "—" : Math.round(avgCalories).toLocaleString()}
          unit="kcal/day"
          sub={targets?.calorie_target ? `target ${Math.round(targets.calorie_target).toLocaleString()}` : undefined}
        />
        <Stat
          label="Avg protein"
          value={avgProtein == null ? "—" : String(Math.round(avgProtein))}
          unit="g/day"
          sub={targets?.protein_target_g ? `target ${Math.round(targets.protein_target_g)}` : undefined}
        />
        <Stat
          label="Workouts"
          value={String(workoutCount)}
          unit={targets?.workouts_per_week ? `of ${targets.workouts_per_week}` : "this week"}
          sub={weekVolume > 0 ? `${formatVolume(weekVolume)} lifted` : undefined}
        />
        <Stat
          label="Avg sleep"
          value={avgSleep == null ? "—" : hoursMin(avgSleep)}
          unit={avgSleep == null ? "no Whoop data" : "per night"}
        />
      </div>

      {/* The did-I-hit-my-goals grid. Status is carried by a glyph as well as
          color, so it never depends on color alone. */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground">Daily goals</h2>
          {overallHitRate != null && (
            <span className="text-xs text-muted">
              <span className="text-foreground">{Math.round(overallHitRate * 100)}%</span> hit
              this week
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr>
                <th className="w-28 text-left text-xs font-normal text-muted">Goal</th>
                {days.map((d, i) => (
                  <th
                    key={d.date}
                    className={`px-1 text-center text-xs font-normal ${
                      d.date === todayStr() ? "text-foreground" : "text-muted"
                    }`}
                  >
                    {DOW[i]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {goalRows.map((row) => (
                <tr key={row.key}>
                  <td className="pr-2">
                    <span className="text-foreground">{row.label}</span>
                    <span className="block text-[10px] text-muted">{row.targetLabel}</span>
                  </td>
                  {row.statuses.map((s, i) => (
                    <td key={`${row.key}-${days[i].date}`} className="px-1 text-center">
                      <StatusCell status={s} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          <LegendItem status="hit" text="hit" />
          <LegendItem status="miss" text="missed" />
          <LegendItem status="none" text="nothing logged" />
        </div>
      </div>

      <WeekCharts
        data={points}
        calorieTarget={targets?.calorie_target ?? null}
        proteinTarget={targets?.protein_target_g ?? null}
      />

      {/* Day-by-day detail, so the summary above is auditable. */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">Day by day</h2>
        {days.map((d, i) => {
          const names = workoutsByDate.get(d.date) ?? [];
          return (
            <div
              key={d.date}
              className={`rounded-xl border bg-surface p-3 ${
                d.date === todayStr() ? "border-accent-2" : "border-border"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {DOW[i]} · {prettyDate(d.date)}
                </span>
                {!d.logged && <span className="text-xs text-muted">nothing logged</span>}
              </div>
              {d.logged && (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <span>
                    <span className="text-foreground">{Math.round(d.calories).toLocaleString()}</span>{" "}
                    kcal in
                  </span>
                  <span>
                    <span className="text-foreground">{Math.round(d.burned).toLocaleString()}</span>{" "}
                    kcal out
                  </span>
                  <span>
                    <span className="text-foreground">{Math.round(d.protein_g)}</span>g protein
                  </span>
                  <span>
                    <span className="text-foreground">{Math.round(d.carbs_g)}</span>g carbs
                  </span>
                  <span>
                    <span className="text-foreground">{Math.round(d.fat_g)}</span>g fat
                  </span>
                  <span>
                    <span className="text-foreground">{Math.round(d.waterOz)}</span> oz water
                  </span>
                  {d.sleepMs != null && (
                    <span>
                      <span className="text-foreground">{hoursMin(d.sleepMs)}</span> asleep
                      {d.sleepPerformance != null && ` (${Math.round(d.sleepPerformance)}%)`}
                    </span>
                  )}
                </div>
              )}
              {names.length > 0 && (
                <p className="mt-1 text-xs text-accent-2">{names.join(" · ")}</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted">
        <Link href="/trends" className="underline hover:text-foreground">
          See 14-day trends
        </Link>
      </p>
    </div>
  );
}

function WeekNavLink({ date, label, title }: { date: string; label: string; title?: string }) {
  return (
    <Link
      href={`/week?date=${date}`}
      title={title}
      className="rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
    >
      {label}
    </Link>
  );
}

const STATUS_STYLE: Record<GoalStatus, { glyph: string; cls: string; label: string }> = {
  hit: { glyph: "✓", cls: "bg-status-good/15 text-status-good", label: "hit" },
  miss: { glyph: "✕", cls: "bg-surface-2 text-status-miss", label: "missed" },
  none: { glyph: "·", cls: "text-border", label: "nothing logged" },
};

function StatusCell({ status }: { status: GoalStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      title={s.label}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs ${s.cls}`}
    >
      <span aria-hidden="true">{s.glyph}</span>
      <span className="sr-only">{s.label}</span>
    </span>
  );
}

function LegendItem({ status, text }: { status: GoalStatus; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusCell status={status} />
      {text}
    </span>
  );
}

function Stat({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
      {unit && <p className="text-[11px] text-muted">{unit}</p>}
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}
