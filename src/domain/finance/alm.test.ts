import { describe, expect, it } from "vitest";
import { computeLiabilitySchedules } from "../reserving/liability";
import { almNAV, almObjetivo, almSim, scoreFinanciero } from "./alm";

// A handful of claims spread across the Year-1 window, notified early enough
// that meaningful amounts land in both payY1 and the post-valuation reserve.
const claims = [
  { teamId: 1, noticeMonth: 0, severity: 5_000_000 },
  { teamId: 1, noticeMonth: 3, severity: 8_000_000 },
  { teamId: 1, noticeMonth: 6, severity: 3_000_000 },
];
const lib = computeLiabilitySchedules(claims, [1]).get(1)!;

describe("almSim / scoreFinanciero", () => {
  it("returns null for an allocation with no recognized instruments", () => {
    expect(almSim(lib, { NOPE: 100 })).toBeNull();
    expect(scoreFinanciero(lib, {})).toBeNull();
  });

  it("produces a composite score within [0, 100] for a diversified allocation", () => {
    const score = scoreFinanciero(lib, { LIQ: 20, CDT90: 20, TES1: 30, TES3: 20, ACC: 10 });
    expect(score).not.toBeNull();
    expect(score!.nota).toBeGreaterThanOrEqual(0);
    expect(score!.nota).toBeLessThanOrEqual(100);
    expect(score!.calce).toBeGreaterThanOrEqual(0);
    expect(score!.calce).toBeLessThanOrEqual(100);
  });

  it("an all-cash allocation fully funds every payment (no funding gap)", () => {
    const score = scoreFinanciero(lib, { LIQ: 100 });
    expect(score).not.toBeNull();
    // Cash never needs to wait for a maturity, so the notional monthly
    // contribution should always be able to cover what's due.
    expect(score!.peakGap).toBeCloseTo(0, 4);
    expect(score!.calce).toBeCloseTo(100, 4);
  });
});

describe("almObjetivo", () => {
  it("produces a target allocation that sums to ~100%", () => {
    const objective = almObjetivo(lib);
    expect(objective).not.toBeNull();
    const total = Object.values(objective!.alloc).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(100, 4);
  });
});

describe("almNAV", () => {
  it("computes a non-negative interest-rate risk figure for a long-duration allocation", () => {
    const nav = almNAV(lib, { TESUVR8: 100 });
    expect(nav).not.toBeNull();
    expect(nav!.riesgoTasa).toBeGreaterThanOrEqual(0);
  });

  it("returns null when there is no liability", () => {
    expect(almNAV({ L: [], payY1: [], reserva: 0, hay: false }, { LIQ: 100 })).toBeNull();
  });
});
