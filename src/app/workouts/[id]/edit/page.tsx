import { notFound } from "next/navigation";
import WorkoutForm, { type InitialWorkout } from "@/components/WorkoutForm";
import { createClient } from "@/lib/supabase/server";
import { getExerciseHistory, toLastSessions } from "@/lib/exerciseHistory";

export default async function EditWorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: workout }, history] = await Promise.all([
    supabase
      .from("workouts")
      .select(
        "id, name, bodyweight_lb, workout_exercises(name, category, met, duration_min, calories, exercise_sets(set_index, weight_lb, reps))"
      )
      .eq("id", id)
      .single(),
    getExerciseHistory(supabase),
  ]);

  if (!workout) notFound();

  // "Last time" must mean the previous session, not the one being edited —
  // otherwise the hint just mirrors whatever is already on screen.
  const priorHistory = history
    .map((e) => ({ ...e, sessions: e.sessions.filter((s) => s.workoutId !== id) }))
    .filter((e) => e.sessions.length > 0);

  const initialWorkout: InitialWorkout = {
    id: workout.id,
    name: workout.name,
    bodyweight_lb: workout.bodyweight_lb,
    exercises: workout.workout_exercises ?? [],
  };

  return (
    <WorkoutForm initialWorkout={initialWorkout} lastSessions={toLastSessions(priorHistory)} />
  );
}
