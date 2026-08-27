"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ExercisePoint {
  label: string;
  /** Heaviest weight touched that session, lb. */
  topWeight: number;
  /** Best Epley estimate across the session's sets, lb. */
  est1RM: number;
  /** Total weight moved that session, lb. */
  volume: number;
}

// Mirrors TrendChart's compact axis: 12000 -> "12k".
function compact(n: number) {
  if (Math.abs(n) < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
}

const axisTick = { fontSize: 11, fill: "var(--muted)" } as const;
const legendStyle = { fontSize: 12, paddingBottom: 8 } as const;

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((row) => (
        <div key={row.name} className="flex items-center gap-2 text-muted">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: row.color }}
          />
          <span className="text-foreground">{row.name}</span>
          <span className="ml-auto tabular-nums">
            {Math.round(row.value ?? 0).toLocaleString()} {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ExerciseProgressChart({ data }: { data: ExercisePoint[] }) {
  // One session is a dot, not a trend — a line chart of a single point reads as
  // broken. Show the dot but say plainly that there's nothing to compare yet.
  const sparse = data.length < 2;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">
          Strength — top set vs. estimated 1RM
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={16}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={compact}
              domain={["dataMin - 20", "dataMax + 20"]}
            />
            <Tooltip content={<ChartTooltip unit="lb" />} cursor={{ stroke: "var(--border)" }} />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="plainline"
              wrapperStyle={legendStyle}
            />
            <Line
              type="monotone"
              dataKey="topWeight"
              name="Top set"
              stroke="var(--accent-2)"
              strokeWidth={2}
              dot={sparse ? { r: 4, strokeWidth: 0 } : false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="est1RM"
              name="Est. 1RM"
              stroke="var(--accent)"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={sparse ? { r: 4, strokeWidth: 0 } : false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-muted">
          Est. 1RM (Epley) puts a heavy triple and a light set of ten on one scale, so progress
          shows even when the rep scheme changes. It is an estimate — trust the trend, not the
          number.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">
          Volume — total weight moved
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={16}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={compact}
            />
            <Tooltip content={<ChartTooltip unit="lb" />} cursor={{ stroke: "var(--border)" }} />
            <Line
              type="monotone"
              dataKey="volume"
              name="Volume"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={sparse ? { r: 4, strokeWidth: 0 } : false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
