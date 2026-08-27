import { notFound } from "next/navigation";
import MealForm, { type InitialMeal } from "@/components/MealForm";
import { createClient } from "@/lib/supabase/server";

export default async function EditMealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: meal } = await supabase
    .from("meals")
    .select(
      "id, name, eaten_at, photo_path, meal_ingredients(fdc_id, name, weight_g, calories, protein_g, carbs_g, fat_g, micronutrients)"
    )
    .eq("id", id)
    .single();

  if (!meal) notFound();

  let photoUrl: string | null = null;
  if (meal.photo_path) {
    const { data: signed } = await supabase.storage
      .from("meal-photos")
      .createSignedUrl(meal.photo_path, 3600);
    photoUrl = signed?.signedUrl ?? null;
  }

  const initialMeal: InitialMeal = {
    id: meal.id,
    name: meal.name,
    eatenAt: meal.eaten_at,
    photoPath: meal.photo_path,
    photoUrl,
    ingredients: meal.meal_ingredients ?? [],
  };

  return <MealForm initialMeal={initialMeal} />;
}
