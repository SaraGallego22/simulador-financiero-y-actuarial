import { describe, expect, it } from "vitest";
import {
  notaDia,
  notaObjetivaDia,
  notaSubjetiva,
  notaSubjetivaEquipo,
  notaTarifacionAnio,
  notaTarifacionAbsoluta,
  computeRt,
  GOOD_PERFORMANCE_MARGIN_PCT,
} from "./composite";
import { GASTOS_TOTAL_PCT } from "../finance/constants";

describe("notaTarifacionAnio", () => {
  // RT = totalPremium*(1-GASTOS_TOTAL_PCT) - claimsAmount; all four rows
  // share the same totalPremium, so the 20 subtracted from every RT for
  // gastos is a uniform shift that doesn't change the ordering below.
  const results = [
    { teamId: 1, totalPremium: 100, claimsAmount: 40 }, // RT = 40
    { teamId: 2, totalPremium: 100, claimsAmount: 70 }, // RT = 10
    { teamId: 3, totalPremium: 100, claimsAmount: 10 }, // RT = 70 (best)
    { teamId: 4, totalPremium: 100, claimsAmount: 200 }, // RT = -120 (catastrophic)
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

describe("computeRt", () => {
  it("matches finBench's own rt shape: premium*(1-gastos) - claims", () => {
    expect(computeRt({ totalPremium: 100, claimsAmount: 40 })).toBeCloseTo(100 * (1 - GASTOS_TOTAL_PCT) - 40, 6);
  });
});

describe("notaTarifacionAbsoluta", () => {
  // premium that makes RT come out to exactly 0 for a given claims amount:
  // premium*(1-GASTOS_TOTAL_PCT) - claims = 0
  const breakevenPremium = (claims: number) => claims / (1 - GASTOS_TOTAL_PCT);
  // premium that makes RT land exactly at the "good performance" margin:
  // premium*(1-GASTOS_TOTAL_PCT) - claims = premium*GOOD_PERFORMANCE_MARGIN_PCT
  const goodPremium = (claims: number) => claims / (1 - GASTOS_TOTAL_PCT - GOOD_PERFORMANCE_MARGIN_PCT);

  it("scores RT=0 (breakeven, after gastos) at exactly 50, regardless of book size", () => {
    const map = notaTarifacionAbsoluta([
      { teamId: 1, totalPremium: breakevenPremium(100), claimsAmount: 100 },
      { teamId: 2, totalPremium: breakevenPremium(100_000_000), claimsAmount: 100_000_000 },
    ]);
    expect(map.get(1)).toBeCloseTo(50, 6);
    expect(map.get(2)).toBeCloseTo(50, 6);
  });

  it("never scores a negative RT above 50, or a positive RT below 50", () => {
    const map = notaTarifacionAbsoluta([
      { teamId: 1, totalPremium: breakevenPremium(100) - 1, claimsAmount: 100 }, // RT < 0
      { teamId: 2, totalPremium: breakevenPremium(100) + 1, claimsAmount: 100 }, // RT > 0
      { teamId: 3, totalPremium: 10, claimsAmount: 1000 }, // catastrophic
      { teamId: 4, totalPremium: 1_000_000, claimsAmount: 100 }, // huge margin
    ]);
    expect(map.get(1)!).toBeLessThan(50);
    expect(map.get(2)!).toBeGreaterThan(50);
    expect(map.get(3)!).toBeLessThan(50);
    expect(map.get(4)!).toBeGreaterThan(50);
  });

  it("scores exactly 90 when a team's own actual claims are priced to the good-performance margin", () => {
    const claimsAmount = 273_900_000_000;
    const totalPremium = goodPremium(claimsAmount);
    const map = notaTarifacionAbsoluta([{ teamId: 1, totalPremium, claimsAmount }]);
    expect(map.get(1)!).toBeCloseTo(90, 6);
  });

  it("judges a small and a large book on the same relative bar (both at the good-performance margin score equally)", () => {
    const small = { teamId: 1, totalPremium: goodPremium(1000), claimsAmount: 1000 };
    const large = { teamId: 2, totalPremium: goodPremium(100_000_000), claimsAmount: 100_000_000 };
    const map = notaTarifacionAbsoluta([small, large]);
    expect(map.get(1)!).toBeCloseTo(map.get(2)!, 6);
  });

  it("stays within (0, 100) even for extreme results, and returns a neutral 50 for a team with no book at all", () => {
    const map = notaTarifacionAbsoluta([
      { teamId: 1, totalPremium: 0, claimsAmount: 1_000_000_000_000 },
      { teamId: 2, totalPremium: 0, claimsAmount: 0 },
      { teamId: 3, totalPremium: 500, claimsAmount: 0 },
    ]);
    expect(map.get(1)!).toBeGreaterThan(0);
    expect(map.get(1)!).toBeLessThan(50);
    expect(map.get(2)).toBe(50);
    expect(map.get(3)).toBe(100);
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
