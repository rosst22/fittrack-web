import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { syncWhoop } from "@/lib/whoopActions";
import WhoopSyncButton from "@/components/WhoopSyncButton";
import { dateTimeLabel } from "@/lib/day";

interface WhoopConnectionRow {
  last_recovery_score: number | null;
  last_resting_hr: number | null;
  last_hrv_ms: number | null;
  last_sleep_performance: number | null;
  last_sleep_efficiency: number | null;
  last_strain: number | null;
  last_avg_hr: number | null;
  last_synced_at: string | null;
}

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

export default async function WhoopPage({
  searchParams,
}: {
  searchParams: Promise<{
    connected?: string;
    synced?: string;
    error?: string;
    connectionError?: string;
    reconnect?: string;
  }>;
}) {
  const { connected, synced, error, connectionError, reconnect } = await searchParams;
  const supabase = await createClient();
  const user = await getUser();

  const { data: connRow } = await supabase
    .from("whoop_connections")
    .select(
      "last_recovery_score, last_resting_hr, last_hrv_ms, last_sleep_performance, last_sleep_efficiency, last_strain, last_avg_hr, last_synced_at"
    )
    .eq("user_id", user!.id)
    .maybeSingle();
  const conn = connRow as WhoopConnectionRow | null;

  if (!conn) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Whoop</h1>
        <p className="mt-2 max-w-prose leading-relaxed text-muted">
          Connect your Whoop account to pull in recovery, sleep, and daily strain alongside your
          meals and workouts.
        </p>
        {connectionError && (
          <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
            Connection failed: {connectionError}
          </p>
        )}
        <a
          href="/api/whoop/authorize"
          className="mt-6 inline-block rounded-lg bg-accent-2 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition duration-150 hover:opacity-90 active:scale-[0.98]"
        >
          Connect Whoop
        </a>
      </div>
    );
  }

  const fmt = (n: number | null | undefined, digits = 0) =>
    n == null ? "—" : n.toFixed(digits);

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Whoop</h1>
        <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
          Connected
        </span>
      </div>

      {connected && (
        <p className="mt-4 text-sm text-accent">Whoop connected successfully.</p>
      )}
      {synced && <p className="mt-4 text-sm text-accent">Synced with Whoop.</p>}
      {error && (
        <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          Sync failed: {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <form action={syncWhoop}>
          <WhoopSyncButton />
        </form>
        {reconnect && (
          <a
            href="/api/whoop/authorize"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-surface-2"
          >
            Reconnect Whoop
          </a>
        )}
        <p className="text-xs text-muted">
          {conn.last_synced_at
            ? `Last synced ${dateTimeLabel(conn.last_synced_at)}`
            : "Not synced yet"}
        </p>
      </div>

      {connectionError && (
        <div className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          <p>Reconnect failed: {connectionError}. Your previous connection was kept.</p>
          <a href="/api/whoop/authorize" className="mt-2 inline-block underline">
            Retry reconnect
          </a>
        </div>
      )}

      <div className="mt-6 space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            Latest recovery
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Recovery" value={fmt(conn.last_recovery_score)} unit="%" />
            <Stat label="Resting HR" value={fmt(conn.last_resting_hr)} unit="bpm" />
            <Stat label="HRV" value={fmt(conn.last_hrv_ms)} unit="ms" />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            Last sleep
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Performance" value={fmt(conn.last_sleep_performance)} unit="%" />
            <Stat label="Efficiency" value={fmt(conn.last_sleep_efficiency)} unit="%" />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted">
            Today&apos;s cycle
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Strain" value={fmt(conn.last_strain, 1)} />
            <Stat label="Avg HR" value={fmt(conn.last_avg_hr)} unit="bpm" />
          </div>
        </section>
      </div>

      <p className="mt-8 text-xs text-muted">
        Data from your Whoop account.{" "}
        <Link href="/" className="underline hover:text-foreground">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
