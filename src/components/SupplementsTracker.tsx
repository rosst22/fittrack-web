"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface Supplement {
  id: string;
  name: string;
  dose: string | null;
  category: string;
  takenToday: boolean;
  logId: string | null;
}

export default function SupplementsTracker({
  initial,
}: {
  initial: Supplement[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState<Supplement[]>(initial);
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [category, setCategory] = useState("supplement");
  const [adding, setAdding] = useState(false);

  async function toggle(item: Supplement) {
    if (item.takenToday) {
      // Un-take: delete today's log.
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, takenToday: false, logId: null } : i))
      );
      if (item.logId) await supabase.from("supplement_logs").delete().eq("id", item.logId);
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, takenToday: true } : i))
      );
      const { data } = await supabase
        .from("supplement_logs")
        .insert({ supplement_id: item.id })
        .select()
        .single();
      if (data)
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, takenToday: true, logId: data.id } : i))
        );
    }
    router.refresh();
  }

  async function addSupplement() {
    if (!name.trim()) return;
    setAdding(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("supplements")
      .insert({
        user_id: user.id,
        name: name.trim(),
        dose: dose.trim() || null,
        category,
      })
      .select()
      .single();
    if (data)
      setItems((prev) => [
        ...prev,
        { id: data.id, name: data.name, dose: data.dose, category: data.category, takenToday: false, logId: null },
      ]);
    setName("");
    setDose("");
    setAdding(false);
    router.refresh();
  }

  async function removeSupplement(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("supplements").delete().eq("id", id);
    router.refresh();
  }

  const takenCount = items.filter((i) => i.takenToday).length;

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-accent-2" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Supplements &amp; Meds
        </h2>
        {items.length > 0 && (
          <span className="ml-auto text-sm text-muted">
            {takenCount}/{items.length} taken today
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">
          Add your supplements and medications below (e.g. Creatine, Magnesium, Zinc, Vitamin D).
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
                aria-label={item.takenToday ? "Mark not taken" : "Mark taken"}
                className={`flex h-6 w-6 items-center justify-center rounded-md border transition ${
                  item.takenToday
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-surface"
                }`}
              >
                {item.takenToday && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <div className="flex-1">
                <p className={`text-sm font-medium ${item.takenToday ? "text-muted line-through" : "text-foreground"}`}>
                  {item.name}
                  {item.dose ? <span className="text-muted"> · {item.dose}</span> : null}
                </p>
                <p className="text-xs capitalize text-muted">{item.category}</p>
              </div>
              <button
                onClick={() => removeSupplement(item.id)}
                className="text-xs text-danger hover:opacity-80"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add form */}
      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <div className="flex-1 min-w-[8rem]">
          <label className="mb-1 block text-xs text-muted">Name</label>
          <input
            type="text"
            placeholder="Creatine"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="w-24">
          <label className="mb-1 block text-xs text-muted">Dose</label>
          <input
            type="text"
            placeholder="5 g"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs text-muted">Type</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg px-3 py-2 text-sm"
          >
            <option value="supplement">Supplement</option>
            <option value="medication">Medication</option>
          </select>
        </div>
        <button
          onClick={addSupplement}
          disabled={adding || !name.trim()}
          className="rounded-lg bg-accent-2 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </section>
  );
}
