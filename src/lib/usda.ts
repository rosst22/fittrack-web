export const NUTRIENT_IDS = {
  calories: 1008,
  protein_g: 1003,
  fat_g: 1004,
  carbs_g: 1005,
} as const;

// Common micronutrients worth surfacing (USDA nutrient IDs -> friendly label + unit)
export const MICRONUTRIENT_IDS: Record<number, { label: string; unit: string }> = {
  1079: { label: "Fiber", unit: "g" },
  2000: { label: "Sugars", unit: "g" },
  1087: { label: "Calcium", unit: "mg" },
  1089: { label: "Iron", unit: "mg" },
  1090: { label: "Magnesium", unit: "mg" },
  1092: { label: "Potassium", unit: "mg" },
  1093: { label: "Sodium", unit: "mg" },
  1095: { label: "Zinc", unit: "mg" },
  1162: { label: "Vitamin C", unit: "mg" },
  1114: { label: "Vitamin D", unit: "IU" },
  1109: { label: "Vitamin E", unit: "mg" },
  1185: { label: "Vitamin K", unit: "mcg" },
  1165: { label: "Thiamin (B1)", unit: "mg" },
  1166: { label: "Riboflavin (B2)", unit: "mg" },
  1167: { label: "Niacin (B3)", unit: "mg" },
  1175: { label: "Vitamin B6", unit: "mg" },
  1178: { label: "Vitamin B12", unit: "mcg" },
  1177: { label: "Folate", unit: "mcg" },
  1253: { label: "Cholesterol", unit: "mg" },
  1258: { label: "Saturated Fat", unit: "g" },
};

export interface Per100g {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  micronutrients: Record<string, { amount: number; unit: string }>;
}

export interface FoodSearchResult {
  fdcId: number;
  description: string;
  brandName?: string;
  dataType?: string;
  per100g: Per100g;
}

interface UsdaNutrient {
  nutrientId?: number;
  value?: number;
  nutrient?: { id?: number };
  amount?: number;
}

interface UsdaFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  dataType?: string;
  foodNutrients?: UsdaNutrient[];
}

interface UsdaSearchResponse {
  foods?: UsdaFood[];
}

// USDA returns nutrients in two shapes depending on endpoint:
//   search:  { nutrientId, value, unitName }
//   detail:  { nutrient: { id }, amount }
// This reads an amount by nutrient id from either shape.
function amountById(nutrients: UsdaNutrient[], id: number): number {
  const n = nutrients.find(
    (n) => n.nutrientId === id || n.nutrient?.id === id
  );
  return n?.value ?? n?.amount ?? 0;
}

function parsePer100g(nutrients: UsdaNutrient[]): Per100g {
  const micronutrients: Record<string, { amount: number; unit: string }> = {};
  for (const [idStr, meta] of Object.entries(MICRONUTRIENT_IDS)) {
    const amount = amountById(nutrients, Number(idStr));
    if (amount) micronutrients[meta.label] = { amount, unit: meta.unit };
  }

  return {
    calories: amountById(nutrients, NUTRIENT_IDS.calories),
    protein_g: amountById(nutrients, NUTRIENT_IDS.protein_g),
    carbs_g: amountById(nutrients, NUTRIENT_IDS.carbs_g),
    fat_g: amountById(nutrients, NUTRIENT_IDS.fat_g),
    micronutrients,
  };
}

export async function searchFoods(query: string, apiKey: string): Promise<FoodSearchResult[]> {
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", "15");
  url.searchParams.set("dataType", "Foundation,SR Legacy,Branded");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`USDA search failed: ${res.status}`);
  const data = (await res.json()) as UsdaSearchResponse;

  const results: FoodSearchResult[] = (data.foods ?? []).map((f) => ({
    fdcId: f.fdcId,
    description: f.description,
    brandName: f.brandOwner,
    dataType: f.dataType,
    per100g: parsePer100g(f.foodNutrients ?? []),
  }));

  // Foundation and SR Legacy are USDA-curated and reliable; Branded is
  // user-submitted and frequently has bad values. Rank curated foods first.
  const rank: Record<string, number> = { Foundation: 0, "SR Legacy": 1, Branded: 2 };
  return results.sort(
    (a, b) => (rank[a.dataType ?? ""] ?? 3) - (rank[b.dataType ?? ""] ?? 3)
  );
}
