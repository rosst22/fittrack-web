export interface Profile {
  id: string;
  height_in: number | null;
  age: number | null;
  weight_lb: number | null;
  sex: string | null;
}

const LB_PER_KG = 2.20462;
const CM_PER_IN = 2.54;

// Mifflin-St Jeor Basal Metabolic Rate (calories/day at rest).
export function estimateBMR(p: Profile): number | null {
  if (!p.weight_lb || !p.height_in || !p.age) return null;
  const kg = p.weight_lb / LB_PER_KG;
  const cm = p.height_in * CM_PER_IN;
  const base = 10 * kg + 6.25 * cm - 5 * p.age;
  if (p.sex === "female") return base - 161;
  if (p.sex === "male") return base + 5;
  // No sex given: average of the two constants.
  return base - 78;
}

// Sedentary maintenance estimate (BMR x 1.2). Logged workouts are tracked
// separately as calories burned, so we intentionally use the resting factor.
export function estimateMaintenance(p: Profile): number | null {
  const bmr = estimateBMR(p);
  return bmr == null ? null : bmr * 1.2;
}

export function formatHeight(heightIn: number | null): string {
  if (!heightIn) return "—";
  const ft = Math.floor(heightIn / 12);
  const inch = Math.round(heightIn % 12);
  return `${ft}'${inch}"`;
}
