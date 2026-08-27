export interface Goals {
  id: string;
  calorie_target: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  workouts_per_week: number | null;
  water_target_oz: number | null;
  notes: string | null;
}
