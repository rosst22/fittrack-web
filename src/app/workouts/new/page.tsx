import WorkoutForm from "@/components/WorkoutForm";
import { createClient, getUser } from "@/lib/supabase/server";
import { getExerciseHistory, toLastSessions } from "@/lib/exerciseHistory";

export default async function NewWorkoutPage() {
  const supabase = await createClient();
  const user = await getUser();

  // Independent reads — keep them in one batch (see CLAUDE.md guardrails).
  const [{ data: profile }, history] = await Promise.all([
    supabase.from("profiles").select("weight_lb").eq("id", user!.id).maybeSingle(),
    getExerciseHistory(supabase),
  ]);

  return (
    <WorkoutForm
      defaultBodyweightLb={profile?.weight_lb ?? null}
      lastSessions={toLastSessions(history)}
    />
  );
}
