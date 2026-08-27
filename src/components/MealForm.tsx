"use client";

import { useState } from "react";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FoodLibrary from "@/components/FoodLibrary";
import { scaled, savedToRow, type IngredientRow, type SavedIngredient } from "@/lib/ingredientRow";
import type { FoodSearchResult } from "@/lib/usda";

export type { SavedIngredient };

export interface InitialMeal {
  id: string;
  name: string;
  eatenAt: string;
  photoPath: string | null;
  photoUrl: string | null;
  ingredients: SavedIngredient[];
}

// datetime-local inputs want "YYYY-MM-DDTHH:mm" in local time (no timezone).
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Shared by AI-paste and photo analysis: items carry TOTAL nutrition for
// `grams`; convert to per-100g so the weight field stays editable.
function parsedItemsToRows(items: unknown[]): IngredientRow[] {
  return items
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const grams = Number(item.grams ?? item.weight_g) || 100;
      const factor = grams / 100;
      const per = (total: unknown) => (Number(total) || 0) / factor;

      const micronutrients: Record<string, { amount: number; unit: string }> = {};
      const addMicro = (label: string, unit: string, total: unknown) => {
        const amt = Number(total);
        if (amt) micronutrients[label] = { amount: amt / factor, unit };
      };
      addMicro("Fiber", "g", item.fiber_g);
      addMicro("Sugars", "g", item.sugar_g);
      addMicro("Sodium", "mg", item.sodium_mg);
      addMicro("Potassium", "mg", item.potassium_mg);
      addMicro("Cholesterol", "mg", item.cholesterol_mg);

      return {
        tempId: crypto.randomUUID(),
        fdcId: null,
        name: typeof item.name === "string" ? item.name : "AI estimated ingredient",
        weightG: grams,
        per100g: {
          calories: per(item.calories),
          protein_g: per(item.protein_g),
          carbs_g: per(item.carbs_g),
          fat_g: per(item.fat_g),
          micronutrients,
        },
      };
    });
}

// Downscale + JPEG-compress a photo client-side so uploads are fast and
// cheap to analyze. Returns base64 without the data-URL prefix.
async function compressImage(
  file: File
): Promise<{ base64: string; blob: Blob; mediaType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("That doesn't look like an image"));
    el.src = dataUrl;
  });

  const MAX_DIM = 1200;
  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);

  const jpeg = canvas.toDataURL("image/jpeg", 0.8);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't compress image"))), "image/jpeg", 0.8)
  );
  return { base64: jpeg.split(",")[1], blob, mediaType: "image/jpeg" };
}

const AI_ESTIMATE_INSTRUCTIONS = `I'm going to describe a meal (and may attach a photo of it). Please estimate the ingredients, their weights in grams, and nutrition. If I attach a photo, use it together with my description — my description wins wherever they disagree. The calories and gram amounts of macros/micros must be the TOTAL for that ingredient's weight (not per 100g). Reply with ONLY a JSON array (no other text) in exactly this shape:

[
  { "name": "ingredient name", "grams": 150, "calories": 250, "protein_g": 20, "carbs_g": 10, "fat_g": 12, "fiber_g": 3, "sugar_g": 5, "sodium_mg": 120, "potassium_mg": 300, "cholesterol_mg": 40 }
]

Here is my meal: `;

