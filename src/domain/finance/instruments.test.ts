import { describe, expect, it } from "vitest";
import { isPortfolioDecisionV3, MAX_TRANCHE_SIBLINGS, INSTRUMENTS } from "./instruments";
import type { Tranche } from "./instruments";
import { VOL_PENALTY_LAMBDA } from "./constants";

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

describe("isPortfolioDecisionV3", () => {
  it("accepts a minimal valid tree", () => {
    expect(isPortfolioDecisionV3({ tranches: [{ instrumentId: "LIQ", weight: 100, durationM: 6, onMaturity: { action: "cash" } }] })).toBe(
      true
    );
  });

  it("rejects a bond-like tranche carrying a durationM (must be omitted, it always uses the instrument's own plazoM)", () => {
    expect(
      isPortfolioDecisionV3({ tranches: [{ instrumentId: "TES1", weight: 100, durationM: 12, onMaturity: { action: "cash" } }] })
    ).toBe(false);
  });

  it("rejects LIQ/ACC tranches missing durationM, or with an invalid one", () => {
    expect(isPortfolioDecisionV3({ tranches: [{ instrumentId: "LIQ", weight: 100, onMaturity: { action: "cash" } }] })).toBe(false);
    expect(
      isPortfolioDecisionV3({ tranches: [{ instrumentId: "LIQ", weight: 100, durationM: 0, onMaturity: { action: "cash" } }] })
    ).toBe(false);
    expect(
      isPortfolioDecisionV3({ tranches: [{ instrumentId: "ACC", weight: 100, durationM: 2.5, onMaturity: { action: "cash" } }] })
    ).toBe(false);
  });

  it("rejects an unknown instrumentId", () => {
    expect(isPortfolioDecisionV3({ tranches: [{ instrumentId: "NOPE", weight: 100, onMaturity: { action: "cash" } }] })).toBe(false);
  });

  it("rejects a non-positive weight", () => {
    expect(
      isPortfolioDecisionV3({ tranches: [{ instrumentId: "TES1", weight: 0, onMaturity: { action: "cash" } }] })
    ).toBe(false);
    expect(
      isPortfolioDecisionV3({ tranches: [{ instrumentId: "TES1", weight: -5, onMaturity: { action: "cash" } }] })
    ).toBe(false);
  });

  it("rejects an empty reallocate (should have been 'cash' instead)", () => {
    expect(
      isPortfolioDecisionV3({
        tranches: [{ instrumentId: "TES1", weight: 100, onMaturity: { action: "reallocate", tranches: [] } }],
      })
    ).toBe(false);
  });

  it("enforces the depth cap: passes exactly at MAX_TRANCHE_DEPTH, fails one past it", () => {
    // Build a chain of nested reallocate nodes MAX_TRANCHE_DEPTH+1 deep.
    function nest(depth: number): Tranche {
      const leaf: Tranche = { instrumentId: "TES1", weight: 100, onMaturity: { action: "cash" } };
      let node = leaf;
      for (let i = 0; i < depth; i++) {
        node = { instrumentId: "TES1", weight: 100, onMaturity: { action: "reallocate", tranches: [node] } };
      }
      return node;
    }
    // Each level of nesting costs 2 steps of depth (the tranche itself, then
    // its onMaturity) — 4 levels stays comfortably within MAX_TRANCHE_DEPTH,
    // 20 levels is unambiguously past it.
    expect(isPortfolioDecisionV3({ tranches: [nest(4)] })).toBe(true);
    expect(isPortfolioDecisionV3({ tranches: [nest(20)] })).toBe(false);
  });

  it("enforces the sibling cap", () => {
    const tooMany: Tranche[] = Array.from({ length: MAX_TRANCHE_SIBLINGS + 1 }, () => ({
      instrumentId: "LIQ",
      weight: 1,
      durationM: 1,
      onMaturity: { action: "cash" },
    }));
    expect(isPortfolioDecisionV3({ tranches: tooMany })).toBe(false);
    expect(isPortfolioDecisionV3({ tranches: tooMany.slice(0, MAX_TRANCHE_SIBLINGS) })).toBe(true);
  });

  it("rejects the old {allocation, maturityRules} shape gracefully (false, not a throw)", () => {
    expect(() => isPortfolioDecisionV3({ allocation: { LIQ: 100 }, maturityRules: {} })).not.toThrow();
    expect(isPortfolioDecisionV3({ allocation: { LIQ: 100 }, maturityRules: {} })).toBe(false);
  });
});
