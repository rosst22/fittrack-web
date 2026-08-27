"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { timeLabel } from "@/lib/day";

export interface WaterLog {
  id: string;
  amount_oz: number;
  logged_at: string;
}

const QUICK_ADDS = [8, 12, 16, 20, 32];

export default function WaterTracker({
  initialLogs,
  targetOz,
}: {
  initialLogs: WaterLog[];
  targetOz: number | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [logs, setLogs] = useState<WaterLog[]>(initialLogs);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  const total = logs.reduce((sum, l) => sum + Number(l.amount_oz), 0);
  const pct = targetOz ? Math.min(100, (total / targetOz) * 100) : 0;

  async function addWater(oz: number) {
    if (!oz || oz <= 0) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from("water_logs")
      .insert({ user_id: user.id, amount_oz: oz })
      .select()
      .single();
    if (!error && data) setLogs((prev) => [data as WaterLog, ...prev]);
    setBusy(false);
    router.refresh();
  }

  async function removeLog(id: string) {
    setLogs((prev) => prev.filter((l) => l.id !== id));
    await supabase.from("water_logs").delete().eq("id", id);
    router.refresh();
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-sky-400" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Hydration</h2>
      </div>

      <p className="text-3xl font-bold text-foreground">
        {total.toFixed(0)}
        <span className="ml-1 text-base font-normal text-muted">
          oz{targetOz ? ` / ${targetOz.toFixed(0)} oz` : ""}
        </span>
      </p>

      {targetOz ? (
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-sky-400 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK_ADDS.map((oz) => (
          <button
            key={oz}
            disabled={busy}
            onClick={() => addWater(oz)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground transition hover:border-sky-400 disabled:opacity-50"
          >
            +{oz} oz
          </button>
        ))}
        <div className="flex items-center gap-1">
          <input
            type="number"
            placeholder="custom"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="w-20 rounded-lg px-2 py-2 text-sm"
          />
          <button
            disabled={busy || !custom}
            onClick={() => {
              addWater(Number(custom));
              setCustom("");
            }}
            className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {logs.length > 0 && (
        <ul className="mt-4 space-y-1">
          {logs.map((l) => (
            <li
              key={l.id}
              className="flex items-center justify-between text-sm text-muted"
            >
              <span>
                {Number(l.amount_oz).toFixed(0)} oz · {timeLabel(l.logged_at)}
              </span>
              <button
                onClick={() => removeLog(l.id)}
                className="text-danger hover:opacity-80"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
