import { describe, expect, it } from "vitest";
import {
  notaDia,
  notaObjetivaDia,
  notaSubjetivaEquipo,
  notaTarifacionAbsoluta,
  computeRt,
  perfilPredominante,
  GOOD_PERFORMANCE_MARGIN_PCT,
  GOOD_PERFORMANCE_SCORE,
} from "./composite";
import { RT_EXPENSE_PCT, FZ } from "../finance/constants";
import { OUTSOURCED_CONSULTING_FEE_PCT } from "../pricing/outsourced";

describe("computeRt", () => {
  it("matches finBench's own pyg() shape: primaDevengada - gastos*primaEmitida - claims (Año 1, rpndLiberada omitted -> 0)", () => {
    const primaDevengada = 100 * (1 - FZ.rpndPct);
    expect(computeRt({ totalPremium: 100, claimsAmount: 40 })).toBeCloseTo(primaDevengada - 100 * RT_EXPENSE_PCT - 40, 6);
  });

  it("releases the prior year's RPND holdback as revenue when rpndLiberada is given (Año 2)", () => {
    const rpndLiberada = 20; // e.g. 20% of a prior-year totalPremium of 100
    const withoutLiberada = computeRt({ totalPremium: 100, claimsAmount: 40 });
    const withLiberada = computeRt({ totalPremium: 100, claimsAmount: 40, rpndLiberada });
    expect(withLiberada).toBeCloseTo(withoutLiberada + rpndLiberada, 6);
  });
});

