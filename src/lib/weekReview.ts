// Goal evaluation for the weekly review. Pure functions only — the page does
// the querying and hands the totals here, which keeps all the judgment calls
// about "did I hit it" in one testable place.

export type GoalStatus = "hit" | "miss" | "none";

export interface DayTotals {
  date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  burned: number;
  waterOz: number;
  workouts: number;
  /** Milliseconds actually asleep (light + deep + REM). null = no WHOOP data. */
  sleepMs: number | null;
  sleepPerformance: number | null;
  /** No meals, no water, no workout — nothing was logged at all. */
  logged: boolean;
}

export interface GoalTargets {
  calorie_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  water_target_oz: number | null;
  workouts_per_week: number | null;
}

/**
 * How close to a calorie target still counts as hitting it.
 *
 * Calories are a two-sided goal — 900 kcal against a 2,600 target is a miss,
 * not an overachievement — so this is a band, unlike protein and water where
 * more is simply better.
 */
export const CALORIE_TOLERANCE = 0.1;

/** Two-sided: hit when within CALORIE_TOLERANCE either side of target. */
export function calorieStatus(total: number, target: number | null): GoalStatus {
  if (!target || target <= 0) return "none";
  if (total <= 0) return "none";
  const drift = Math.abs(total - target) / target;
  return drift <= CALORIE_TOLERANCE ? "hit" : "miss";
}

/** One-sided: hit when you reach or beat the target (protein, water). */
export function atLeastStatus(total: number, target: number | null): GoalStatus {
  if (!target || target <= 0) return "none";
  if (total <= 0) return "none";
  return total >= target ? "hit" : "miss";
}

/** A day counts as trained if anything was logged for it. */
export function trainedStatus(workouts: number, logged: boolean): GoalStatus {
  if (workouts > 0) return "hit";
  return logged ? "miss" : "none";
}

/**
 * Share of days that were hit, ignoring days with no data — a week with three
 * hits and four untracked days is 100%, not 43%, because the untracked days
 * are unknown rather than failed. Returns null when nothing is known.
 */
export function hitRate(statuses: GoalStatus[]): number | null {
  const known = statuses.filter((s) => s !== "none");
  if (known.length === 0) return null;
  return known.filter((s) => s === "hit").length / known.length;
}

/** Average over days that have data; null when none do. */
export function averageOf(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v != null && !Number.isNaN(v));
  if (known.length === 0) return null;
  return known.reduce((a, b) => a + b, 0) / known.length;
}

/** 27180000 -> "7h 33m". */
export function hoursMin(ms: number | null): string {
  if (ms == null) return "—";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

export interface GoalRow {
  key: string;
  label: string;
  /** Per-day status, Monday first. */
  statuses: GoalStatus[];
  /** Human summary of the target, e.g. "2,600 kcal ±10%". */
  targetLabel: string;
}

/** The rows of the did-I-hit-my-goals grid, in display order. */
export function buildGoalRows(days: DayTotals[], goals: GoalTargets | null): GoalRow[] {
  const g = goals;
  return [
    {
      key: "calories",
      label: "Calories",
      statuses: days.map((d) => calorieStatus(d.calories, g?.calorie_target ?? null)),
      targetLabel: g?.calorie_target
        ? `${Math.round(g.calorie_target).toLocaleString()} kcal ±${CALORIE_TOLERANCE * 100}%`
        : "no target set",
    },
    {
      key: "protein",
      label: "Protein",
      statuses: days.map((d) => atLeastStatus(d.protein_g, g?.protein_target_g ?? null)),
      targetLabel: g?.protein_target_g ? `${Math.round(g.protein_target_g)} g or more` : "no target set",
    },
    {
      key: "water",
      label: "Water",
      statuses: days.map((d) => atLeastStatus(d.waterOz, g?.water_target_oz ?? null)),
      targetLabel: g?.water_target_oz ? `${Math.round(g.water_target_oz)} oz or more` : "no target set",
    },
    {
      key: "trained",
      label: "Trained",
      statuses: days.map((d) => trainedStatus(d.workouts, d.logged)),
      targetLabel: g?.workouts_per_week
        ? `${g.workouts_per_week}× per week`
        : "any workout logged",
    },
  ];
}
