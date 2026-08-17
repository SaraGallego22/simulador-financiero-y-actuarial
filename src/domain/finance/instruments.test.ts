import { describe, expect, it } from "vitest";
import {
  isPortfolioDecisionV4,
  instrumentDurationM,
  isCouponBond,
  displayYieldLabel,
  MAX_SCHEDULE_ENTRIES,
  INSTRUMENTS,
  INSTRUMENT_BY_ID,
} from "./instruments";
import type { Allocation, MonthlyAllocationEntry } from "./instruments";
import { ACC_ROLL_M, VOL_PENALTY_LAMBDA } from "./constants";

function fullAllocation(overrides: Allocation): Allocation {
  const alloc: Allocation = {};
  for (const ins of INSTRUMENTS) alloc[ins.id] = overrides[ins.id] ?? 0;
  return alloc;
}

describe("instrument risk/return calibration", () => {
  it("every instrument has a positive volatility", () => {
    for (const ins of INSTRUMENTS) expect(ins.volAnual).toBeGreaterThan(0);
  });

  it("TESUVR8 has the single best risk-adjusted yield of the whole menu, and LIQ the worst", () => {
    // LIQ, not ACC, is the worst since LIQ's nominal yield was lowered to
    // 5% (see instruments.ts) — pure safety has a real opportunity cost,
    // which is the point of a *risk-adjusted* yield metric. ACC's high
    // nominal yield (14%) still doesn't fully compensate its volatility,
    // but it's no longer the single worst choice on this basis.
    const riskAdjusted = (id: string) => {
      const ins = INSTRUMENTS.find((i) => i.id === id)!;
      return ins.yield - VOL_PENALTY_LAMBDA * ins.volAnual;
    };
    const uvr8 = riskAdjusted("TESUVR8");
    const liq = riskAdjusted("LIQ");
    for (const ins of INSTRUMENTS) {
      if (ins.id === "TESUVR8") continue;
      expect(uvr8).toBeGreaterThan(riskAdjusted(ins.id));
    }
    for (const ins of INSTRUMENTS) {
      if (ins.id === "LIQ") continue;
      expect(liq).toBeLessThan(riskAdjusted(ins.id));
    }
  });
});

describe("instrumentDurationM", () => {
  it("uses the instrument's own plazoM for bond-like instruments", () => {
    expect(instrumentDurationM(INSTRUMENT_BY_ID.CDT90)).toBe(INSTRUMENT_BY_ID.CDT90.plazoM);
    expect(instrumentDurationM(INSTRUMENT_BY_ID.TES1)).toBe(INSTRUMENT_BY_ID.TES1.plazoM);
    expect(instrumentDurationM(INSTRUMENT_BY_ID.TES3)).toBe(INSTRUMENT_BY_ID.TES3.plazoM);
    expect(instrumentDurationM(INSTRUMENT_BY_ID.TESUVR8)).toBe(INSTRUMENT_BY_ID.TESUVR8.plazoM);
  });

  it("rolls LIQ every month", () => {
    expect(instrumentDurationM(INSTRUMENT_BY_ID.LIQ)).toBe(1);
  });

  it("rolls ACC every ACC_ROLL_M months", () => {
    expect(instrumentDurationM(INSTRUMENT_BY_ID.ACC)).toBe(ACC_ROLL_M);
  });
});

describe("isCouponBond", () => {
  it("is true only for TES3 and TESUVR8", () => {
    for (const ins of INSTRUMENTS) {
      expect(isCouponBond(ins)).toBe(ins.id === "TES3" || ins.id === "TESUVR8");
    }
  });

  it("a coupon bond discounted at its own yield prices to exactly par (VP = cupón × anualidad + VP del principal = valor invertido)", () => {
    // Same identity pvCouponCashflows()/pvPortafolio() in alm.ts rely on:
    // for an annual-coupon bond, discounting every cashflow at a flat rate
    // equal to its own coupon rate always recovers the face value exactly,
    // regardless of term — F·r·[1-(1+r)^-n]/r + F·(1+r)^-n = F. Verified
    // here directly against the bond-pricing formula, not against
    // pvCouponCashflows() itself, so this doesn't just restate that
    // function's own logic back at it.
    for (const ins of INSTRUMENTS.filter(isCouponBond)) {
      const faceValue = 1_000_000;
      const r = ins.yield;
      const n = ins.plazoM / 12;
      const coupon = faceValue * r;
      const annuityFactor = (1 - Math.pow(1 + r, -n)) / r;
      const pv = coupon * annuityFactor + faceValue * Math.pow(1 + r, -n);
      expect(pv).toBeCloseTo(faceValue, 6);
    }
  });
});

