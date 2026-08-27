import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeExerciseName, orderSets, type ExerciseSet } from "./strength";

// Reads past strength work so the form can show "here's what you did last time"
// and the history page can chart progress. Row-level security already scopes
// every query to the signed-in user, so these take a client and no user id —
// same convention as the rest of the server components.

export interface HistorySession {
  workoutId: string;
  workoutName: string;
  performedAt: string;
  category: string;
  durationMin: number;
  sets: ExerciseSet[];
}

export interface ExerciseHistoryEntry {
  /** Display name, spelled the way it was on the most recent session. */
  name: string;
  /** Case/whitespace-folded name — the join key. */
  key: string;
  /** Newest first. */
  sessions: HistorySession[];
}

/** How far back the form's autocomplete and last-session hints look. */
export const HISTORY_WINDOW_DAYS = 180;

interface RawSet {
  set_index: number;
  weight_lb: number | null;
  reps: number | null;
}
interface RawExercise {
  id: string;
  name: string;
  category: string | null;
  duration_min: number | null;
  exercise_sets: RawSet[] | null;
}
interface RawWorkout {
  id: string;
  name: string;
  performed_at: string;
  workout_exercises: RawExercise[] | null;
}

/**
 * Every exercise the user has logged in the window, each with its sessions
 * newest-first. One query — the nesting is done by PostgREST, not by N+1 calls.
 */
export async function getExerciseHistory(
  supabase: SupabaseClient,
  { sinceDays = HISTORY_WINDOW_DAYS }: { sinceDays?: number } = {}
): Promise<ExerciseHistoryEntry[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  const { data, error } = await supabase
    .from("workouts")
    .select(
      "id, name, performed_at, workout_exercises(id, name, category, duration_min, exercise_sets(set_index, weight_lb, reps))"
    )
    .gte("performed_at", since)
    .order("performed_at", { ascending: false });

  if (error || !data) return [];

  const byKey = new Map<string, ExerciseHistoryEntry>();

  for (const w of data as RawWorkout[]) {
    for (const ex of w.workout_exercises ?? []) {
      const sets = orderSets(ex.exercise_sets ?? []);
      // Cardio entries have no sets; they'd add noise to a strength-history
      // picker, so they don't enter the index.
      if (sets.length === 0) continue;

      const key = normalizeExerciseName(ex.name);
      if (!key) continue;

      const session: HistorySession = {
        workoutId: w.id,
        workoutName: w.name,
        performedAt: w.performed_at,
        category: ex.category ?? "weights_light",
        durationMin: ex.duration_min ?? 0,
        sets,
      };

      const existing = byKey.get(key);
      if (existing) {
        existing.sessions.push(session);
      } else {
        // First time we see this key we're on the newest workout (the query is
        // sorted desc), so that spelling becomes the display name.
        byKey.set(key, { name: ex.name.trim(), key, sessions: [session] });
      }
    }
  }

  return [...byKey.values()].sort(
    (a, b) =>
      new Date(b.sessions[0].performedAt).getTime() -
      new Date(a.sessions[0].performedAt).getTime()
  );
}

/** Just one exercise's history, for the per-exercise page. */
export async function getOneExerciseHistory(
  supabase: SupabaseClient,
  name: string,
  { sinceDays = 3650 }: { sinceDays?: number } = {}
): Promise<ExerciseHistoryEntry | null> {
  const all = await getExerciseHistory(supabase, { sinceDays });
  const key = normalizeExerciseName(name);
  return all.find((e) => e.key === key) ?? null;
}

/**
 * Trimmed payload for the client form: the most recent session per exercise.
 * Sending the full history to the browser would be wasteful — the form only
 * needs the last one to prefill and hint.
 */
export interface LastSession {
  name: string;
  key: string;
  performedAt: string;
  category: string;
  durationMin: number;
  sets: ExerciseSet[];
}

export function toLastSessions(history: ExerciseHistoryEntry[]): LastSession[] {
  return history.map((e) => ({
    name: e.name,
    key: e.key,
    performedAt: e.sessions[0].performedAt,
    category: e.sessions[0].category,
    durationMin: e.sessions[0].durationMin,
    sets: e.sessions[0].sets,
  }));
}
