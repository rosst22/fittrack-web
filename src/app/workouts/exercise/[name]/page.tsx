import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOneExerciseHistory } from "@/lib/exerciseHistory";
import {
  best1RM,
  formatSets,
  formatVolume,
  topSet,
  totalReps,
  volume,
} from "@/lib/strength";
import { dayKey, prettyDate } from "@/lib/day";
import ExerciseProgressChart, {
  type ExercisePoint,
} from "@/components/ExerciseProgressChart";

export default async function ExerciseHistoryPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName);

  const supabase = await createClient();
  const entry = await getOneExerciseHistory(supabase, name);

  if (!entry) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <BackLink />
        <h1 className="text-lg font-semibold text-foreground">{name}</h1>
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
          No logged sets for this exercise yet.
        </p>
      </div>
    );
  }

  // Sessions come back newest-first; charts read left-to-right in time.
  const chronological = [...entry.sessions].reverse();
  const points: ExercisePoint[] = chronological.map((s) => {
    const top = topSet(s.sets);
    return {
      label: prettyDate(dayKey(s.performedAt)),
      topWeight: top?.weight_lb ?? 0,
      est1RM: Math.round(best1RM(s.sets)),
      volume: Math.round(volume(s.sets)),
    };
  });

  // All-time bests, for the summary strip.
  const allSets = entry.sessions.flatMap((s) => s.sets);
  const heaviest = topSet(allSets);
  const bestEst = best1RM(allSets);
  const bestVolume = Math.max(...entry.sessions.map((s) => volume(s.sets)));

  const latest = entry.sessions[0];
  const previous = entry.sessions[1];
  const latestVolume = volume(latest.sets);
  const volumeDelta = previous ? latestVolume - volume(previous.sets) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <BackLink />

      <div>
        <h1 className="text-lg font-semibold text-foreground">{entry.name}</h1>
        <p className="text-xs text-muted">
          {entry.sessions.length} session{entry.sessions.length === 1 ? "" : "s"} logged · last
          on {prettyDate(dayKey(latest.performedAt))}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Heaviest set"
          value={heaviest ? `${heaviest.weight_lb} lb` : "—"}
          sub={heaviest ? `× ${heaviest.reps ?? 0} reps` : "bodyweight only"}
        />
        <Stat
          label="Best est. 1RM"
          value={bestEst > 0 ? `${Math.round(bestEst)} lb` : "—"}
          sub="Epley estimate"
        />
        <Stat label="Best session volume" value={formatVolume(bestVolume)} sub="weight × reps" />
        <Stat
          label="Last session"
          value={formatVolume(latestVolume)}
          sub={
            volumeDelta == null
              ? "first session"
              : volumeDelta === 0
              ? "same as previous"
              : `${volumeDelta > 0 ? "+" : "−"}${formatVolume(Math.abs(volumeDelta))} vs. previous`
          }
          tone={volumeDelta == null || volumeDelta === 0 ? "neutral" : volumeDelta > 0 ? "up" : "down"}
        />
      </div>

      <ExerciseProgressChart data={points} />

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">Every session</h2>
        {entry.sessions.map((s) => (
          <div
            key={`${s.workoutId}-${s.performedAt}`}
            className="rounded-xl border border-border bg-surface p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm font-medium text-foreground">
                {prettyDate(dayKey(s.performedAt))}
              </span>
              <span className="text-xs text-muted">{s.workoutName}</span>
            </div>
            <p className="mt-1 text-sm text-foreground">{formatSets(s.sets)}</p>
            <p className="mt-1 text-xs text-muted">
              {formatVolume(volume(s.sets))} · {totalReps(s.sets)} reps · {s.sets.length} set
              {s.sets.length === 1 ? "" : "s"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/workouts" className="text-xs text-muted hover:text-foreground">
      ← Back to workouts
    </Link>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "neutral" | "up" | "down";
}) {
  // Direction is carried by the arrow glyph as well as the color, so it still
  // reads without relying on color alone.
  const toneCls =
    tone === "up" ? "text-accent-2" : tone === "down" ? "text-danger" : "text-muted";
  const arrow = tone === "up" ? "▲ " : tone === "down" ? "▼ " : "";
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
      <p className={`mt-0.5 text-[11px] ${toneCls}`}>
        {arrow}
        {sub}
      </p>
    </div>
  );
}
