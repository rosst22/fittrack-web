import { describe, it, expect } from "vitest";
import {
  dayKey,
  dayRange,
  shiftDate,
  prettyDate,
  timeLabel,
  dateTimeLabel,
  weekdayIndex,
  weekStart,
  weekDates,
} from "./day";

// Day bucketing has broken twice in production, both times because a timestamp
// got formatted in the server's timezone (Vercel runs UTC) instead of Toronto.
// These tests pin the Toronto behavior. They are written to be correct no matter
// what timezone the test process itself runs in.

describe("dayKey", () => {
  it("files a late-evening Toronto meal under that same Toronto day", () => {
    // 9pm Toronto on Jul 19 is already 1am UTC on Jul 20. Bucketing by UTC
    // would file this meal under the 20th — this is the original bug.
    expect(dayKey("2026-07-20T01:00:00Z")).toBe("2026-07-19");
  });

  it("treats Toronto midnight as the start of the new day", () => {
    // July = EDT = UTC-4, so 04:00Z is exactly 00:00 Toronto.
    expect(dayKey("2026-07-20T04:00:00Z")).toBe("2026-07-20");
  });

  it("uses the winter offset in winter", () => {
    // January = EST = UTC-5, so 04:30Z is still 23:30 on the previous day.
    // A fixed -4 offset would get this wrong.
    expect(dayKey("2026-01-15T04:30:00Z")).toBe("2026-01-14");
  });
});

describe("dayRange", () => {
  it("spans a full Toronto day expressed as UTC bounds", () => {
    // Postgres stores timestamptz in UTC, so a query for "Jul 20 in Toronto"
    // has to ask for 04:00Z that day through 03:59:59.999Z the next.
    const { start, end } = dayRange("2026-07-20");
    expect(start).toBe("2026-07-20T04:00:00.000Z");
    expect(end).toBe("2026-07-21T03:59:59.999Z");
  });

  it("shifts by an hour in winter", () => {
    const { start } = dayRange("2026-01-15");
    expect(start).toBe("2026-01-15T05:00:00.000Z");
  });

  it("produces a range that contains its own boundary timestamps", () => {
    // A property rather than a fixed value: whatever the offsets, every
    // instant in the range must bucket back to the day we asked for.
    const { start, end } = dayRange("2026-07-20");
    expect(dayKey(start)).toBe("2026-07-20");
    expect(dayKey(end)).toBe("2026-07-20");
  });
});

describe("shiftDate", () => {
  it("moves forward and backward by whole days", () => {
    expect(shiftDate("2026-07-20", 1)).toBe("2026-07-21");
    expect(shiftDate("2026-07-20", -1)).toBe("2026-07-19");
  });

  it("crosses month and year boundaries", () => {
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDate("2026-02-28", 1)).toBe("2026-03-01"); // 2026 is not a leap year
  });

  it("is unaffected by the DST changeover", () => {
    // Clocks jump on Mar 8 2026. Date arithmetic done in UTC must not lose or
    // gain a day here — a naive local-time implementation can.
    expect(shiftDate("2026-03-07", 1)).toBe("2026-03-08");
    expect(shiftDate("2026-03-08", 1)).toBe("2026-03-09");
  });
});

describe("prettyDate", () => {
  it("labels the date string it was given, not a shifted one", () => {
    expect(prettyDate("2026-07-20")).toBe("Mon, Jul 20");
  });
});

describe("timeLabel", () => {
  it("shows Toronto wall-clock time, not UTC", () => {
    // 01:00Z is 9:00 PM the previous evening in Toronto.
    expect(timeLabel("2026-07-20T01:00:00Z")).toBe("9:00 PM");
  });
});

describe("dateTimeLabel", () => {
  it("shows the Toronto date and time for an instant past UTC midnight", () => {
    // Regression test for the shipped bug: this exact timestamp rendered as
    // "7/21/2026, 4:11:52 AM" in production because toLocaleString() was
    // called without a timeZone, so Vercel formatted it in UTC.
    expect(dateTimeLabel("2026-07-21T04:11:52Z")).toBe("Jul 21, 12:11 AM");
  });

  it("keeps the date on the earlier day when Toronto is still the day before", () => {
    expect(dateTimeLabel("2026-07-20T03:30:00Z")).toBe("Jul 19, 11:30 PM");
  });
});

// Weekday anchors below are derived, not observed: Jan 1 2026 is a Thursday, and
// Aug 17 2026 is the 229th day of the year (31+28+31+30+31+30+31 = 212, +17), so
// it lands on Thursday + (228 mod 7 = 4) = Monday.
describe("weekdayIndex", () => {
  it("reports Monday as 1", () => {
    expect(weekdayIndex("2026-08-17")).toBe(1);
  });

  it("reports Sunday as 0", () => {
    expect(weekdayIndex("2026-08-16")).toBe(0);
  });

  it("reports Saturday as 6", () => {
    expect(weekdayIndex("2026-08-15")).toBe(6);
  });
});

describe("weekStart", () => {
  it("returns the date itself when it is already Monday", () => {
    expect(weekStart("2026-08-17")).toBe("2026-08-17");
  });

  it("puts Sunday at the END of its week, not the start", () => {
    // The classic off-by-one: getUTCDay() gives Sunday 0, so naive
    // shiftDate(-(dow - 1)) would move Sunday FORWARD a day into the next week.
    expect(weekStart("2026-08-16")).toBe("2026-08-10");
  });

  it("walks a mid-week day back to Monday", () => {
    expect(weekStart("2026-08-15")).toBe("2026-08-10"); // Saturday -> back 5
  });

  it("crosses a month boundary", () => {
    // Sep 1 2026 is day 244, so Thursday + (243 mod 7 = 5) = Tuesday.
    expect(weekStart("2026-09-01")).toBe("2026-08-31");
  });

  it("crosses a year boundary", () => {
    // 2026 is not a leap year, so Jan 1 2027 is Thursday + 1 = Friday.
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
  });
});

describe("weekDates", () => {
  it("returns seven consecutive dates starting Monday", () => {
    expect(weekDates("2026-08-16")).toEqual([
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
    ]);
  });

  it("gives the same week for every day in it", () => {
    expect(weekDates("2026-08-10")).toEqual(weekDates("2026-08-16"));
  });
});
