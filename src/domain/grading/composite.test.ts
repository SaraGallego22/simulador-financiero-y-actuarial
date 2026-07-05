import { describe, expect, it } from "vitest";
import { notaDia, notaObjetivaDia, notaSubjetiva, notaSubjetivaEquipo, notaTarifacionAnio } from "./composite";

describe("notaTarifacionAnio", () => {
  const results = [
    { teamId: 1, totalPremium: 100, claimsAmount: 40 }, // RT = 60
    { teamId: 2, totalPremium: 100, claimsAmount: 70 }, // RT = 30
    { teamId: 3, totalPremium: 100, claimsAmount: 10 }, // RT = 90 (best)
    { teamId: 4, totalPremium: 100, claimsAmount: 200 }, // RT = -100 (catastrophic)
  ];

  it("ranking mode gives the best result 100 and the worst 0", () => {
    const map = notaTarifacionAnio(results, "ranking");
    expect(map.get(3)).toBe(100);
    expect(map.get(4)).toBe(0);
  });

  it("relative mode clamps to [0, 100] and isn't fully collapsed by one catastrophic outlier", () => {
    const map = notaTarifacionAnio(results, "relative");
    for (const v of map.values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    // Team 3 (best RT) should still clearly outscore team 2 (worse RT),
    // i.e. the percentile clamp doesn't flatten the ordering.
    expect(map.get(3)!).toBeGreaterThan(map.get(2)!);
  });
});

describe("notaObjetivaDia", () => {
  it("weights actuarial vs financial by actuarialWeight", () => {
    expect(notaObjetivaDia(80, 40, 0.5)).toBeCloseTo(60, 6);
    expect(notaObjetivaDia(80, 40, 1)).toBeCloseTo(80, 6);
    expect(notaObjetivaDia(80, 40, 0)).toBeCloseTo(40, 6);
  });

  it("falls back to whichever profile is available", () => {
    expect(notaObjetivaDia(80, null, 0.5)).toBe(80);
    expect(notaObjetivaDia(null, 40, 0.5)).toBe(40);
    expect(notaObjetivaDia(null, null, 0.5)).toBeNull();
  });
});

describe("notaSubjetiva / notaSubjetivaEquipo", () => {
  const skills = [
    { id: "s1", weight: 1 },
    { id: "s2", weight: 1 },
  ];

  it("scores a full rubric as a weighted percentage of maxScale", () => {
    const r = notaSubjetiva({ s1: 5, s2: 5 }, skills, 5);
    expect(r.value).toBeCloseTo(100, 6);
    expect(r.complete).toBe(true);
  });

  it("returns null when nothing has been graded yet", () => {
    const r = notaSubjetiva({}, skills, 5);
    expect(r.value).toBeNull();
    expect(r.complete).toBe(false);
    expect(r.missing).toBe(2);
  });

  it("averages per-member scores when a roster is present", () => {
    const members = [{ s1: 5, s2: 5 }, { s1: 0, s2: 0 }];
    const r = notaSubjetivaEquipo(members, {}, skills, 5);
    expect(r.value).toBeCloseTo(50, 6);
    expect(r.complete).toBe(true);
  });

  it("falls back to the team-consensus score with no roster", () => {
    const r = notaSubjetivaEquipo(null, { s1: 4, s2: 4 }, skills, 5);
    expect(r.value).toBeCloseTo(80, 6);
  });
});

describe("notaDia", () => {
  it("blends objective and subjective by subjectiveWeight", () => {
    expect(notaDia(80, 60, 0.3)).toBeCloseTo(0.7 * 80 + 0.3 * 60, 6);
  });

  it("falls back when one side is missing", () => {
    expect(notaDia(80, null, 0.3)).toBe(80);
    expect(notaDia(null, 60, 0.3)).toBe(60);
  });
});
