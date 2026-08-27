// Micronutrients we surface as daily totals. Labels must match the keys
// written into meal_ingredients.micronutrients (see usda.ts / MealForm).
export const TRACKED_MICROS = [
  { label: "Fiber", unit: "g" },
  { label: "Sodium", unit: "mg" },
  { label: "Potassium", unit: "mg" },
  { label: "Cholesterol", unit: "mg" },
] as const;

export type MicroTotals = Record<string, number>;

type MicroBlob = Record<string, { amount: number; unit: string }> | null | undefined;

export function emptyMicroTotals(): MicroTotals {
  return Object.fromEntries(TRACKED_MICROS.map((m) => [m.label, 0]));
}

export function addMicros(totals: MicroTotals, micronutrients: MicroBlob) {
  for (const m of TRACKED_MICROS) {
    const amt = Number(micronutrients?.[m.label]?.amount);
    if (amt) totals[m.label] += amt;
  }
  return totals;
}

export function formatMicro(label: string, value: number) {
  const unit = TRACKED_MICROS.find((m) => m.label === label)?.unit ?? "";
  return `${Math.round(value)}${unit}`;
}
