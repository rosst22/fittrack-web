import { describe, it, expect } from "vitest";
import {
  orderSets,
  volume,
  totalReps,
  topSet,
  epley1RM,
  best1RM,
  formatSets,
  formatVolume,
  normalizeExerciseName,
  type ExerciseSet,
} from "./strength";

// Expected values below are worked out by hand, not copied from running the
// code — same convention as day.test.ts. Recording current output would just
// enshrine whatever the implementation happens to do.

function set(set_index: number, weight_lb: number | null, reps: number | null): ExerciseSet {
  return { set_index, weight_lb, reps };
}

// A realistic ascending bench session used across several tests.
const BENCH = [set(1, 135, 10), set(2, 155, 8), set(3, 175, 5)];

describe("orderSets", () => {
  it("sorts by set_index regardless of the order rows come back in", () => {
    const scrambled = [set(3, 175, 5), set(1, 135, 10), set(2, 155, 8)];
    expect(orderSets(scrambled).map((s) => s.set_index)).toEqual([1, 2, 3]);
  });

  it("does not mutate the input array", () => {
    const scrambled = [set(2, 155, 8), set(1, 135, 10)];
    orderSets(scrambled);
    expect(scrambled[0].set_index).toBe(2);
  });
});

describe("volume", () => {
  it("sums weight x reps across sets", () => {
    // 135*10 = 1350, 155*8 = 1240, 175*5 = 875 -> 3465
    expect(volume(BENCH)).toBe(3465);
  });

  it("counts a bodyweight set as zero load, not as a crash", () => {
    // Pull-ups: we don't know the loading, so they add reps but no volume.
    expect(volume([set(1, null, 12), set(2, 100, 5)])).toBe(500);
  });

  it("is zero for an empty exercise", () => {
    expect(volume([])).toBe(0);
  });
});

describe("totalReps", () => {
  it("adds reps across sets ignoring load", () => {
    expect(totalReps(BENCH)).toBe(23); // 10 + 8 + 5
  });

  it("counts bodyweight reps", () => {
    expect(totalReps([set(1, null, 12), set(2, null, 10)])).toBe(22);
  });
});

describe("topSet", () => {
  it("picks the heaviest set", () => {
    expect(topSet(BENCH)).toEqual(set(3, 175, 5));
  });

  it("breaks a weight tie toward more reps", () => {
    // Same load, so the set with more reps is the better performance.
    const sets = [set(1, 175, 4), set(2, 175, 6), set(3, 175, 3)];
    expect(topSet(sets)?.set_index).toBe(2);
  });

  it("returns null when every set is bodyweight", () => {
    expect(topSet([set(1, null, 12)])).toBeNull();
  });
});

describe("epley1RM", () => {
  it("applies w * (1 + reps/30) for multi-rep sets", () => {
    // 135 * (1 + 10/30) = 135 * 4/3 = 180 exactly.
    expect(epley1RM(135, 10)).toBeCloseTo(180, 6);
  });

  it("returns the weight itself for a single", () => {
    // Raw Epley would say 232.5; a single you actually lifted is the max.
    expect(epley1RM(225, 1)).toBe(225);
  });

  it("estimates a heavy triple above its working weight", () => {
    // 225 * (1 + 3/30) = 225 * 1.1 = 247.5
    expect(epley1RM(225, 3)).toBeCloseTo(247.5, 6);
  });

  it("returns 0 for bodyweight or missing input rather than NaN", () => {
    expect(epley1RM(null, 10)).toBe(0);
    expect(epley1RM(135, null)).toBe(0);
    expect(epley1RM(0, 5)).toBe(0);
  });
});

describe("best1RM", () => {
  it("takes the best estimate across sets, which need not be the heaviest set", () => {
    // 135x10 -> 180.0 ; 155x8 -> 155*(1+8/30) = 155*1.26667 = 196.33 ;
    // 175x5  -> 175*(1+5/30) = 175*7/6 = 204.166...  -> the top set wins here.
    expect(best1RM(BENCH)).toBeCloseTo(204.1667, 3);
  });

  it("lets a high-rep set beat a heavier low-rep one when the math says so", () => {
    // 200x2 -> 200*(1+2/30) = 213.33 ; 185x6 -> 185*1.2 = 222.0 -> the lighter
    // set is the better performance, which is the whole point of estimating.
    expect(best1RM([set(1, 200, 2), set(2, 185, 6)])).toBeCloseTo(222, 6);
  });
});

describe("formatSets", () => {
  it("lists ascending sets in order", () => {
    expect(formatSets(BENCH)).toBe("135×10, 155×8, 175×5");
  });

  it("collapses a straight-weight scheme", () => {
    const straight = [set(1, 135, 8), set(2, 135, 8), set(3, 135, 8)];
    expect(formatSets(straight)).toBe("135×8 (3 sets)");
  });

  it("only collapses consecutive identical sets", () => {
    // Coming back down to 135 after a heavy set is a separate entry.
    const wave = [set(1, 135, 8), set(2, 155, 5), set(3, 135, 8)];
    expect(formatSets(wave)).toBe("135×8, 155×5, 135×8");
  });

  it("marks bodyweight sets BW", () => {
    expect(formatSets([set(1, null, 12), set(2, null, 10)])).toBe("BW×12, BW×10");
  });

  it("keeps a fractional plate loading readable", () => {
    expect(formatSets([set(1, 137.5, 5)])).toBe("137.5×5");
  });

  it("sorts before formatting", () => {
    expect(formatSets([set(2, 155, 8), set(1, 135, 10)])).toBe("135×10, 155×8");
  });

  it("returns an empty string when there is nothing to show", () => {
    expect(formatSets([])).toBe("");
    expect(formatSets([set(1, null, null)])).toBe("");
  });
});

describe("formatVolume", () => {
  it("adds thousands separators and drops the decimal", () => {
    expect(formatVolume(3465)).toBe("3,465 lb");
    expect(formatVolume(12500.4)).toBe("12,500 lb");
  });
});

describe("normalizeExerciseName", () => {
  it("folds case and collapses whitespace so history matches", () => {
    expect(normalizeExerciseName("  Bench   Press ")).toBe("bench press");
    expect(normalizeExerciseName("bench press")).toBe("bench press");
  });
});