describe("displayYieldLabel", () => {
  it("leaves TES3's yield as '?' — its coupon rate is stated in nota instead", () => {
    expect(displayYieldLabel(INSTRUMENT_BY_ID.TES3)).toBe("?");
    expect(INSTRUMENT_BY_ID.TES3.nota).toContain("11.5%");
  });

  it("keeps TESUVR8 on the plain (inflation-net) yield framing", () => {
    expect(displayYieldLabel(INSTRUMENT_BY_ID.TESUVR8)).toMatch(/^Inflación \+ \d+\.\d%$/);
  });

  it("shows every non-coupon, non-TESUVR8 instrument as a plain percentage", () => {
    for (const ins of INSTRUMENTS.filter((i) => i.id !== "TES3" && i.id !== "TESUVR8")) {
      expect(displayYieldLabel(ins)).toBe(`${(ins.yield * 100).toFixed(1)}%`);
    }
  });
});

describe("isPortfolioDecisionV4", () => {
  it("accepts a minimal valid schedule (month 0 only)", () => {
    expect(isPortfolioDecisionV4({ schedule: [{ month: 0, allocation: fullAllocation({ LIQ: 100 }) }] })).toBe(true);
  });

  it("accepts a schedule with additional ascending checkpoints", () => {
    const schedule: MonthlyAllocationEntry[] = [
      { month: 0, allocation: fullAllocation({ LIQ: 100 }) },
      { month: 6, allocation: fullAllocation({ TES1: 100 }) },
      { month: 24, allocation: fullAllocation({ TESUVR8: 100 }) },
    ];
    expect(isPortfolioDecisionV4({ schedule })).toBe(true);
  });

  it("rejects a schedule whose first entry isn't month 0", () => {
    expect(isPortfolioDecisionV4({ schedule: [{ month: 1, allocation: fullAllocation({ LIQ: 100 }) }] })).toBe(false);
  });

  it("rejects a schedule with an empty allocation entry", () => {
    expect(isPortfolioDecisionV4({ schedule: [] })).toBe(false);
  });

  it("rejects non-ascending or duplicate months", () => {
    expect(
      isPortfolioDecisionV4({
        schedule: [
          { month: 0, allocation: fullAllocation({ LIQ: 100 }) },
          { month: 0, allocation: fullAllocation({ TES1: 100 }) },
        ],
      })
    ).toBe(false);
    expect(
      isPortfolioDecisionV4({
        schedule: [
          { month: 0, allocation: fullAllocation({ LIQ: 100 }) },
          { month: 12, allocation: fullAllocation({ TES1: 100 }) },
          { month: 6, allocation: fullAllocation({ TESUVR8: 100 }) },
        ],
      })
    ).toBe(false);
  });

  it("rejects a negative month", () => {
    expect(isPortfolioDecisionV4({ schedule: [{ month: -1, allocation: fullAllocation({ LIQ: 100 }) }] })).toBe(false);
  });

  it("rejects an allocation missing an instrument key, reusing isMinVarianceAllocation's strictness", () => {
    const { LIQ, ...missingLiq } = fullAllocation({ LIQ: 100 });
    void LIQ;
    expect(isPortfolioDecisionV4({ schedule: [{ month: 0, allocation: missingLiq }] })).toBe(false);
  });

  it("rejects a negative weight", () => {
    expect(isPortfolioDecisionV4({ schedule: [{ month: 0, allocation: fullAllocation({ LIQ: -5 }) }] })).toBe(false);
  });

  it("enforces MAX_SCHEDULE_ENTRIES", () => {
    const schedule: MonthlyAllocationEntry[] = Array.from({ length: MAX_SCHEDULE_ENTRIES + 1 }, (_, i) => ({
      month: i,
      allocation: fullAllocation({ LIQ: 100 }),
    }));
    expect(isPortfolioDecisionV4({ schedule })).toBe(false);
    expect(isPortfolioDecisionV4({ schedule: schedule.slice(0, MAX_SCHEDULE_ENTRIES) })).toBe(true);
  });

  it("rejects the old tree shape ({tranches: [...]}) gracefully (false, not a throw)", () => {
    const oldTree = { tranches: [{ instrumentId: "LIQ", weight: 100, onMaturity: { action: "cash" } }] };
    expect(() => isPortfolioDecisionV4(oldTree)).not.toThrow();
    expect(isPortfolioDecisionV4(oldTree)).toBe(false);
  });
});
