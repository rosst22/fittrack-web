// MET (Metabolic Equivalent of Task) values from the Compendium of Physical
// Activities. Calories burned ≈ MET * 3.5 * bodyweight_kg / 200 * minutes.
export interface ExerciseCategory {
  key: string;
  label: string;
  met: number;
  kind: "strength" | "cardio";
}

export const EXERCISE_CATEGORIES: ExerciseCategory[] = [
  { key: "weights_light", label: "Weight training (light/moderate)", met: 3.5, kind: "strength" },
  { key: "weights_vigorous", label: "Weight training (vigorous)", met: 6.0, kind: "strength" },
  { key: "calisthenics", label: "Calisthenics / bodyweight", met: 3.8, kind: "strength" },
  { key: "hiit", label: "HIIT / circuit training", met: 8.0, kind: "cardio" },
  { key: "walking", label: "Walking (brisk)", met: 4.3, kind: "cardio" },
  { key: "running_6mph", label: "Running (6 mph / 10 min-mile)", met: 9.8, kind: "cardio" },
  { key: "running_8mph", label: "Running (8 mph / 7.5 min-mile)", met: 11.8, kind: "cardio" },
  { key: "cycling_moderate", label: "Cycling (moderate)", met: 7.5, kind: "cardio" },
  { key: "elliptical", label: "Elliptical", met: 5.0, kind: "cardio" },
  { key: "rowing", label: "Rowing (moderate)", met: 7.0, kind: "cardio" },
  { key: "swimming", label: "Swimming", met: 7.0, kind: "cardio" },
  { key: "stairmaster", label: "Stair climber", met: 9.0, kind: "cardio" },
  { key: "yoga", label: "Yoga / stretching", met: 3.0, kind: "cardio" },
  { key: "basketball", label: "Basketball", met: 6.5, kind: "cardio" },
  { key: "soccer", label: "Soccer", met: 7.0, kind: "cardio" },
  { key: "other", label: "Other (general exercise)", met: 5.0, kind: "cardio" },
];

export function categoryByKey(key: string): ExerciseCategory | undefined {
  return EXERCISE_CATEGORIES.find((c) => c.key === key);
}

const LB_PER_KG = 2.20462;

// Calories burned for one exercise. Bodyweight in lb, duration in minutes.
export function caloriesBurned(met: number, bodyweightLb: number, durationMin: number): number {
  if (!met || !bodyweightLb || !durationMin) return 0;
  const bodyweightKg = bodyweightLb / LB_PER_KG;
  return (met * 3.5 * bodyweightKg) / 200 * durationMin;
}
