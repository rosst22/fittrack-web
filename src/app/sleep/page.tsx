import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import type { WhoopSleepRecord } from "@/lib/whoop";
import { dateTimeLabel, dayKey, prettyDate } from "@/lib/day";

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">
        {value}
        {unit && <span className="ml-1 text-sm font-normal text-muted">{unit}</span>}
      </p>
    </div>
  );
}

const fmt = (n: number | undefined, digits = 0) => (n == null ? "—" : n.toFixed(digits));

function hoursMin(ms: number | undefined) {
  if (ms == null) return "—";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

export default async function SleepPage() {
  const supabase = await createClient();
  const user = await getUser();
  const { data: connection } = await supabase
    .from("whoop_connections")
    .select("last_sleep_json, last_synced_at")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!connection) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Sleep</h1>
        <p className="mt-2 max-w-prose leading-relaxed text-muted">
          Connect your Whoop account to see sleep performance, efficiency, and stages here.
        </p>
        <a
          href="/api/whoop/authorize"
          className="mt-6 inline-block rounded-lg bg-accent-2 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-150 hover:opacity-90 active:scale-[0.98]"
        >
          Connect Whoop
        </a>
      </div>
    );
  }

  const records = ((connection.last_sleep_json as WhoopSleepRecord[] | null) ?? [])
    .filter((r) => r.score_state === "SCORED" && !r.nap)
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());

  const latest = records[0];

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Sleep</h1>
      <p className="mt-2 text-sm text-muted">
        {connection.last_synced_at
          ? `Last synced ${dateTimeLabel(connection.last_synced_at)}`
          : "Use Sync now on the Whoop page to import sleep data."}
      </p>

      {latest && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Performance" value={fmt(latest.score?.sleep_performance_percentage)} unit="%" />
            <Stat label="Efficiency" value={fmt(latest.score?.sleep_efficiency_percentage)} unit="%" />
            <Stat label="Time in bed" value={hoursMin(latest.score?.stage_summary?.total_in_bed_time_milli)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Light" value={hoursMin(latest.score?.stage_summary?.total_light_sleep_time_milli)} />
            <Stat label="Deep (SWS)" value={hoursMin(latest.score?.stage_summary?.total_slow_wave_sleep_time_milli)} />
            <Stat label="REM" value={hoursMin(latest.score?.stage_summary?.total_rem_sleep_time_milli)} />
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
          Recent nights
        </h2>
        {records.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted">
            No sleep data yet.
          </p>
        ) : (
          <div className="space-y-2">
            {records.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {prettyDate(dayKey(r.start))}
                  </p>
                  <p className="text-xs text-muted">
                    {hoursMin(r.score?.stage_summary?.total_in_bed_time_milli)} in bed
                  </p>
                </div>
                <div className="flex gap-4 text-right">
                  <div>
                    <p className="text-xs text-muted">Performance</p>
                    <p className="font-semibold text-foreground">
                      {fmt(r.score?.sleep_performance_percentage)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Efficiency</p>
                    <p className="font-semibold text-foreground">
                      {fmt(r.score?.sleep_efficiency_percentage)}%
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-muted">
        <Link href="/" className="underline hover:text-foreground">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
