import GoalsForm from "@/components/GoalsForm";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Goals } from "@/lib/goals";

export default async function GoalsPage() {
  const supabase = await createClient();
  const user = await getUser();

  const { data: goals } = await supabase
    .from("goals")
    .select("id, calorie_target, protein_target_g, carbs_target_g, fat_target_g, workouts_per_week, water_target_oz, notes")
    .eq("id", user!.id)
    .maybeSingle();

  return <GoalsForm initial={(goals as Goals) ?? null} />;
}
