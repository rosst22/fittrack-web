"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/profile";

const inputCls = "w-full rounded-md px-3 py-2 text-sm";

export default function ProfileForm({ initial }: { initial?: Profile | null }) {
  const router = useRouter();
  const supabase = createClient();
  const isOnboarding = !initial;

  const [heightFt, setHeightFt] = useState(
    initial?.height_in ? String(Math.floor(initial.height_in / 12)) : ""
  );
  const [heightIn, setHeightIn] = useState(
    initial?.height_in ? String(Math.round(initial.height_in % 12)) : ""
  );
  const [age, setAge] = useState(initial?.age ? String(initial.age) : "");
  const [weight, setWeight] = useState(initial?.weight_lb ? String(initial.weight_lb) : "");
  const [sex, setSex] = useState(initial?.sex ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    const totalIn = (Number(heightFt) || 0) * 12 + (Number(heightIn) || 0);
    if (!totalIn || !age || !weight) {
      setError("Please fill in height, age, and weight.");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { error: upErr } = await supabase.from("profiles").upsert({
        id: user.id,
        height_in: totalIn,
        age: Number(age),
        weight_lb: Number(weight),
        sex: sex || null,
        updated_at: new Date().toISOString(),
      });
      if (upErr) throw upErr;

      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          {isOnboarding ? "Welcome! Tell us about you" : "Your profile"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Used to estimate calories burned and your maintenance calories. You can change it anytime.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Height</label>
        <div className="flex gap-2">
          <div className="flex flex-1 items-center gap-1">
            <input
              type="number"
              placeholder="5"
              value={heightFt}
              onChange={(e) => setHeightFt(e.target.value)}
              className={inputCls}
            />
            <span className="text-sm text-muted">ft</span>
          </div>
          <div className="flex flex-1 items-center gap-1">
            <input
              type="number"
              placeholder="10"
              value={heightIn}
              onChange={(e) => setHeightIn(e.target.value)}
              className={inputCls}
            />
            <span className="text-sm text-muted">in</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Age</label>
          <input
            type="number"
            placeholder="30"
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Weight (lb)</label>
          <input
            type="number"
            placeholder="175"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">
          Sex (for calorie formula — optional)
        </label>
        <select value={sex} onChange={(e) => setSex(e.target.value)} className={inputCls}>
          <option value="">Prefer not to say</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving..." : isOnboarding ? "Get started" : "Save profile"}
      </button>
    </div>
  );
}
