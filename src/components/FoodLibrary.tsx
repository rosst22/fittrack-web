"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { savedToRow, type IngredientRow, type SavedIngredient } from "@/lib/ingredientRow";

// A row in `food_library`: per-100g nutrition, deduped per user by name.
interface LibraryFood {
  name: string;
  fdc_id: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  micronutrients: Record<string, { amount: number; unit: string }>;
  is_favorite: boolean;
}

// A previously-logged meal, with enough of its ingredients to re-log it whole.
interface PastMeal {
  id: string;
  name: string;
  eaten_at: string;
  is_favorite: boolean;
  meal_ingredients: SavedIngredient[];
}

type Tab = "favorites" | "all" | "meals";

const TABS: { key: Tab; label: string }[] = [
  { key: "favorites", label: "★ Favorites" },
  { key: "all", label: "All ingredients" },
  { key: "meals", label: "Past meals" },
];

export default function FoodLibrary({
  onAddRows,
  onSuggestName,
}: {
  onAddRows: (rows: IngredientRow[]) => void;
  onSuggestName: (name: string) => void;
}) {
  const supabase = createClient();

  const [tab, setTab] = useState<Tab>("favorites");
  const [foods, setFoods] = useState<LibraryFood[]>([]);
  const [meals, setMeals] = useState<PastMeal[]>([]);
  const [query, setQuery] = useState("");
  const [grams, setGrams] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  // Confirms an add without yanking focus — keyed by food name / meal id.
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const [{ data: foodData }, { data: mealData }] = await Promise.all([
        supabase
          .from("food_library")
          .select("name, fdc_id, calories, protein_g, carbs_g, fat_g, micronutrients, is_favorite")
          .order("is_favorite", { ascending: false })
          .order("last_used_at", { ascending: false })
          .limit(200),
        supabase
          .from("meals")
          .select(
            "id, name, eaten_at, is_favorite, meal_ingredients(fdc_id, name, weight_g, calories, protein_g, carbs_g, fat_g, micronutrients)"
          )
          .order("is_favorite", { ascending: false })
          .order("eaten_at", { ascending: false })
          .limit(40),
      ]);
      if (!alive) return;
      setFoods(foodData ?? []);
      setMeals((mealData as PastMeal[] | null) ?? []);
      setLoading(false);
    }
    load();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(key: string) {
    setJustAdded(key);
    setTimeout(() => setJustAdded((k) => (k === key ? null : k)), 1200);
  }

  async function toggleFavorite(food: LibraryFood) {
    const next = !food.is_favorite;
    // Optimistic: the star should feel instant even on a slow connection.
    setFoods((prev) =>
      prev.map((f) => (f.name === food.name ? { ...f, is_favorite: next } : f))
    );
    const { error } = await supabase
      .from("food_library")
      .update({ is_favorite: next })
      .eq("name", food.name);
    if (error) {
      setFoods((prev) =>
        prev.map((f) => (f.name === food.name ? { ...f, is_favorite: !next } : f))
      );
    }
  }

  async function removeFood(food: LibraryFood) {
    const previous = foods;
    setFoods((prev) => prev.filter((f) => f.name !== food.name));
    const { error } = await supabase.from("food_library").delete().eq("name", food.name);
    if (error) setFoods(previous);
  }

  function addFood(food: LibraryFood) {
    onAddRows([
      {
        tempId: crypto.randomUUID(),
        fdcId: food.fdc_id,
        name: food.name,
        weightG: grams[food.name] ?? 100,
        per100g: {
          calories: food.calories,
          protein_g: food.protein_g,
          carbs_g: food.carbs_g,
          fat_g: food.fat_g,
          micronutrients: food.micronutrients,
        },
      },
    ]);
    flash(food.name);
  }

  // Re-log a whole meal: copy every ingredient at its original weight.
  function repeatMeal(meal: PastMeal) {
    const rows = (meal.meal_ingredients ?? []).map(savedToRow);
    if (rows.length === 0) return;
    onAddRows(rows);
    onSuggestName(meal.name);
    flash(meal.id);
  }

  const needle = query.trim().toLowerCase();
  const matches = (name: string) => !needle || name.toLowerCase().includes(needle);

  const visibleFoods = foods.filter(
    (f) => matches(f.name) && (tab === "all" || f.is_favorite)
  );
  const visibleMeals = meals.filter((m) => matches(m.name));

  const isEmpty = foods.length === 0 && meals.length === 0;
  if (loading || isEmpty) return null;

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="mb-2 text-sm font-medium text-neutral-700">📚 My food library</p>

      <div className="mb-3 flex gap-1 rounded-md bg-surface-2 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded px-2 py-1 text-xs font-medium transition ${
              tab === t.key
                ? "bg-accent text-white"
                : "text-neutral-600 hover:bg-surface"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder={tab === "meals" ? "Filter past meals…" : "Filter ingredients…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-md border border-border px-3 py-2 text-sm"
      />

      <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
        {tab === "meals" ? (
          <>
            {visibleMeals.length === 0 && (
              <li className="px-3 py-2 text-xs text-neutral-400">
                {meals.length === 0 ? "No meals logged yet." : "No matches."}
              </li>
            )}
            {visibleMeals.map((meal) => {
              const kcal = (meal.meal_ingredients ?? []).reduce(
                (sum, ing) => sum + (ing.calories ?? 0),
                0
              );
              const count = (meal.meal_ingredients ?? []).length;
              return (
                <li key={meal.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {meal.is_favorite && <span className="text-amber-500">★ </span>}
                      {meal.name}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {kcal.toFixed(0)} kcal · {count} ingredient{count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => repeatMeal(meal)}
                    disabled={count === 0}
                    className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
                  >
                    {justAdded === meal.id ? "Added ✓" : "Repeat"}
                  </button>
                </li>
              );
            })}
          </>
        ) : (
          <>
            {visibleFoods.length === 0 && (
              <li className="px-3 py-2 text-xs text-neutral-400">
                {tab === "favorites"
                  ? "No favorites yet — star an ingredient in “All ingredients”."
                  : "No matches."}
              </li>
            )}
            {visibleFoods.map((food) => (
              <li key={food.name} className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => toggleFavorite(food)}
                  aria-label={food.is_favorite ? `Unfavorite ${food.name}` : `Favorite ${food.name}`}
                  aria-pressed={food.is_favorite}
                  className={`text-base leading-none transition ${
                    food.is_favorite
                      ? "text-amber-500"
                      : "text-neutral-300 hover:text-amber-400"
                  }`}
                >
                  {food.is_favorite ? "★" : "☆"}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{food.name}</p>
                  <p className="text-xs text-neutral-400">
                    {food.calories.toFixed(0)} kcal / 100g
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  value={grams[food.name] ?? 100}
                  onChange={(e) =>
                    setGrams((prev) => ({ ...prev, [food.name]: Number(e.target.value) }))
                  }
                  className="w-16 rounded-md border border-border px-2 py-1 text-sm"
                />
                <span className="text-xs text-neutral-400">g</span>
                <button
                  type="button"
                  onClick={() => addFood(food)}
                  className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white"
                >
                  {justAdded === food.name ? "✓" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => removeFood(food)}
                  aria-label={`Remove ${food.name} from library`}
                  className="text-xs text-neutral-300 hover:text-danger"
                >
                  ✕
                </button>
              </li>
            ))}
          </>
        )}
      </ul>
    </div>
  );
}
