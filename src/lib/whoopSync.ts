import type { createClient } from "@/lib/supabase/server";
import {
  getValidWhoopToken,
  listWhoopSleep,
  listWhoopWorkouts,
  whoopGet,
} from "@/lib/whoop";

const KJ_PER_KCAL = 4.184;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

interface WhoopCollection<T> {
  records: T[];
}
interface RecoveryRecord {
  score?: {
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
  };
}
interface CycleRecord {
  score?: {
    strain?: number;
    average_heart_rate?: number;
  };
}

// Fetches a user's current Whoop state and writes it to their snapshot columns.
// Shared by the "Sync now" button (session client, one user) and the nightly
// cron (service-role client, every user) so the token-refresh path exists in
// exactly one place — the rotation logic here is subtle enough that a second
// copy would eventually drift out of sync with this one.
//
// Returns false when the user has no Whoop connection. Throws on failure,
// including WhoopReconnectRequired; callers decide how to surface that.
export async function syncWhoopForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const token = await getValidWhoopToken(supabase, userId);
  if (!token) return false;

  const [rec, slp, cyc] = await Promise.all([
    whoopGet<WhoopCollection<RecoveryRecord>>("/v2/recovery?limit=1", token),
    listWhoopSleep(token, 14),
    whoopGet<WhoopCollection<CycleRecord>>("/v2/cycle?limit=1", token),
    syncWhoopWorkouts(supabase, userId, token),
  ]);

  const recovery = rec.records?.[0]?.score;
  const sleep = (slp.records ?? [])
    .filter((record) => record.score_state === "SCORED" && !record.nap)
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())[0]
    ?.score;
  const cycle = cyc.records?.[0]?.score;

  const { error: snapshotError } = await supabase
    .from("whoop_connections")
    .update({
      last_recovery_score: recovery?.recovery_score ?? null,
      last_resting_hr: recovery?.resting_heart_rate ?? null,
      last_hrv_ms: recovery?.hrv_rmssd_milli ?? null,
      last_sleep_performance: sleep?.sleep_performance_percentage ?? null,
      last_sleep_efficiency: sleep?.sleep_efficiency_percentage ?? null,
      last_sleep_json: slp.records ?? [],
      last_strain: cycle?.strain ?? null,
      last_avg_hr: cycle?.average_heart_rate ?? null,
      last_synced_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (snapshotError) throw snapshotError;

  return true;
}

// Pulls recent Whoop workouts and upserts them into the workouts table
// (keyed by whoop_workout_id) so they show up alongside manually-logged
// workouts and count toward the same calories-burned totals.
export async function syncWhoopWorkouts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  token: string
): Promise<void> {
  const { records } = await listWhoopWorkouts(token);
  const scoredRecords = (records ?? []).filter((rec) => rec.score_state === "SCORED");
  if (scoredRecords.length === 0) return;

  const { data: workoutRows, error: workoutError } = await supabase
    .from("workouts")
    .upsert(
      scoredRecords.map((rec) => ({
        user_id: userId,
        name: rec.sport_name,
        performed_at: rec.start,
        source: "whoop",
        whoop_workout_id: rec.id,
      })),
      { onConflict: "whoop_workout_id" }
    )
    .select("id, whoop_workout_id");

  if (workoutError) throw workoutError;

  const workoutIdByWhoopId = new Map(
    (workoutRows ?? []).map((row) => [row.whoop_workout_id, row.id])
  );
  const exerciseRows = scoredRecords.flatMap((rec) => {
    const workoutId = workoutIdByWhoopId.get(rec.id);
    if (!workoutId) return [];

    const durationMin =
      (new Date(rec.end).getTime() - new Date(rec.start).getTime()) / 60000;
    const calories =
      rec.score?.kilojoule != null ? rec.score.kilojoule / KJ_PER_KCAL : 0;

    return [
      {
        workout_id: workoutId,
        name: rec.sport_name,
        category: "whoop",
        met: 0,
        duration_min: durationMin,
        calories,
      },
    ];
  });

  if (exerciseRows.length === 0) return;

  const workoutIds = exerciseRows.map((row) => row.workout_id);
  const { error: deleteError } = await supabase
    .from("workout_exercises")
    .delete()
    .in("workout_id", workoutIds);
  if (deleteError) throw deleteError;

  const { error: exerciseError } = await supabase
    .from("workout_exercises")
    .insert(exerciseRows);
  if (exerciseError) throw exerciseError;
}
