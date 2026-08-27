"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DayPoint {
  label: string;
  calories: number;
  burned: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sleepHours: number | null;
}

// 2100 -> "2.1k", 12000 -> "12k". Keeps the y-axis narrow so 4-digit calorie
// values never get clipped.
function compact(n: number) {
  if (Math.abs(n) < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
}

const axisTick = { fontSize: 11, fill: "var(--muted)" } as const;

// One shared tooltip: dark card, one row per series with its color swatch,
// value, and unit. Series identity comes from the swatch + label, never color
// alone.
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

const legendStyle = { fontSize: 12, paddingBottom: 8 } as const;

// Macro hues, checked with the palette validator against the dark card surface
// (#151b23): worst adjacent CVD pair is protein↔carbs at ΔE 8.9 (protan), above
// the ΔE 8 floor, and ΔE 23.8 for normal vision. Protein keeps the app's
// nutrition green so it means the same thing here as everywhere else.
const MACRO_COLORS = {
  protein: "#10b981",
  carbs: "#f59e0b",
  fat: "#a855f7",
} as const;

export default function TrendChart({ data }: { data: DayPoint[] }) {
  const hasSleep = data.some((d) => d.sleepHours != null);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">
          Calories — eaten vs. burned
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
            />
            <Tooltip
              content={<ChartTooltip unit="kcal" />}
              cursor={{ stroke: "var(--border)" }}
            />
            <Legend verticalAlign="top" align="right" iconType="plainline" wrapperStyle={legendStyle} />
            <Line
              type="monotone"
              dataKey="calories"
              name="Eaten"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="burned"
              name="Burned"
              stroke="var(--accent-2)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Macros (g)</p>
        <ResponsiveContainer width="100%" height={200}>
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
              width={36}
              tickFormatter={compact}
            />
            <Tooltip content={<ChartTooltip unit="g" />} cursor={{ stroke: "var(--border)" }} />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="plainline"
              wrapperStyle={legendStyle}
            />
            {/* All three are grams, so they share one axis. Hues are colorblind-
                checked; the legend means identity never rests on color alone. */}
            <Line
              type="monotone"
              dataKey="protein_g"
              name="Protein"
              stroke={MACRO_COLORS.protein}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="carbs_g"
              name="Carbs"
              stroke={MACRO_COLORS.carbs}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Line
              type="monotone"
              dataKey="fat_g"
              name="Fat"
              stroke={MACRO_COLORS.fat}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {hasSleep && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-muted">Sleep (hours)</p>
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
                width={36}
                domain={[0, 10]}
              />
              <Tooltip content={<ChartTooltip unit="h" />} cursor={{ stroke: "var(--border)" }} />
              <ReferenceLine
                y={8}
                stroke="var(--muted)"
                strokeDasharray="4 4"
                label={{
                  value: "8h",
                  position: "insideTopRight",
                  fill: "var(--muted)",
                  fontSize: 10,
                }}
              />
              {/* connectNulls stays off: a gap means a night with no Whoop data,
                  and bridging it would invent sleep that was never recorded. */}
              <Line
                type="monotone"
                dataKey="sleepHours"
                name="Asleep"
                stroke="var(--accent-3)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
