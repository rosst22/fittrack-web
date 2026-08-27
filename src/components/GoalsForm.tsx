"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Goals } from "@/lib/goals";

// Shared field styling. Focus ring + 150ms transitions for polish.
const field =
  "w-full rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-base text-foreground " +
  "transition duration-150 placeholder:text-muted/60 " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

export default function GoalsForm({ initial }: { initial?: Goals | null }) {
  const router = useRouter();
  const supabase = createClient();

  const [calorie, setCalorie] = useState(initial?.calorie_target?.toString() ?? "");
  const [protein, setProtein] = useState(initial?.protein_target_g?.toString() ?? "");
  const [carbs, setCarbs] = useState(initial?.carbs_target_g?.toString() ?? "");
  const [fat, setFat] = useState(initial?.fat_target_g?.toString() ?? "");
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState(
    initial?.workouts_per_week?.toString() ?? ""
  );
  const [waterTarget, setWaterTarget] = useState(initial?.water_target_oz?.toString() ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

      const { error: upErr } = await supabase.from("goals").upsert({
        id: user.id,
        calorie_target: numOrNull(calorie),
        protein_target_g: numOrNull(protein),
        carbs_target_g: numOrNull(carbs),
        fat_target_g: numOrNull(fat),
        workouts_per_week: numOrNull(workoutsPerWeek),
        water_target_oz: numOrNull(waterTarget),
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      });
      if (upErr) throw upErr;

      setSaved(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // Derived, display-only: how the macro targets add up in calories.
  const macroKcal =
    (Number(protein) || 0) * 4 + (Number(carbs) || 0) * 4 + (Number(fat) || 0) * 9;
  const calTarget = Number(calorie) || 0;
  const macroDelta = macroKcal - calTarget;

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:px-6">
      {/* Page header */}
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Planning</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-foreground">
          Goals
        </h1>
        <p className="mt-2 max-w-prose leading-relaxed text-muted">
          Set your daily nutrition and weekly training targets. Your dashboard tracks each day&apos;s
          progress against them.
        </p>
      </header>

      <div className="space-y-6">
        {/* Nutrition card */}
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Nutrition
            </h2>
          </div>

          <div className="space-y-6">
            <div>
              <label
                htmlFor="calorie"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Daily calorie target
              </label>
              <div className="relative">
                <input
                  id="calorie"
                  type="number"
                  inputMode="numeric"
                  placeholder="2200"
                  value={calorie}
                  onChange={(e) => setCalorie(e.target.value)}
                  className={`${field} pr-14 text-lg font-semibold`}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">
                  kcal
                </span>
              </div>
            </div>

            <div>
              <span className="mb-2 block text-sm font-medium text-foreground">
                Macro targets
              </span>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: "protein", label: "Protein", val: protein, set: setProtein, ph: "180" },
                  { id: "carbs", label: "Carbs", val: carbs, set: setCarbs, ph: "350" },
                  { id: "fat", label: "Fat", val: fat, set: setFat, ph: "80" },
                ].map((m) => (
                  <div key={m.id}>
                    <label htmlFor={m.id} className="mb-1.5 block text-xs text-muted">
                      {m.label}
                    </label>
                    <div className="relative">
                      <input
                        id={m.id}
                        type="number"
                        inputMode="numeric"
                        placeholder={m.ph}
                        value={m.val}
                        onChange={(e) => m.set(e.target.value)}
                        className={`${field} pr-7`}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
                        g
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Live, display-only macro→calorie reconciliation */}
              {macroKcal > 0 && (
                <div className="mt-3 flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-xs">
                  <span className="text-muted">Macros add up to</span>
                  <span className="font-medium text-foreground">
                    {macroKcal.toFixed(0)} kcal
                    {calTarget > 0 && (
                      <span className={macroDelta === 0 ? "text-accent" : "text-muted"}>
                        {" "}
                        ({macroDelta > 0 ? "+" : ""}
                        {macroDelta.toFixed(0)} vs target)
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Training card */}
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent-2" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Training
            </h2>
          </div>

          <label
            htmlFor="workouts"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            Workouts per week
          </label>
          <div className="relative max-w-[12rem]">
            <input
              id="workouts"
              type="number"
              inputMode="numeric"
              placeholder="4"
              value={workoutsPerWeek}
              onChange={(e) => setWorkoutsPerWeek(e.target.value)}
              className={`${field} pr-16 text-lg font-semibold`}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">
              / week
            </span>
          </div>

          <label
            htmlFor="water"
            className="mb-2 mt-6 block text-sm font-medium text-foreground"
          >
            Daily water target
          </label>
          <div className="relative max-w-[12rem]">
            <input
              id="water"
              type="number"
              inputMode="numeric"
              placeholder="100"
              value={waterTarget}
              onChange={(e) => setWaterTarget(e.target.value)}
              className={`${field} pr-12 text-lg font-semibold`}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">
              oz
            </span>
          </div>
        </section>

        {/* Notes card */}
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-muted" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
              Philosophy
            </h2>
          </div>

          <label htmlFor="notes" className="mb-2 block text-sm font-medium text-foreground">
            Describe your goals in your own words
          </label>
          <textarea
            id="notes"
            rows={5}
            placeholder="e.g. Lean bulk: gain ~0.5 lb/week, hit 180g protein, run 2x and lift 3x per week…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={`${field} resize-y leading-relaxed`}
          />
        </section>
      </div>

      {/* Action bar */}
      <div className="mt-8 flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-150 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent/40 active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save goals"}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-accent transition-opacity duration-150">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 13l4 4L19 7"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Saved
          </span>
        )}
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </div>
  );
}
