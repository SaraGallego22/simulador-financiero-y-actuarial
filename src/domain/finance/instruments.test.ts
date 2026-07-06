import { describe, expect, it } from "vitest";
import { isPortfolioDecisionV3, MAX_TRANCHE_SIBLINGS } from "./instruments";
import type { Tranche } from "./instruments";

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
