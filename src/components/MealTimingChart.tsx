"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface MealPoint {
  name: string;
  time: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

// 2100 -> "2.1k". Keeps the y-axis narrow so calorie values never get clipped.
function compact(n: number) {
  if (Math.abs(n) < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
}

const axisTick = { fontSize: 11, fill: "var(--muted)" } as const;

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MealPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-foreground">
        {p.name} · {p.time}
      </p>
      <p className="mt-1 text-muted">
        {p.calories.toFixed(0)} kcal · P {p.protein_g.toFixed(0)}g · C {p.carbs_g.toFixed(0)}g · F{" "}
        {p.fat_g.toFixed(0)}g
      </p>
    </div>
  );
}

export default function MealTimingChart({ data }: { data: MealPoint[] }) {
  if (data.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-muted">Meal timing</p>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="time"
            tick={axisTick}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={8}
          />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={compact}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--surface-2)" }} />
          <Bar dataKey="calories" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={48} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
