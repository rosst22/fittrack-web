"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function deleteMeal(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("meals").delete().eq("id", id);
  revalidatePath("/meals");
  revalidatePath("/");
}

// Star / unstar a meal so it sorts to the top of the "Past meals" tab in the
// library picker. RLS already scopes `meals` to the signed-in user, so the id
// alone is safe to trust here.
export async function toggleMealFavorite(formData: FormData) {
  const id = formData.get("id") as string;
  const next = formData.get("next") === "true";
  const supabase = await createClient();
  await supabase.from("meals").update({ is_favorite: next }).eq("id", id);
  revalidatePath("/meals");
}

export async function deleteWorkout(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("workouts").delete().eq("id", id);
  revalidatePath("/workouts");
  revalidatePath("/");
}
