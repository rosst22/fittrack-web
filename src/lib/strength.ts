// Math and formatting for per-set strength logging.
//
// Every function here is pure — no database, no clock, no timezone — which is
// why they are the easy things to unit-test (see strength.test.ts).

export interface ExerciseSet {
  set_index: number;
  weight_lb: number | null;
  reps: number | null;
}

/** Sets in display order. Input order from the DB is not guaranteed. */
export function orderSets<T extends { set_index: number }>(sets: T[]): T[] {
  return [...sets].sort((a, b) => a.set_index - b.set_index);
}

/**
 * Total weight moved: Σ(weight × reps), in lb.
 *
 * This is the number that tracks whether you are doing MORE work over time,
 * which is what drives hypertrophy. Bodyweight sets (weight null) contribute 0
 * because we don't know what your bodyweight loading actually was.
 */
export function volume(sets: ExerciseSet[]): number {
  return sets.reduce((acc, s) => acc + (s.weight_lb ?? 0) * (s.reps ?? 0), 0);
}

/** Total reps across all sets, regardless of load. */
export function totalReps(sets: ExerciseSet[]): number {
  return sets.reduce((acc, s) => acc + (s.reps ?? 0), 0);
}

/**
 * The heaviest set. Ties break toward more reps — 175×6 beats 175×4, because
 * it is unambiguously the better set.
 */
export function topSet(sets: ExerciseSet[]): ExerciseSet | null {
  let best: ExerciseSet | null = null;
  for (const s of sets) {
    if (s.weight_lb == null) continue;
    if (
      best == null ||
      s.weight_lb > best.weight_lb! ||
      (s.weight_lb === best.weight_lb && (s.reps ?? 0) > (best.reps ?? 0))
    ) {
      best = s;
    }
  }
  return best;
}

/**
 * Estimated one-rep max via the Epley formula: w × (1 + reps/30).
 *
 * A single "how strong am I" number that lets a heavy triple and a light set of
 * twelve be compared on one axis. It is an ESTIMATE and gets less trustworthy
 * above ~10 reps, which is a known property of every 1RM formula.
 *
 * Single reps are special-cased to return the weight itself: the raw formula
 * would report a 225×1 as a 232.5 lb max, but a single you actually lifted IS
 * your max, not evidence of a bigger one.
 */
export function epley1RM(weightLb: number | null, reps: number | null): number {
  if (!weightLb || !reps || weightLb <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightLb;
  return weightLb * (1 + reps / 30);
}

/** Best estimated 1RM across all sets of an exercise. */
export function best1RM(sets: ExerciseSet[]): number {
  return sets.reduce((acc, s) => Math.max(acc, epley1RM(s.weight_lb, s.reps)), 0);
}

/**
 * Compact one-line summary: "135×10, 155×8, 175×5".
 *
 * Consecutive identical sets collapse, so a straight 3×8 at 135 reads
 * "135×8 (3 sets)" instead of repeating itself three times.
 */
export function formatSets(sets: ExerciseSet[]): string {
  const ordered = orderSets(sets).filter((s) => s.weight_lb != null || s.reps != null);
  if (ordered.length === 0) return "";

  const groups: { set: ExerciseSet; count: number }[] = [];
  for (const s of ordered) {
    const last = groups[groups.length - 1];
    if (last && last.set.weight_lb === s.weight_lb && last.set.reps === s.reps) {
      last.count += 1;
    } else {
      groups.push({ set: s, count: 1 });
    }
  }

  return groups
    .map(({ set, count }) => {
      const load = set.weight_lb != null ? `${trimNum(set.weight_lb)}` : "BW";
      const reps = set.reps != null ? `×${set.reps}` : "";
      const suffix = count > 1 ? ` (${count} sets)` : "";
      return `${load}${reps}${suffix}`;
    })
    .join(", ");
}

/** 135 → "135", 137.5 → "137.5". Avoids "135.0" in the UI. */
function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(1)));
}

/** "1,250 lb" — volume is big enough to need thousands separators. */
export function formatVolume(lb: number): string {
  return `${Math.round(lb).toLocaleString("en-US")} lb`;
}

/**
 * Exercise names are typed freehand, so "Bench Press" and "bench press" must
 * resolve to the same history. Matches the food library's dedup problem; this
 * is the normalizer both the history lookup and the autocomplete key on.
 */
export function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