export default function MealForm({ initialMeal }: { initialMeal?: InitialMeal }) {
  const router = useRouter();
  const supabase = createClient();
  const isEditing = !!initialMeal;

  const [mealName, setMealName] = useState(initialMeal?.name ?? "");
  const [eatenAt, setEatenAt] = useState(
    toDatetimeLocal(initialMeal?.eatenAt ?? new Date().toISOString())
  );
  const [rows, setRows] = useState<IngredientRow[]>(
    initialMeal ? initialMeal.ingredients.map(savedToRow) : []
  );
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [resultGrams, setResultGrams] = useState<Record<number, number>>({});
  const [showBranded, setShowBranded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiDescription, setAiDescription] = useState("");
  const [aiPaste, setAiPaste] = useState("");
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Adding from the library (single ingredient) and repeating a past meal
  // (many at once) are the same operation to the form: append rows.
  function addLibraryRows(newRows: IngredientRow[]) {
    setRows((prev) => [...prev, ...newRows]);
  }

  // "Repeat" offers the old meal's name, but never clobbers one you've typed.
  function suggestMealName(name: string) {
    setMealName((prev) => (prev.trim() ? prev : name));
  }

  async function saveRowsToLibrary(userId: string) {
    for (const row of rows) {
      await supabase.from("food_library").upsert(
        {
          user_id: userId,
          name: row.name,
          fdc_id: row.fdcId,
          calories: row.per100g.calories,
          protein_g: row.per100g.protein_g,
          carbs_g: row.per100g.carbs_g,
          fat_g: row.per100g.fat_g,
          micronutrients: row.per100g.micronutrients,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "user_id,name" }
      );
    }
  }

  const [showPhotoHelper, setShowPhotoHelper] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState("");
  const [photoAnalyzing, setPhotoAnalyzing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // The photo that will be saved alongside the meal (set once analysis succeeds).
  const [attachedPhotoBlob, setAttachedPhotoBlob] = useState<Blob | null>(null);
  const [attachedPhotoPreview, setAttachedPhotoPreview] = useState<string | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(
    initialMeal?.photoUrl ?? null
  );
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/food-search?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results);
      setResultGrams({});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  function addIngredient(food: FoodSearchResult) {
    setError(null);
    const grams = resultGrams[food.fdcId] ?? 100;
    setRows((prev) => [
      ...prev,
      {
        tempId: crypto.randomUUID(),
        fdcId: food.fdcId,
        name: food.description,
        weightG: grams,
        per100g: food.per100g,
      },
    ]);
    setResults([]);
    setQuery("");
    setResultGrams({});
  }

  function updateWeight(tempId: string, weightG: number) {
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, weightG } : r)));
  }

  function removeRow(tempId: string) {
    setRows((prev) => prev.filter((r) => r.tempId !== tempId));
  }

  function copyAiPrompt() {
    const prompt = AI_ESTIMATE_INSTRUCTIONS + aiDescription;
    navigator.clipboard.writeText(prompt);
  }

  function applyAiPaste() {
    setAiError(null);
    try {
      const parsed = JSON.parse(aiPaste);
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
      setRows((prev) => [...prev, ...parsedItemsToRows(parsed)]);
      setAiPaste("");
      setShowAiHelper(false);
    } catch {
      setAiError("Couldn't parse that — make sure you pasted only the JSON array the AI returned.");
    }
  }

  // Handles all three shapes: photo only, description only, or both. A photo is
  // compressed and kept so it can be attached to the saved meal; a text-only
  // estimate simply has no photo to attach.
  async function analyzeWithAi() {
    const note = photoNote.trim();
    if (!photoFile && !note) return;
    setPhotoAnalyzing(true);
    setPhotoError(null);
    try {
      const compressed = photoFile ? await compressImage(photoFile) : null;
      const res = await fetch("/api/coach/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: compressed?.base64,
          mediaType: compressed?.mediaType,
          description: note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      if (!Array.isArray(data.ingredients) || data.ingredients.length === 0) {
        throw new Error(
          compressed
            ? "No food found in that photo — try a clearer shot or add a description."
            : "Couldn't estimate that — try describing the meal in more detail."
        );
      }

      setRows((prev) => [...prev, ...parsedItemsToRows(data.ingredients)]);
      if (!mealName.trim() && data.meal_name) setMealName(data.meal_name);

      if (compressed) {
        if (attachedPhotoPreview) URL.revokeObjectURL(attachedPhotoPreview);
        setAttachedPhotoBlob(compressed.blob);
        setAttachedPhotoPreview(URL.createObjectURL(compressed.blob));
        setRemoveExistingPhoto(false);
      }

      setPhotoFile(null);
      setPhotoPreview(null);
      setPhotoNote("");
      setShowPhotoHelper(false);
    } catch (err) {
      setPhotoError((err as Error).message);
    } finally {
      setPhotoAnalyzing(false);
    }
  }

  function onPhotoSelected(file: File | null) {
    setPhotoError(null);
    setPhotoFile(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  const totals = rows.reduce(
    (acc, row) => {
      const s = scaled(row);
      return {
        calories: acc.calories + s.calories,
        protein_g: acc.protein_g + s.protein_g,
        carbs_g: acc.carbs_g + s.carbs_g,
        fat_g: acc.fat_g + s.fat_g,
      };
    },
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );

  function buildIngredientRows(mealId: string) {
    return rows.map((row) => {
      const s = scaled(row);
      const micronutrients: Record<string, { amount: number; unit: string }> = {};
      for (const [label, meta] of Object.entries(row.per100g.micronutrients)) {
        micronutrients[label] = {
          amount: Number((meta.amount * (row.weightG / 100)).toFixed(2)),
          unit: meta.unit,
        };
      }
      return {
        meal_id: mealId,
        fdc_id: row.fdcId,
        name: row.name,
        weight_g: row.weightG,
        calories: s.calories,
        protein_g: s.protein_g,
        carbs_g: s.carbs_g,
        fat_g: s.fat_g,
        micronutrients,
      };
    });
  }

  async function handleSaveMeal() {
    if (!mealName.trim() || rows.length === 0) {
      setError("Give the meal a name and add at least one ingredient.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      let mealId: string;

      const eatenAtIso = new Date(eatenAt).toISOString();

      if (isEditing) {
        mealId = initialMeal!.id;
        const { error: updateError } = await supabase
          .from("meals")
          .update({ name: mealName, eaten_at: eatenAtIso })
          .eq("id", mealId);
        if (updateError) throw updateError;

        // Replace ingredients wholesale — simplest reliable way to sync edits.
        const { error: delError } = await supabase
          .from("meal_ingredients")
          .delete()
          .eq("meal_id", mealId);
        if (delError) throw delError;
      } else {
        const { data: meal, error: mealError } = await supabase
          .from("meals")
          .insert({ user_id: user.id, name: mealName, eaten_at: eatenAtIso })
          .select()
          .single();
        if (mealError) throw mealError;
        mealId = meal.id;
      }

      const { error: ingredientsError } = await supabase
        .from("meal_ingredients")
        .insert(buildIngredientRows(mealId));
      if (ingredientsError) throw ingredientsError;

      await saveRowsToLibrary(user.id);

      if (attachedPhotoBlob) {
        const path = `${user.id}/${mealId}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("meal-photos")
          .upload(path, attachedPhotoBlob, { upsert: true, contentType: "image/jpeg" });
        if (uploadError) throw uploadError;
        await supabase.from("meals").update({ photo_path: path }).eq("id", mealId);
      } else if (removeExistingPhoto && initialMeal?.photoPath) {
        await supabase.storage.from("meal-photos").remove([initialMeal.photoPath]);
        await supabase.from("meals").update({ photo_path: null }).eq("id", mealId);
      }

      router.push("/meals");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const visibleResults = showBranded
    ? results
    : results.filter((f) => f.dataType !== "Branded");

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{isEditing ? "Edit meal" : "Log a meal"}</h1>

      <input
        type="text"
        placeholder="Meal name (e.g. Lunch)"
        value={mealName}
        onChange={(e) => setMealName(e.target.value)}
        className="w-full rounded-md border border-border px-3 py-2 text-sm"
      />

      <div>
        <label className="block text-xs font-medium text-neutral-500">Eaten at</label>
        <input
          type="datetime-local"
          value={eatenAt}
          onChange={(e) => setEatenAt(e.target.value)}
          className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </div>

      {(attachedPhotoPreview || (existingPhotoUrl && !removeExistingPhoto)) && (
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachedPhotoPreview ?? existingPhotoUrl!}
            alt="Meal photo"
            className="h-16 w-16 rounded-md object-cover"
          />
          <p className="flex-1 text-xs text-muted">Photo attached to this meal.</p>
          <button
            type="button"
            onClick={() => {
              if (attachedPhotoPreview) URL.revokeObjectURL(attachedPhotoPreview);
              setAttachedPhotoBlob(null);
              setAttachedPhotoPreview(null);
              setExistingPhotoUrl(null);
              setRemoveExistingPhoto(true);
            }}
            className="text-xs text-danger hover:opacity-80"
          >
            Remove
          </button>
        </div>
      )}

      <FoodLibrary onAddRows={addLibraryRows} onSuggestName={suggestMealName} />

      <div className="rounded-lg border border-border p-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="Search ingredient (e.g. chicken breast)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={searching}
            className="rounded-md bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {searching ? "..." : "Search"}
          </button>
        </form>

        {results.length > 0 && (
          <>
            <label className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
              <input
                type="checkbox"
                checked={showBranded}
                onChange={(e) => setShowBranded(e.target.checked)}
              />
              Show branded products (packaged foods — data can be less reliable)
            </label>

            {visibleResults.length === 0 && (
              <p className="mt-2 text-xs text-neutral-400">
                No generic USDA foods for this search. Tick the box above to see branded products.
              </p>
            )}

            <ul className="mt-2 divide-y divide-border rounded-md border border-border">
              {visibleResults.map((food) => {
                const isBranded = food.dataType === "Branded";
                const grams = resultGrams[food.fdcId] ?? 100;
                return (
                  <li key={food.fdcId} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {food.description}
                        {isBranded && food.brandName ? ` — ${food.brandName}` : ""}
                      </p>
                      <p className="text-xs text-neutral-400">
                        {food.per100g.calories.toFixed(0)} kcal / 100g ·{" "}
                        {isBranded ? "Branded" : "Generic (USDA)"}
                      </p>
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={grams}
                      onChange={(e) =>
                        setResultGrams((prev) => ({
                          ...prev,
                          [food.fdcId]: Number(e.target.value),
                        }))
                      }
                      className="w-16 rounded-md border border-border px-2 py-1 text-sm"
                    />
                    <span className="text-xs text-neutral-400">g</span>
                    <button
                      onClick={() => addIngredient(food)}
                      className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white"
                    >
                      Add
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <div className="rounded-lg border border-border">
        <button
          onClick={() => setShowPhotoHelper((v) => !v)}
          className="w-full px-4 py-2 text-left text-sm font-medium text-neutral-700 hover:bg-surface-2"
        >
          {showPhotoHelper ? "▾" : "▸"} ⚡ Let AI do it — describe your meal and/or add a photo
        </button>

        {showPhotoHelper && (
          <div className="space-y-3 border-t border-border p-4">
            <p className="text-xs text-neutral-400">
              Fill in either box — or both. A description plus a photo gives the best estimate.
            </p>

            <div>
              <label className="block text-xs font-medium text-neutral-500">
                Describe your meal
              </label>
              <textarea
                value={photoNote}
                onChange={(e) => setPhotoNote(e.target.value)}
                rows={2}
                placeholder="e.g. two scrambled eggs, sourdough toast with butter, and a banana"
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-500">
                Photo (optional) — food, package, or nutrition label
              </label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => onPhotoSelected(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm text-neutral-500 file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
              />
            </div>

            {photoPreview && (
              <NextImage
                src={photoPreview}
                alt="Meal preview"
                width={768}
                height={576}
                unoptimized
                className="h-auto max-h-48 w-auto rounded-md border border-border object-contain"
              />
            )}

            {photoError && <p className="text-xs text-red-600">{photoError}</p>}

            <button
              onClick={analyzeWithAi}
              disabled={(!photoFile && !photoNote.trim()) || photoAnalyzing}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {photoAnalyzing
                ? "Analyzing… (a few seconds)"
                : photoFile
                  ? "Analyze photo"
                  : "Estimate my meal"}
            </button>
            <p className="text-xs text-neutral-400">
              Uses your Anthropic API credits — about 1–2¢ with a photo, less for text only.
              Everything it adds is editable afterwards.
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border">
        <button
          onClick={() => setShowAiHelper((v) => !v)}
          className="w-full px-4 py-2 text-left text-sm font-medium text-neutral-700 hover:bg-surface-2"
        >
          {showAiHelper ? "▾" : "▸"} 📋 Free — use your own Claude/ChatGPT (no credits used)
        </button>

        {showAiHelper && (
          <div className="space-y-3 border-t border-border p-4">
            <p className="text-xs text-neutral-400">
              Same result, no API cost — you just do the round trip yourself.
            </p>
            <div>
              <label className="block text-xs font-medium text-neutral-500">
                1. Describe the meal
              </label>
              <textarea
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                rows={2}
                placeholder="e.g. a bowl of oatmeal with a banana and a tablespoon of peanut butter"
                className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm"
              />
              <button
                onClick={copyAiPrompt}
                disabled={!aiDescription.trim()}
                className="mt-2 rounded-md bg-surface-2 px-3 py-1.5 text-xs font-medium text-foreground hover:opacity-90 disabled:opacity-50"
              >
                Copy prompt to clipboard
              </button>
              <p className="mt-1 text-xs text-neutral-400">
                Paste that into your Claude or ChatGPT app, then paste its reply below.{" "}
                <span className="text-neutral-500">
                  Got a photo? Attach it in that app alongside the prompt — it works the same way.
                </span>
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-500">
                2. Paste the AI&apos;s JSON response
              </label>
              <textarea
                value={aiPaste}
                onChange={(e) => setAiPaste(e.target.value)}
                rows={4}
                placeholder='[{"name": "...", "weight_g": 150, "calories": 200, ...}]'
                className="mt-1 w-full rounded-md border border-border px-3 py-2 font-mono text-xs"
              />
              {aiError && <p className="mt-1 text-xs text-red-600">{aiError}</p>}
              <button
                onClick={applyAiPaste}
                disabled={!aiPaste.trim()}
                className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Add these ingredients
              </button>
            </div>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row) => {
            const s = scaled(row);
            return (
              <div
                key={row.tempId}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{row.name}</p>
                  <p className="text-xs text-neutral-500">
                    {s.calories.toFixed(0)} kcal · P {s.protein_g.toFixed(1)}g · C{" "}
                    {s.carbs_g.toFixed(1)}g · F {s.fat_g.toFixed(1)}g
                  </p>
                </div>
                <input
                  type="number"
                  value={row.weightG}
                  onChange={(e) => updateWeight(row.tempId, Number(e.target.value))}
                  className="w-20 rounded-md border border-border px-2 py-1 text-sm"
                />
                <span className="text-xs text-neutral-400">g</span>
                <button
                  onClick={() => removeRow(row.tempId)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  remove
                </button>
              </div>
            );
          })}

          <div className="rounded-md bg-surface-2 px-3 py-2 text-sm font-medium">
            Total: {totals.calories.toFixed(0)} kcal · P {totals.protein_g.toFixed(1)}g · C{" "}
            {totals.carbs_g.toFixed(1)}g · F {totals.fat_g.toFixed(1)}g
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={handleSaveMeal}
        disabled={saving}
        className="w-full rounded-md bg-accent py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving..." : isEditing ? "Save changes" : "Save meal"}
      </button>
    </div>
  );
}
