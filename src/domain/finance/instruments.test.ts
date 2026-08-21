import { describe, expect, it } from "vitest";
import {
  isPortfolioDecisionV4,
  instrumentDurationM,
  isCouponBond,
  displayYieldLabel,
  MAX_SCHEDULE_ENTRIES,
  INSTRUMENTS,
  INSTRUMENT_BY_ID,
  RISK_FREE_RATE,
} from "./instruments";
import type { Allocation, MonthlyAllocationEntry } from "./instruments";
import { ACC_ROLL_M } from "./constants";

function fullAllocation(overrides: Allocation): Allocation {
  const alloc: Allocation = {};
  for (const ins of INSTRUMENTS) alloc[ins.id] = overrides[ins.id] ?? 0;
  return alloc;
}

describe("instrument risk/return calibration", () => {
  it("every instrument has a positive volatility", () => {
    for (const ins of INSTRUMENTS) expect(ins.volAnual).toBeGreaterThan(0);
  });

  it("CDT90 has the single best nominal Sharpe ratio of the whole menu, and LIQ the worst — it IS the risk-free rate, so its own Sharpe is exactly 0 by construction", () => {
    // Nominal Sharpe = (yield - RISK_FREE_RATE) / volAnual, the same ratio
    // scoreFinanciero() computes off simulated effYield/avgPortfolioVol —
    // this checks the menu's own numbers directly, not a simulation run.
    // CDT90's short duration keeps its volatility low relative to its
    // spread over LIQ, beating even TESUVR8's higher yield.
    const nominalSharpe = (id: string) => {
      const ins = INSTRUMENTS.find((i) => i.id === id)!;
      return (ins.yield - RISK_FREE_RATE) / ins.volAnual;
    };
    const cdt90 = nominalSharpe("CDT90");
    const liq = nominalSharpe("LIQ");
    expect(liq).toBeCloseTo(0, 10);
    for (const ins of INSTRUMENTS) {
      if (ins.id === "CDT90") continue;
      expect(cdt90).toBeGreaterThan(nominalSharpe(ins.id));
    }
    for (const ins of INSTRUMENTS) {
      if (ins.id === "LIQ") continue;
      expect(liq).toBeLessThan(nominalSharpe(ins.id));
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
  const capitalSocialAllocation = fullAllocation({ LIQ: 100 });

  it("accepts a minimal valid schedule (month 0 only)", () => {
    expect(isPortfolioDecisionV4({ capitalSocialAllocation, schedule: [{ month: 0, allocation: fullAllocation({ LIQ: 100 }) }] })).toBe(true);
  });

  it("accepts a schedule with additional ascending checkpoints", () => {
    const schedule: MonthlyAllocationEntry[] = [
      { month: 0, allocation: fullAllocation({ LIQ: 100 }) },
      { month: 6, allocation: fullAllocation({ TES1: 100 }) },
      { month: 24, allocation: fullAllocation({ TESUVR8: 100 }) },
    ];
    expect(isPortfolioDecisionV4({ capitalSocialAllocation, schedule })).toBe(true);
  });

  it("rejects a schedule whose first entry isn't month 0", () => {
    expect(isPortfolioDecisionV4({ capitalSocialAllocation, schedule: [{ month: 1, allocation: fullAllocation({ LIQ: 100 }) }] })).toBe(false);
  });

  it("rejects a schedule with an empty allocation entry", () => {
    expect(isPortfolioDecisionV4({ capitalSocialAllocation, schedule: [] })).toBe(false);
  });

  it("rejects non-ascending or duplicate months", () => {
    expect(
      isPortfolioDecisionV4({
        capitalSocialAllocation,
        schedule: [
          { month: 0, allocation: fullAllocation({ LIQ: 100 }) },
          { month: 0, allocation: fullAllocation({ TES1: 100 }) },
        ],
      })
    ).toBe(false);
    expect(
      isPortfolioDecisionV4({
        capitalSocialAllocation,
        schedule: [
          { month: 0, allocation: fullAllocation({ LIQ: 100 }) },
          { month: 12, allocation: fullAllocation({ TES1: 100 }) },
          { month: 6, allocation: fullAllocation({ TESUVR8: 100 }) },
        ],
      })
    ).toBe(false);
  });

  it("rejects a negative month", () => {
    expect(isPortfolioDecisionV4({ capitalSocialAllocation, schedule: [{ month: -1, allocation: fullAllocation({ LIQ: 100 }) }] })).toBe(false);
  });

  it("rejects an allocation missing an instrument key, reusing isMinVarianceAllocation's strictness", () => {
    const { LIQ, ...missingLiq } = fullAllocation({ LIQ: 100 });
    void LIQ;
    expect(isPortfolioDecisionV4({ capitalSocialAllocation, schedule: [{ month: 0, allocation: missingLiq }] })).toBe(false);
  });

  it("rejects a negative weight", () => {
    expect(isPortfolioDecisionV4({ capitalSocialAllocation, schedule: [{ month: 0, allocation: fullAllocation({ LIQ: -5 }) }] })).toBe(false);
  });

  it("enforces MAX_SCHEDULE_ENTRIES", () => {
    const schedule: MonthlyAllocationEntry[] = Array.from({ length: MAX_SCHEDULE_ENTRIES + 1 }, (_, i) => ({
      month: i,
      allocation: fullAllocation({ LIQ: 100 }),
    }));
    expect(isPortfolioDecisionV4({ capitalSocialAllocation, schedule })).toBe(false);
    expect(isPortfolioDecisionV4({ capitalSocialAllocation, schedule: schedule.slice(0, MAX_SCHEDULE_ENTRIES) })).toBe(true);
  });

  it("rejects the old tree shape ({tranches: [...]}) gracefully (false, not a throw)", () => {
    const oldTree = { tranches: [{ instrumentId: "LIQ", weight: 100, onMaturity: { action: "cash" } }] };
    expect(() => isPortfolioDecisionV4(oldTree)).not.toThrow();
    expect(isPortfolioDecisionV4(oldTree)).toBe(false);
  });

  it("rejects a schedule missing capitalSocialAllocation (predates this field)", () => {
    expect(isPortfolioDecisionV4({ schedule: [{ month: 0, allocation: fullAllocation({ LIQ: 100 }) }] })).toBe(false);
  });

  it("rejects an invalid capitalSocialAllocation the same way isMinVarianceAllocation would", () => {
    const { LIQ, ...missingLiq } = capitalSocialAllocation;
    void LIQ;
    expect(
      isPortfolioDecisionV4({ capitalSocialAllocation: missingLiq, schedule: [{ month: 0, allocation: fullAllocation({ LIQ: 100 }) }] })
    ).toBe(false);
  });
});
