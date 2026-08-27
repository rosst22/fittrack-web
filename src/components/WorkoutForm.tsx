"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EXERCISE_CATEGORIES, categoryByKey, caloriesBurned } from "@/lib/exercises";
import {
  formatSets,
  formatVolume,
  normalizeExerciseName,
  volume,
  type ExerciseSet,
} from "@/lib/strength";
import type { LastSession } from "@/lib/exerciseHistory";
import { dayKey, prettyDate } from "@/lib/day";

export interface SavedExercise {
  name: string;
  category: string;
  met: number;
  duration_min: number;
  calories: number;
  exercise_sets: ExerciseSet[] | null;
}

export interface InitialWorkout {
  id: string;
  name: string;
  bodyweight_lb: number | null;
  exercises: SavedExercise[];
}

interface SetRow {
  tempId: string;
  weightLb: string;
  reps: string;
}

interface ExerciseRow {
  tempId: string;
  name: string;
  category: string;
  durationMin: number;
  sets: SetRow[];
  caloriesOverride: string;
}

function newSet(weightLb = "", reps = ""): SetRow {
  return { tempId: crypto.randomUUID(), weightLb, reps };
}

function newRow(): ExerciseRow {
  return {
    tempId: crypto.randomUUID(),
    name: "",
    category: "weights_light",
    durationMin: 0,
    sets: [newSet()],
    caloriesOverride: "",
  };
}

const inputCls = "rounded-md px-3 py-2 text-sm";

/** Set rows the user has actually filled in — blank trailing rows are ignored. */
function filledSets(row: ExerciseRow): ExerciseSet[] {
  return row.sets
    .filter((s) => s.weightLb.trim() !== "" || s.reps.trim() !== "")
    .map((s, i) => ({
      set_index: i + 1,
      weight_lb: s.weightLb.trim() === "" ? null : Number(s.weightLb),
      reps: s.reps.trim() === "" ? null : Number(s.reps),
    }));
}

