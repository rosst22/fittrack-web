"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface WeekPoint {
  label: string;
  calories: number;
  burned: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sleepHours: number | null;
}

// 2100 -> "2.1k". Same compaction as the other charts in the app.
function compact(n: number) {
  if (Math.abs(n) < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
}

const axisTick = { fontSize: 11, fill: "var(--muted)" } as const;

// Days are discrete, so each bar gets its own hover tooltip rather than a
// crosshair. Values stay in text ink; the swatch carries series identity.
function BarTooltip({
  active,
  payload,
  label,
  unit,
  extra,
}: {
  active?: boolean;
  payload?: { value?: number; color?: string; payload?: WeekPoint }[];
  label?: string;
  unit: string;
  extra?: (p: WeekPoint) => { label: string; value: string }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  const point = row.payload;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      <div className="flex items-center gap-2 text-muted">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: row.color }}
        />
        <span className="ml-auto tabular-nums text-foreground">
          {Math.round(row.value ?? 0).toLocaleString()} {unit}
        </span>
      </div>
      {point &&
        extra?.(point).map((e) => (
          <div key={e.label} className="mt-0.5 flex items-center gap-3 text-muted">
            <span>{e.label}</span>
            <span className="ml-auto tabular-nums">{e.value}</span>
          </div>
        ))}
    </div>
  );
}

/** Dashed line + label marking a goal on a bar chart. */
function TargetLine({ y, text }: { y: number; text: string }) {
  return (
    <ReferenceLine
      y={y}
      stroke="var(--muted)"
      strokeDasharray="4 4"
      label={{
        value: text,
        position: "insideTopRight",
        fill: "var(--muted)",
        fontSize: 10,
      }}
    />
  );
}

export default function WeekCharts({
  data,
  calorieTarget,
  proteinTarget,
}: {
  data: WeekPoint[];
  calorieTarget: number | null;
  proteinTarget: number | null;
}) {
  const hasSleep = data.some((d) => d.sleepHours != null);

  return (
    <div className="space-y-4">
      <ChartCard title="Calories eaten">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={compact}
            />
            <Tooltip
              content={
                <BarTooltip
                  unit="kcal"
                  extra={(p) => [
                    { label: "Burned", value: `${Math.round(p.burned).toLocaleString()} kcal` },
                    {
                      label: "Net",
                      value: `${Math.round(p.calories - p.burned).toLocaleString()} kcal`,
                    },
                  ]}
                />
              }
              cursor={{ fill: "var(--surface-2)" }}
            />
            {calorieTarget ? <TargetLine y={calorieTarget} text="target" /> : null}
            <Bar dataKey="calories" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={38}>
              {/* Untracked days render as an empty slot, not a zero-height bar
                  that reads as "ate nothing". */}
              {data.map((d) => (
                <Cell key={d.label} fillOpacity={d.calories > 0 ? 1 : 0.15} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Protein (g)">
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={axisTick}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={compact}
            />
            <Tooltip
              content={
                <BarTooltip
                  unit="g"
                  extra={(p) => [
                    { label: "Carbs", value: `${Math.round(p.carbs_g)} g` },
                    { label: "Fat", value: `${Math.round(p.fat_g)} g` },
                  ]}
                />
              }
              cursor={{ fill: "var(--surface-2)" }}
            />
            {proteinTarget ? <TargetLine y={proteinTarget} text="target" /> : null}
            <Bar dataKey="protein_g" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={38}>
              {data.map((d) => (
                <Cell key={d.label} fillOpacity={d.protein_g > 0 ? 1 : 0.15} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {hasSleep && (
        <ChartCard title="Sleep (hours)">
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tick={axisTick}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={44}
                domain={[0, 10]}
              />
              <Tooltip content={<BarTooltip unit="h" />} cursor={{ fill: "var(--surface-2)" }} />
              {/* 8h is the common adult sleep recommendation, not a goal you set
                  in the app — labelled so it doesn't read as your target. */}
              <TargetLine y={8} text="8h" />
              <Bar
                dataKey="sleepHours"
                fill="var(--accent-3)"
                radius={[4, 4, 0, 0]}
                maxBarSize={38}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-muted">{title}</p>
      {children}
    </div>
  );
}
