// All day-bucketing and time display happen in the user's home timezone, not
// the server's. FitTrack renders server-side on UTC (Vercel), so without this a
// meal logged at 9pm Toronto (= 1am UTC the next day) gets filed under — and
// displayed as — the wrong calendar day. Ross is in Eastern time (Toronto /
// Boston); change APP_TZ if that ever stops being true.
export const APP_TZ = "America/Toronto";

// Wall-clock components of an instant as seen in `tz`.
function partsInTz(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  return map as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

// Offset in ms between `tz` wall time and UTC at a given instant
// (Toronto in July = -4h → -14_400_000). Day boundaries never land on a DST
// switch (Toronto flips at 2am), so a single pass is exact here.
function tzOffsetMs(date: Date, tz: string) {
  const p = partsInTz(date, tz);
  // partsInTz has second resolution, so the milliseconds must be carried over
  // explicitly — otherwise they are treated as 0 on one side of the
  // subtraction and leak into the offset (a .999 instant produced an offset of
  // -14400999 instead of -14400000, pushing dayRange's end past midnight).
  // Every real UTC offset is a whole number of minutes, so the millisecond
  // component is identical in any timezone and cancels cleanly.
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
    date.getUTCMilliseconds()
  );
  return asUtc - date.getTime();
}

// The UTC instant of a wall-clock time in APP_TZ.
function zonedToUtc(dateStr: string, timeStr: string) {
  const guess = new Date(`${dateStr}T${timeStr}Z`); // read the components as UTC first
  const offset = tzOffsetMs(guess, APP_TZ);
  return new Date(guess.getTime() - offset);
}

const pad = (n: number) => String(n).padStart(2, "0");

// Today's calendar date in APP_TZ, as "YYYY-MM-DD".
export function todayStr() {
  const p = partsInTz(new Date(), APP_TZ);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// The APP_TZ calendar date a timestamp falls on, as "YYYY-MM-DD". Use this to
// bucket rows by day instead of new Date(iso).toLocaleDateString("en-CA"),
// which buckets by the server's timezone.
export function dayKey(iso: string) {
  const p = partsInTz(new Date(iso), APP_TZ);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// UTC ISO bounds of a full APP_TZ calendar day — for querying timestamptz columns.
export function dayRange(dateStr: string) {
  const start = zonedToUtc(dateStr, "00:00:00.000");
  const end = zonedToUtc(dateStr, "23:59:59.999");
  return { start: start.toISOString(), end: end.toISOString() };
}

// Calendar arithmetic on a "YYYY-MM-DD" string, done in UTC so it never depends
// on the server's timezone.
export function shiftDate(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Weekday index of a "YYYY-MM-DD" string, 0 = Sunday. Read at noon UTC and
// formatted in UTC so the answer depends only on the string, never on the
// server's timezone or on DST.
export function weekdayIndex(dateStr: string) {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

// The Monday of the week containing dateStr, as "YYYY-MM-DD". Weeks run
// Monday–Sunday: a training week that splits the weekend across two rows makes
// "workouts this week" useless.
export function weekStart(dateStr: string) {
  const dow = weekdayIndex(dateStr);
  // Sunday (0) belongs to the week that began six days earlier, not the one
  // starting tomorrow — this is the off-by-one that Sunday always causes.
  const backToMonday = dow === 0 ? 6 : dow - 1;
  return shiftDate(dateStr, -backToMonday);
}

// The seven "YYYY-MM-DD" dates of the week containing dateStr, Monday first.
export function weekDates(dateStr: string) {
  const start = weekStart(dateStr);
  return Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
}

// Human label for a "YYYY-MM-DD" string. Formatted in UTC so the weekday/day
// always match the string itself rather than the server's timezone.
export function prettyDate(dateStr: string) {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// Time-of-day label for a timestamp, always in APP_TZ (e.g. "9:05 PM").
export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TZ,
  });
}

// Date + time label for a timestamp, always in APP_TZ (e.g. "Jul 21, 12:11 AM").
// Server components render on Vercel in UTC, so this must pin the zone or the
// timestamp reads hours off for the user.
export function dateTimeLabel(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TZ,
  });
}
