import { createClient, getUser } from "@/lib/supabase/server";
import { dayRange, todayStr, prettyDate } from "@/lib/day";
import WaterTracker, { type WaterLog } from "@/components/WaterTracker";
import SupplementsTracker, { type Supplement } from "@/components/SupplementsTracker";
import HabitsTracker, { type Habit } from "@/components/HabitsTracker";

interface SupplementLogRow {
  id: string;
  taken_at: string;
}

interface SupplementRow {
  id: string;
  name: string;
  dose: string | null;
  category: string;
  supplement_logs: SupplementLogRow[] | null;
}

interface HabitLogRow {
  id: string;
  done_at: string;
}

interface HabitRow {
  id: string;
  name: string;
  habit_logs: HabitLogRow[] | null;
}

export default async function IntakePage() {
  const today = todayStr();
  const { start, end } = dayRange(today);
  const supabase = await createClient();

  const user = await getUser();

  const [{ data: waterLogs }, { data: goals }, { data: supplements }, { data: habits }] =
    await Promise.all([
      supabase
        .from("water_logs")
        .select("id, amount_oz, logged_at")
        .gte("logged_at", start)
        .lte("logged_at", end)
        .order("logged_at", { ascending: false }),
      supabase.from("goals").select("water_target_oz").eq("id", user!.id).maybeSingle(),
      supabase
        .from("supplements")
        .select("id, name, dose, category, active, supplement_logs(id, taken_at)")
        .eq("active", true)
        .order("created_at", { ascending: true }),
      supabase
        .from("habits")
        .select("id, name, active, habit_logs(id, done_at)")
        .eq("active", true)
        .order("created_at", { ascending: true }),
    ]);

  // Determine which supplements were taken today.
  const supplementItems: Supplement[] = ((supplements ?? []) as SupplementRow[]).map((s) => {
    const todayLog = (s.supplement_logs ?? []).find(
      (log) => log.taken_at >= start && log.taken_at <= end
    );
    return {
      id: s.id,
      name: s.name,
      dose: s.dose,
      category: s.category,
      takenToday: !!todayLog,
      logId: todayLog?.id ?? null,
    };
  });

  const habitItems: Habit[] = ((habits ?? []) as HabitRow[]).map((h) => {
    const todayLog = (h.habit_logs ?? []).find(
      (log) => log.done_at >= start && log.done_at <= end
    );
    return {
      id: h.id,
      name: h.name,
      doneToday: !!todayLog,
      logId: todayLog?.id ?? null,
    };
  });

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:px-6">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-sky-400">Check-in</p>
        <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight text-foreground">
          Daily
        </h1>
        <p className="mt-2 text-muted">{prettyDate(today)}</p>
      </header>

      <div className="space-y-6">
        <WaterTracker
          initialLogs={(waterLogs as WaterLog[]) ?? []}
          targetOz={goals?.water_target_oz ?? null}
        />
        <HabitsTracker initial={habitItems} />
        <SupplementsTracker initial={supplementItems} />
      </div>
    </div>
  );
}