export default function WorkoutForm({
  initialWorkout,
  defaultBodyweightLb,
  lastSessions = [],
}: {
  initialWorkout?: InitialWorkout;
  defaultBodyweightLb?: number | null;
  lastSessions?: LastSession[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const isEditing = !!initialWorkout;

  const [name, setName] = useState(initialWorkout?.name ?? "");
  const [bodyweight, setBodyweight] = useState(
    initialWorkout?.bodyweight_lb
      ? String(initialWorkout.bodyweight_lb)
      : defaultBodyweightLb
      ? String(defaultBodyweightLb)
      : ""
  );
  const [rows, setRows] = useState<ExerciseRow[]>(
    initialWorkout
      ? initialWorkout.exercises.map((e) => ({
          tempId: crypto.randomUUID(),
          name: e.name,
          category: e.category,
          durationMin: e.duration_min,
          sets:
            e.exercise_sets && e.exercise_sets.length > 0
              ? [...e.exercise_sets]
                  .sort((a, b) => a.set_index - b.set_index)
                  .map((s) =>
                    newSet(
                      s.weight_lb != null ? String(s.weight_lb) : "",
                      s.reps != null ? String(s.reps) : ""
                    )
                  )
              : [newSet()],
          // Preserve the exact saved burn; user can clear to re-auto-calc.
          caloriesOverride: e.calories ? String(Math.round(e.calories)) : "",
        }))
      : [newRow()]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bw = Number(bodyweight) || 0;

  // Normalized-name lookup for "what did I do last time".
  const lastByKey = useMemo(() => {
    const m = new Map<string, LastSession>();
    for (const s of lastSessions) m.set(s.key, s);
    return m;
  }, [lastSessions]);

  function lastFor(row: ExerciseRow): LastSession | undefined {
    const key = normalizeExerciseName(row.name);
    return key ? lastByKey.get(key) : undefined;
  }

  function updateRow(tempId: string, patch: Partial<ExerciseRow>) {
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)));
  }
  function removeRow(tempId: string) {
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  }

  function updateSet(rowId: string, setId: string, patch: Partial<SetRow>) {
    setRows((prev) =>
      prev.map((r) =>
        r.tempId === rowId
          ? { ...r, sets: r.sets.map((s) => (s.tempId === setId ? { ...s, ...patch } : s)) }
          : r
      )
    );
  }

  /** New sets copy the previous one — you usually repeat or nudge the load. */
  function addSet(rowId: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.tempId !== rowId) return r;
        const last = r.sets[r.sets.length - 1];
        return { ...r, sets: [...r.sets, newSet(last?.weightLb ?? "", last?.reps ?? "")] };
      })
    );
  }

  function removeSet(rowId: string, setId: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.tempId === rowId
          ? { ...r, sets: r.sets.length > 1 ? r.sets.filter((s) => s.tempId !== setId) : r.sets }
          : r
      )
    );
  }

  /** Copy last session's sets into this exercise, ready to edit and beat. */
  function prefillFromLast(rowId: string, last: LastSession) {
    setRows((prev) =>
      prev.map((r) =>
        r.tempId === rowId
          ? {
              ...r,
              category: last.category || r.category,
              durationMin: r.durationMin || last.durationMin,
              sets: last.sets.map((s) =>
                newSet(
                  s.weight_lb != null ? String(s.weight_lb) : "",
                  s.reps != null ? String(s.reps) : ""
                )
              ),
            }
          : r
      )
    );
  }

  function metCalories(row: ExerciseRow): number {
    const cat = categoryByKey(row.category);
    return caloriesBurned(cat?.met ?? 0, bw, row.durationMin);
  }

  function rowCalories(row: ExerciseRow): number {
    if (row.caloriesOverride.trim() !== "") return Number(row.caloriesOverride) || 0;
    return metCalories(row);
  }

  const totalCalories = rows.reduce((acc, r) => acc + rowCalories(r), 0);
  const totalVolume = rows.reduce((acc, r) => acc + volume(filledSets(r)), 0);

  async function handleSave() {
    if (!name.trim()) {
      setError("Give the workout a name.");
      return;
    }
    const validRows = rows.filter((r) => r.name.trim());
    if (validRows.length === 0) {
      setError("Add at least one exercise with a name.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      let workoutId: string;

      if (isEditing) {
        workoutId = initialWorkout!.id;
        const { error: upErr } = await supabase
          .from("workouts")
          .update({ name, bodyweight_lb: bw || null })
          .eq("id", workoutId);
        if (upErr) throw upErr;
        // exercise_sets cascade off workout_exercises, so this clears both.
        const { error: delErr } = await supabase
          .from("workout_exercises")
          .delete()
          .eq("workout_id", workoutId);
        if (delErr) throw delErr;
      } else {
        const { data: workout, error: insErr } = await supabase
          .from("workouts")
          .insert({ user_id: user.id, name, bodyweight_lb: bw || null })
          .select()
          .single();
        if (insErr) throw insErr;
        workoutId = workout.id;
      }

      // Mint each exercise's id here rather than reading it back. Sets have to
      // point at their parent exercise, and pairing them by insert-return order
      // would silently attach sets to the wrong lift if Postgres ever returned
      // rows in a different order (it makes no ordering guarantee). Two lifts in
      // one workout can share a name, so matching by name wouldn't be safe
      // either. Client-generated uuids sidestep both.
      const withIds = validRows.map((r) => ({ row: r, id: crypto.randomUUID() }));

      const exerciseRows = withIds.map(({ row: r, id }) => {
        const cat = categoryByKey(r.category);
        return {
          id,
          workout_id: workoutId,
          name: r.name.trim(),
          category: r.category,
          met: cat?.met ?? 0,
          duration_min: r.durationMin || 0,
          calories: rowCalories(r),
        };
      });

      const { error: exErr } = await supabase.from("workout_exercises").insert(exerciseRows);
      if (exErr) throw exErr;

      const setRowsToInsert = withIds.flatMap(({ row: r, id }) =>
        filledSets(r).map((s) => ({
          workout_exercise_id: id,
          set_index: s.set_index,
          weight_lb: s.weight_lb,
          reps: s.reps,
        }))
      );

      if (setRowsToInsert.length > 0) {
        const { error: setErr } = await supabase.from("exercise_sets").insert(setRowsToInsert);
        if (setErr) throw setErr;
      }

      router.push("/workouts");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-foreground">
        {isEditing ? "Edit workout" : "Log a workout"}
      </h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Workout name</label>
          <input
            type="text"
            placeholder="e.g. Push day"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`w-full ${inputCls}`}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Bodyweight (lb)</label>
          <input
            type="number"
            placeholder="e.g. 175"
            value={bodyweight}
            onChange={(e) => setBodyweight(e.target.value)}
            className={`w-full ${inputCls}`}
          />
        </div>
      </div>
      {!bw && (
        <p className="text-xs text-muted">
          Enter your bodyweight to estimate calories burned (uses MET formulas).
        </p>
      )}

      {/* Names you've logged before, so the browser can autocomplete them and
          history lookups actually match instead of forking on a typo. */}
      <datalist id="exercise-names">
        {lastSessions.map((s) => (
          <option key={s.key} value={s.name} />
        ))}
      </datalist>

      <div className="space-y-3">
        {rows.map((row) => {
          const cat = categoryByKey(row.category);
          const isStrength = cat?.kind === "strength";
          const last = lastFor(row);
          const rowVolume = volume(filledSets(row));

          return (
            <div
              key={row.tempId}
              className="space-y-3 rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  list="exercise-names"
                  placeholder="Exercise (e.g. Bench press)"
                  value={row.name}
                  onChange={(e) => updateRow(row.tempId, { name: e.target.value })}
                  className={`flex-1 ${inputCls}`}
                />
                <button
                  onClick={() => removeRow(row.tempId)}
                  className="text-xs text-danger hover:opacity-80"
                >
                  remove
                </button>
              </div>

              {last && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-surface-2 px-3 py-2 text-xs">
                  <span className="text-muted">
                    Last time ({prettyDate(dayKey(last.performedAt))}):
                  </span>
                  <span className="font-medium text-foreground">{formatSets(last.sets)}</span>
                  <button
                    onClick={() => prefillFromLast(row.tempId, last)}
                    className="ml-auto font-medium text-accent-2 hover:opacity-80"
                  >
                    use these
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-muted">Type</label>
                  <select
                    value={row.category}
                    onChange={(e) => updateRow(row.tempId, { category: e.target.value })}
                    className={`w-full ${inputCls}`}
                  >
                    {EXERCISE_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">Minutes</label>
                  <input
                    type="number"
                    min={0}
                    value={row.durationMin || ""}
                    onChange={(e) =>
                      updateRow(row.tempId, { durationMin: Number(e.target.value) })
                    }
                    className={`w-full ${inputCls}`}
                  />
                </div>
                <div className="flex items-end">
                  <span className="text-sm font-medium text-accent-2">
                    {rowCalories(row).toFixed(0)} kcal
                  </span>
                </div>
              </div>

              {isStrength && (
                <div className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <label className="text-xs font-medium text-muted">Sets</label>
                    {rowVolume > 0 && (
                      <span className="text-xs text-muted">
                        volume <span className="text-foreground">{formatVolume(rowVolume)}</span>
                      </span>
                    )}
                  </div>

                  {row.sets.map((s, i) => (
                    <div key={s.tempId} className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-xs text-muted">#{i + 1}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        placeholder={
                          last?.sets[i]?.weight_lb != null
                            ? String(last.sets[i].weight_lb)
                            : "lb"
                        }
                        value={s.weightLb}
                        onChange={(e) =>
                          updateSet(row.tempId, s.tempId, { weightLb: e.target.value })
                        }
                        className={`w-full ${inputCls}`}
                        aria-label={`Set ${i + 1} weight in pounds`}
                      />
                      <span className="shrink-0 text-xs text-muted">×</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        placeholder={
                          last?.sets[i]?.reps != null ? String(last.sets[i].reps) : "reps"
                        }
                        value={s.reps}
                        onChange={(e) =>
                          updateSet(row.tempId, s.tempId, { reps: e.target.value })
                        }
                        className={`w-full ${inputCls}`}
                        aria-label={`Set ${i + 1} reps`}
                      />
                      <button
                        onClick={() => removeSet(row.tempId, s.tempId)}
                        disabled={row.sets.length === 1}
                        className="shrink-0 px-1 text-xs text-danger hover:opacity-80 disabled:opacity-30"
                        aria-label={`Remove set ${i + 1}`}
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => addSet(row.tempId)}
                    className="w-full rounded-md border border-dashed border-border py-1.5 text-xs text-muted hover:text-foreground"
                  >
                    + Add set
                  </button>
                  <p className="text-xs text-muted">
                    Leave weight blank for bodyweight work (pull-ups, dips).
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs text-muted">
                  Calories burned (optional — overrides the estimate)
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder={`auto: ${metCalories(row).toFixed(0)} kcal`}
                  value={row.caloriesOverride}
                  onChange={(e) => updateRow(row.tempId, { caloriesOverride: e.target.value })}
                  className={`w-full ${inputCls}`}
                />
                <p className="mt-1 text-xs text-muted">
                  Enter a number from your watch/machine, or leave blank to use the MET estimate.
                </p>
              </div>
            </div>
          );
        })}

        <button
          onClick={() => setRows((prev) => [...prev, newRow()])}
          className="w-full rounded-md border border-dashed border-border py-2 text-sm text-muted hover:text-foreground"
        >
          + Add exercise
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-4 py-3 text-sm font-medium text-foreground">
        <span>
          Estimated calories burned:{" "}
          <span className="text-accent-2">{totalCalories.toFixed(0)} kcal</span>
        </span>
        {totalVolume > 0 && (
          <span>
            Total volume: <span className="text-accent-2">{formatVolume(totalVolume)}</span>
          </span>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-md bg-accent-2 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving..." : isEditing ? "Save changes" : "Save workout"}
      </button>
    </div>
  );
}
