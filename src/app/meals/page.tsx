import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { deleteMeal, toggleMealFavorite } from "@/lib/actions";
import { dayRange, todayStr, timeLabel } from "@/lib/day";
import DateNav from "@/components/DateNav";
import { TRACKED_MICROS, emptyMicroTotals, addMicros, formatMicro } from "@/lib/micros";
import MealTimingChart from "@/components/MealTimingChart";

export default async function MealsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const selectedDate = date ?? todayStr();
  const { start, end } = dayRange(selectedDate);

  const supabase = await createClient();
  const { data: meals } = await supabase
    .from("meals")
    .select(
      "id, name, eaten_at, photo_path, is_favorite, meal_ingredients(id, name, weight_g, calories, protein_g, carbs_g, fat_g, micronutrients)"
    )
    .gte("eaten_at", start)
    .lte("eaten_at", end)
    .order("eaten_at", { ascending: true });

  const photoPaths = (meals ?? []).flatMap((m) => (m.photo_path ? [m.photo_path] : []));
  const photoUrls = new Map<string, string>();
  if (photoPaths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("meal-photos")
      .createSignedUrls(photoPaths, 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) photoUrls.set(s.path, s.signedUrl);
    }
  }

  const totals = (meals ?? []).reduce(
    (acc, meal) => {
      for (const ing of meal.meal_ingredients ?? []) {
        acc.calories += ing.calories ?? 0;
        acc.protein_g += ing.protein_g ?? 0;
        acc.carbs_g += ing.carbs_g ?? 0;
        acc.fat_g += ing.fat_g ?? 0;
        addMicros(acc.micros, ing.micronutrients);
      }
      return acc;
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, micros: emptyMicroTotals() }
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Meals</h1>
        <Link
          href="/meals/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Log meal
        </Link>
      </div>

      <DateNav basePath="/meals" date={selectedDate} />

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-xs uppercase tracking-wide text-muted">Daily total</p>
        <p className="mt-1 text-2xl font-bold text-foreground">
          {totals.calories.toFixed(0)}{" "}
          <span className="text-base font-normal text-muted">kcal</span>
        </p>
        <div className="mt-2 flex gap-4 text-sm text-muted">
          <span>
            <span className="text-accent">P</span> {totals.protein_g.toFixed(1)}g
          </span>
          <span>
            <span className="text-accent">C</span> {totals.carbs_g.toFixed(1)}g
          </span>
          <span>
            <span className="text-accent">F</span> {totals.fat_g.toFixed(1)}g
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-xs text-muted">
          {TRACKED_MICROS.map((m) => (
            <span key={m.label}>
              {m.label} {formatMicro(m.label, totals.micros[m.label])}
            </span>
          ))}
        </div>
      </div>

      <MealTimingChart
        data={(meals ?? []).map((meal) => {
          const mt = (meal.meal_ingredients ?? []).reduce(
            (acc, ing) => {
              acc.calories += ing.calories ?? 0;
              acc.protein_g += ing.protein_g ?? 0;
              acc.carbs_g += ing.carbs_g ?? 0;
              acc.fat_g += ing.fat_g ?? 0;
              return acc;
            },
            { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
          );
          return {
            name: meal.name,
            time: timeLabel(meal.eaten_at),
            ...mt,
          };
        })}
      />

      <div className="space-y-3">
        {(meals ?? []).length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
            No meals logged for this day yet.
          </p>
        )}
        {(meals ?? []).map((meal) => {
          const mt = (meal.meal_ingredients ?? []).reduce(
            (acc, ing) => {
              acc.calories += ing.calories ?? 0;
              acc.protein_g += ing.protein_g ?? 0;
              acc.carbs_g += ing.carbs_g ?? 0;
              acc.fat_g += ing.fat_g ?? 0;
              return acc;
            },
            { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
          );

          const photoUrl = meal.photo_path ? photoUrls.get(meal.photo_path) : undefined;

          return (
            <div key={meal.id} className="flex gap-3 rounded-xl border border-border bg-surface p-4">
              {photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl}
                  alt={meal.name}
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              )}
              <div className="flex-1">
              <div className="flex items-baseline justify-between">
                <h2 className="font-medium text-foreground">{meal.name}</h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">{timeLabel(meal.eaten_at)}</span>
                  {/* Starred meals sort to the top of the library's "Past meals" tab. */}
                  <form action={toggleMealFavorite}>
                    <input type="hidden" name="id" value={meal.id} />
                    <input type="hidden" name="next" value={String(!meal.is_favorite)} />
                    <button
                      aria-label={meal.is_favorite ? "Unfavorite meal" : "Favorite meal"}
                      className={
                        meal.is_favorite
                          ? "text-sm leading-none text-amber-500"
                          : "text-sm leading-none text-muted hover:text-amber-500"
                      }
                    >
                      {meal.is_favorite ? "★" : "☆"}
                    </button>
                  </form>
                  <Link
                    href={`/meals/${meal.id}/edit`}
                    className="text-xs text-muted hover:text-foreground"
                  >
                    edit
                  </Link>
                  <form action={deleteMeal}>
                    <input type="hidden" name="id" value={meal.id} />
                    <button className="text-xs text-danger hover:opacity-80">delete</button>
                  </form>
                </div>
              </div>
              <p className="mt-1 text-sm text-accent">
                {mt.calories.toFixed(0)} kcal · P {mt.protein_g.toFixed(1)}g · C{" "}
                {mt.carbs_g.toFixed(1)}g · F {mt.fat_g.toFixed(1)}g
              </p>
              <ul className="mt-2 space-y-1">
                {(meal.meal_ingredients ?? []).map((ing) => (
                  <li key={ing.id} className="text-xs text-muted">
                    {ing.name} — {ing.weight_g}g ({ing.calories.toFixed(0)} kcal)
                  </li>
                ))}
              </ul>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