describe("notaTarifacionAbsoluta", () => {
  // premium that makes RT come out to exactly 0 for a given claims amount
  // (Año 1, rpndLiberada = 0): premium*(1-FZ.rpndPct-RT_EXPENSE_PCT) - claims = 0
  const breakevenPremium = (claims: number) => claims / (1 - FZ.rpndPct - RT_EXPENSE_PCT);
  // premium that makes RT land exactly at the "good performance" margin (as a
  // fraction of that same premium — Prima Emitida, see GOOD_PERFORMANCE_MARGIN_PCT):
  // premium*(1-FZ.rpndPct-RT_EXPENSE_PCT) - claims = premium*GOOD_PERFORMANCE_MARGIN_PCT
  const goodPremium = (claims: number) => claims / (1 - FZ.rpndPct - RT_EXPENSE_PCT - GOOD_PERFORMANCE_MARGIN_PCT);

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

  it("scores exactly GOOD_PERFORMANCE_SCORE when a team's own actual claims are priced to the good-performance margin", () => {
    const claimsAmount = 273_900_000_000;
    const totalPremium = goodPremium(claimsAmount);
    const map = notaTarifacionAbsoluta([{ teamId: 1, totalPremium, claimsAmount }]);
    expect(map.get(1)!).toBeCloseTo(GOOD_PERFORMANCE_SCORE, 6);
  });

  it("judges a small and a large book on the same relative bar (both at the good-performance margin score equally)", () => {
    const small = { teamId: 1, totalPremium: goodPremium(1000), claimsAmount: 1000 };
    const large = { teamId: 2, totalPremium: goodPremium(100_000_000), claimsAmount: 100_000_000 };
    const map = notaTarifacionAbsoluta([small, large]);
    expect(map.get(1)!).toBeCloseTo(map.get(2)!, 6);
  });

  it("doesn't collapse ordinary (not catastrophic) underperformance toward 0", () => {
    // Loss ratio 0.95 — a bit worse than breakeven-after-gastos (0.80), but a
    // perfectly ordinary result, not a disaster. Should land comfortably
    // below 50 but nowhere near the bottom of the scale.
    const claimsAmount = 1_000_000;
    const totalPremium = claimsAmount / 0.95;
    const map = notaTarifacionAbsoluta([{ teamId: 1, totalPremium, claimsAmount }]);
    expect(map.get(1)!).toBeLessThan(50);
    expect(map.get(1)!).toBeGreaterThan(25);
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

  // Both days score with this one function now (Año 2 used to have a
  // cohort-relative scorer of its own), so its two anchor properties have to
  // survive Año 2's RPND release and a team's consulting fee.
  describe("anchors hold for any rpndLiberada / consulting fee", () => {
    const cases = [
      { name: "Año 1, own tariff", rpndLiberada: 0, acquisitionFeePct: 0 },
      { name: "Año 1, outsourced", rpndLiberada: 0, acquisitionFeePct: OUTSOURCED_CONSULTING_FEE_PCT },
      { name: "Año 2, own tariff", rpndLiberada: 37_000, acquisitionFeePct: 0 },
      { name: "Año 2, outsourced", rpndLiberada: 37_000, acquisitionFeePct: OUTSOURCED_CONSULTING_FEE_PCT },
    ];

    for (const { name, rpndLiberada, acquisitionFeePct } of cases) {
      it(`${name}: RT=0 scores exactly 50 and the good-performance margin scores exactly ${GOOD_PERFORMANCE_SCORE}`, () => {
        const totalPremium = 200_000;
        const availableFrac = 1 - FZ.rpndPct - RT_EXPENSE_PCT + rpndLiberada / totalPremium;

        // Claims that leave RT exactly 0, then exactly at the good margin.
        const breakevenClaims = totalPremium * (availableFrac - acquisitionFeePct);
        const goodClaims = totalPremium * (availableFrac - acquisitionFeePct - GOOD_PERFORMANCE_MARGIN_PCT);

        const map = notaTarifacionAbsoluta([
          { teamId: 1, totalPremium, claimsAmount: breakevenClaims, rpndLiberada, acquisitionFeePct },
          { teamId: 2, totalPremium, claimsAmount: goodClaims, rpndLiberada, acquisitionFeePct },
        ]);
        // Cross-check the claims levels really are RT=0 / RT=margin.
        expect(computeRt({ totalPremium, claimsAmount: breakevenClaims, rpndLiberada, acquisitionFeePct })).toBeCloseTo(0, 6);
        expect(computeRt({ totalPremium, claimsAmount: goodClaims, rpndLiberada, acquisitionFeePct })).toBeCloseTo(
          totalPremium * GOOD_PERFORMANCE_MARGIN_PCT,
          6
        );
        expect(map.get(1)!).toBeCloseTo(50, 6);
        expect(map.get(2)!).toBeCloseTo(GOOD_PERFORMANCE_SCORE, 6);
      });
    }

    it("the consulting fee costs a team score at an otherwise identical loss ratio", () => {
      const row = { totalPremium: 200_000, claimsAmount: 120_000 };
      const map = notaTarifacionAbsoluta([
        { teamId: 1, ...row, acquisitionFeePct: 0 },
        { teamId: 2, ...row, acquisitionFeePct: OUTSOURCED_CONSULTING_FEE_PCT },
      ]);
      expect(map.get(2)!).toBeLessThan(map.get(1)!);
    });

    it("stays book-size independent even with a fee (it's proportional to premium)", () => {
      const map = notaTarifacionAbsoluta([
        { teamId: 1, totalPremium: 1_000, claimsAmount: 600, acquisitionFeePct: OUTSOURCED_CONSULTING_FEE_PCT },
        { teamId: 2, totalPremium: 1_000_000_000, claimsAmount: 600_000_000, acquisitionFeePct: OUTSOURCED_CONSULTING_FEE_PCT },
      ]);
      expect(map.get(1)!).toBeCloseTo(map.get(2)!, 6);
    });
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

describe("notaSubjetivaEquipo", () => {
  it("averages members' Nota general (1-5) into a 0-100 team score", () => {
    const r = notaSubjetivaEquipo([5, 0]);
    expect(r.value).toBeCloseTo(50, 6);
    expect(r.complete).toBe(true);
  });

  it("scores a perfect 5 as exactly 100", () => {
    const r = notaSubjetivaEquipo([5, 5]);
    expect(r.value).toBeCloseTo(100, 6);
  });

  it("returns null when no member has been graded yet", () => {
    const r = notaSubjetivaEquipo([null, undefined]);
    expect(r.value).toBeNull();
    expect(r.complete).toBe(false);
    expect(r.missing).toBe(2);
  });

  it("ignores ungraded members but reports them as missing", () => {
    const r = notaSubjetivaEquipo([4, null]);
    expect(r.value).toBeCloseTo(80, 6);
    expect(r.complete).toBe(false);
    expect(r.missing).toBe(1);
  });

  it("reports no subjective grade at all (Día 1) as null, not pending", () => {
    const r = notaSubjetivaEquipo([]);
    expect(r.value).toBeNull();
    expect(r.missing).toBe(0);
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

describe("perfilPredominante", () => {
  it("picks the profile assigned on the most days", () => {
    const perDay = [
      { day: 2, perfil: "FINANCIERO" as const },
      { day: 3, perfil: "ACTUARIAL" as const },
      { day: 4, perfil: "FINANCIERO" as const },
    ];
    expect(perfilPredominante(perDay)).toBe("FINANCIERO");
  });

  it("breaks a tie by the most recent day", () => {
    const perDay = [
      { day: 2, perfil: "FINANCIERO" as const },
      { day: 3, perfil: "ACTUARIAL" as const },
      { day: 4, perfil: "GENERALISTA" as const },
    ];
    expect(perfilPredominante(perDay)).toBe("GENERALISTA");
  });

  it("skips days with no perfil recorded when tie-breaking by recency", () => {
    const perDay = [
      { day: 2, perfil: "FINANCIERO" as const },
      { day: 3, perfil: null },
      { day: 4, perfil: "ACTUARIAL" as const },
    ];
    expect(perfilPredominante(perDay)).toBe("ACTUARIAL");
  });

  it("returns null when no day has a perfil yet", () => {
    const perDay = [
      { day: 2, perfil: null },
      { day: 3, perfil: null },
    ];
    expect(perfilPredominante(perDay)).toBeNull();
  });
});
