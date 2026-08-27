import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { deleteWorkout } from "@/lib/actions";
import { dayRange, todayStr, timeLabel } from "@/lib/day";
import { formatSets, formatVolume, volume } from "@/lib/strength";
import DateNav from "@/components/DateNav";

export default async function WorkoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const selectedDate = date ?? todayStr();
  const { start, end } = dayRange(selectedDate);

  const supabase = await createClient();
  const { data: workouts } = await supabase
    .from("workouts")
    .select(
      "id, name, source, performed_at, workout_exercises(id, name, duration_min, calories, exercise_sets(set_index, weight_lb, reps))"
    )
    .gte("performed_at", start)
    .lte("performed_at", end)
    .order("performed_at", { ascending: true });

  const totalBurned = (workouts ?? []).reduce((acc, w) => {
    for (const ex of w.workout_exercises ?? []) acc += ex.calories ?? 0;
    return acc;
  }, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Workouts</h1>
        <Link
          href="/workouts/new"
          className="rounded-md bg-accent-2 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Log workout
        </Link>
      </div>

      <DateNav basePath="/workouts" date={selectedDate} />

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-xs uppercase tracking-wide text-muted">Calories burned</p>
        <p className="mt-1 text-2xl font-bold text-foreground">
          {totalBurned.toFixed(0)}{" "}
          <span className="text-base font-normal text-muted">kcal</span>
        </p>
      </div>

      <div className="space-y-3">
        {(workouts ?? []).length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
            No workouts logged for this day yet.
          </p>
        )}
        {(workouts ?? []).map((w) => {
          const burned = (w.workout_exercises ?? []).reduce(
            (a, ex) => a + (ex.calories ?? 0),
            0
          );
          const workoutVolume = (w.workout_exercises ?? []).reduce(
            (a, ex) => a + volume(ex.exercise_sets ?? []),
            0
          );
          return (
            <div key={w.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="font-medium text-foreground">{w.name}</h2>
                  {w.source === "whoop" && (
                    <span className="rounded-full bg-accent-2/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-2">
                      Whoop
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">{timeLabel(w.performed_at)}</span>
                  {w.source !== "whoop" && (
                    <Link
                      href={`/workouts/${w.id}/edit`}
                      className="text-xs text-muted hover:text-foreground"
                    >
                      edit
                    </Link>
                  )}
                  <form action={deleteWorkout}>
                    <input type="hidden" name="id" value={w.id} />
                    <button className="text-xs text-danger hover:opacity-80">delete</button>
                  </form>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="text-accent-2">{burned.toFixed(0)} kcal burned</span>
                {workoutVolume > 0 && (
                  <span className="text-xs text-muted">
                    {formatVolume(workoutVolume)} total volume
                  </span>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {(w.workout_exercises ?? []).map((ex) => {
                  const sets = ex.exercise_sets ?? [];
                  const summary = formatSets(sets);
                  return (
                    <li key={ex.id} className="text-xs text-muted">
                      {sets.length > 0 ? (
                        <Link
                          href={`/workouts/exercise/${encodeURIComponent(ex.name)}`}
                          className="text-foreground hover:text-accent-2"
                        >
                          {ex.name}
                        </Link>
                      ) : (
                        ex.name
                      )}
                      {summary ? ` — ${summary}` : ""}
                      {ex.duration_min ? ` — ${ex.duration_min} min` : ""}
                      {" "}({ex.calories.toFixed(0)} kcal)
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
