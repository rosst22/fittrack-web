"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface Habit {
  id: string;
  name: string;
  doneToday: boolean;
  logId: string | null;
}

export default function HabitsTracker({ initial }: { initial: Habit[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState<Habit[]>(initial);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  async function toggle(item: Habit) {
    if (item.doneToday) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, doneToday: false, logId: null } : i))
      );
      if (item.logId) await supabase.from("habit_logs").delete().eq("id", item.logId);
    } else {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, doneToday: true } : i)));
      const { data } = await supabase
        .from("habit_logs")
        .insert({ habit_id: item.id })
        .select()
        .single();
      if (data)
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, doneToday: true, logId: data.id } : i))
        );
    }
    router.refresh();
  }

  async function addHabit() {
    if (!name.trim()) return;
    setAdding(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("habits")
      .insert({ user_id: user.id, name: name.trim() })
      .select()
      .single();
    if (data)
      setItems((prev) => [...prev, { id: data.id, name: data.name, doneToday: false, logId: null }]);
    setName("");
    setAdding(false);
    router.refresh();
  }

  async function removeHabit(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("habits").delete().eq("id", id);
    router.refresh();
  }

  const doneCount = items.filter((i) => i.doneToday).length;

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Habits</h2>
        {items.length > 0 && (
          <span className="ml-auto text-sm text-muted">
            {doneCount}/{items.length} done today
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">
          Add daily habits to check off (e.g. Meditation, Journaling, Reading, Stretching).
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2"
            >
              <button
                onClick={() => toggle(item)}
                aria-label={item.doneToday ? "Mark not done" : "Mark done"}
                className={`flex h-6 w-6 items-center justify-center rounded-md border transition ${
                  item.doneToday
                    ? "border-amber-400 bg-amber-400 text-black"
                    : "border-border bg-surface"
                }`}
              >
                {item.doneToday && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <p className={`flex-1 text-sm font-medium ${item.doneToday ? "text-muted line-through" : "text-foreground"}`}>
                {item.name}
              </p>
              <button
                onClick={() => removeHabit(item.id)}
                className="text-xs text-danger hover:opacity-80"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-end gap-2 border-t border-border pt-4">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-muted">New habit</label>
          <input
            type="text"
            placeholder="Meditation"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addHabit()}
            className="w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={addHabit}
          disabled={adding || !name.trim()}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </section>
  );
}
