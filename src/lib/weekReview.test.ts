import { describe, it, expect } from "vitest";
import {
  calorieStatus,
  atLeastStatus,
  trainedStatus,
  hitRate,
  averageOf,
  hoursMin,
  CALORIE_TOLERANCE,
} from "./weekReview";

// Expectations worked out by hand, not recorded from a run — same convention as
// day.test.ts and strength.test.ts.

describe("calorieStatus", () => {
  it("hits when exactly on target", () => {
    expect(calorieStatus(2600, 2600)).toBe("hit");
  });

  it("hits at the edge of the tolerance band on both sides", () => {
    // 10% of 2600 = 260, so the band is 2340..2860 inclusive.
    expect(calorieStatus(2340, 2600)).toBe("hit");
    expect(calorieStatus(2860, 2600)).toBe("hit");
  });

  it("misses just outside the band on both sides", () => {
    expect(calorieStatus(2339, 2600)).toBe("miss");
    expect(calorieStatus(2861, 2600)).toBe("miss");
  });

  it("treats a big undershoot as a miss, not a win", () => {
    // The whole reason calories are a band and not a ceiling.
    expect(calorieStatus(900, 2600)).toBe("miss");
  });

  it("is unknown rather than failed when nothing was logged", () => {
    expect(calorieStatus(0, 2600)).toBe("none");
  });

  it("is unknown when no target is set", () => {
    expect(calorieStatus(2600, null)).toBe("none");
    expect(calorieStatus(2600, 0)).toBe("none");
  });

  it("uses the documented tolerance constant", () => {
    expect(CALORIE_TOLERANCE).toBe(0.1);
  });
});

describe("atLeastStatus", () => {
  it("hits at the target and above", () => {
    expect(atLeastStatus(180, 180)).toBe("hit");
    expect(atLeastStatus(220, 180)).toBe("hit");
  });

  it("misses below the target", () => {
    expect(atLeastStatus(179, 180)).toBe("miss");
  });

  it("does not penalize overshooting, unlike calories", () => {
    expect(atLeastStatus(400, 180)).toBe("hit");
  });

  it("is unknown with nothing logged or no target", () => {
    expect(atLeastStatus(0, 180)).toBe("none");
    expect(atLeastStatus(180, null)).toBe("none");
  });
});

describe("trainedStatus", () => {
  it("hits on any workout", () => {
    expect(trainedStatus(1, true)).toBe("hit");
    expect(trainedStatus(2, true)).toBe("hit");
  });

  it("misses on a tracked rest day", () => {
    // Something was logged that day, so we know he didn't train.
    expect(trainedStatus(0, true)).toBe("miss");
  });

  it("is unknown on a day with nothing logged at all", () => {
    // Forgetting to open the app is not the same as skipping the gym.
    expect(trainedStatus(0, false)).toBe("none");
  });

  it("still counts a workout on a day with nothing else logged", () => {
    expect(trainedStatus(1, false)).toBe("hit");
  });
});

describe("hitRate", () => {
  it("is the share of known days that were hit", () => {
    expect(hitRate(["hit", "hit", "miss", "miss"])).toBe(0.5);
  });

  it("ignores unknown days instead of counting them as failures", () => {
    // 3 hits, 0 misses, 4 unknown -> 100%, not 3/7.
    expect(hitRate(["hit", "hit", "hit", "none", "none", "none", "none"])).toBe(1);
  });

  it("returns null when nothing is known", () => {
    expect(hitRate(["none", "none"])).toBeNull();
    expect(hitRate([])).toBeNull();
  });

  it("is 0 for a fully missed week", () => {
    expect(hitRate(["miss", "miss"])).toBe(0);
  });
});

describe("averageOf", () => {
  it("averages the values that exist", () => {
    expect(averageOf([2, 4, 6])).toBe(4);
  });

  it("skips nulls rather than treating them as zero", () => {
    // Averaging [8, null, 4] as [8, 0, 4] would give 4; the right answer is 6.
    expect(averageOf([8, null, 4])).toBe(6);
  });

  it("returns null when there is nothing to average", () => {
    expect(averageOf([null, null])).toBeNull();
    expect(averageOf([])).toBeNull();
  });
});

describe("hoursMin", () => {
  it("splits milliseconds into hours and minutes", () => {
    // 7h33m = (7*60 + 33) * 60_000 = 453 * 60_000 = 27_180_000
    expect(hoursMin(27_180_000)).toBe("7h 33m");
  });

  it("shows a bare zero-minute hour", () => {
    expect(hoursMin(8 * 3_600_000)).toBe("8h 0m");
  });

  it("rounds to the nearest minute", () => {
    // 29 seconds rounds down, so this stays 1h 0m.
    expect(hoursMin(3_600_000 + 29_000)).toBe("1h 0m");
  });

  it("renders an em dash for missing data", () => {
    expect(hoursMin(null)).toBe("—");
  });
});
