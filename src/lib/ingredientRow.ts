// Shared shape for an editable ingredient line in the meal form, plus the
// conversions between it and the *scaled* totals we persist.
//
// Storage rule of thumb: `meal_ingredients` and the AI parsers deal in TOTALS
// for a given weight, while `food_library` and this row type deal in PER-100g
// so the grams field stays editable. Everything here is that conversion.
import type { Per100g } from "@/lib/usda";

export interface IngredientRow {
  tempId: string;
  fdcId: number | null;
  name: string;
  weightG: number;
  per100g: Per100g;
}

export interface SavedIngredient {
  fdc_id: number | null;
  name: string;
  weight_g: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  micronutrients: Record<string, { amount: number; unit: string }>;
}

export function scaled(row: IngredientRow) {
  const factor = row.weightG / 100;
  return {
    calories: row.per100g.calories * factor,
    protein_g: row.per100g.protein_g * factor,
    carbs_g: row.per100g.carbs_g * factor,
    fat_g: row.per100g.fat_g * factor,
  };
}

// Saved ingredients store *scaled* totals. Convert back to per-100g so the
// weight field stays editable.
export function savedToRow(ing: SavedIngredient): IngredientRow {
  const factor = (ing.weight_g || 100) / 100;
  const per100gMicros: Record<string, { amount: number; unit: string }> = {};
  for (const [label, meta] of Object.entries(ing.micronutrients ?? {})) {
    per100gMicros[label] = { amount: meta.amount / factor, unit: meta.unit };
  }
  return {
    tempId: crypto.randomUUID(),
    fdcId: ing.fdc_id,
    name: ing.name,
    weightG: ing.weight_g,
    per100g: {
      calories: ing.calories / factor,
      protein_g: ing.protein_g / factor,
      carbs_g: ing.carbs_g / factor,
      fat_g: ing.fat_g / factor,
      micronutrients: per100gMicros,
    },
  };
}
