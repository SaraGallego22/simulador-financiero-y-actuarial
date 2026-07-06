import { describe, expect, it } from "vitest";
import { computeLiabilitySchedules } from "../reserving/liability";
import { almNAV, almObjetivo, almSim, scoreFinanciero } from "./alm";
import { FZ } from "./constants";
import type { PortfolioDecisionV2 } from "./instruments";

// A handful of claims spread across the Year-1 window, notified early enough
// that meaningful amounts land in both payY1 and the post-valuation reserve.
const claims = [
  { teamId: 1, noticeMonth: 0, severity: 5_000_000 },
  { teamId: 1, noticeMonth: 3, severity: 8_000_000 },
  { teamId: 1, noticeMonth: 6, severity: 3_000_000 },
];
const lib = computeLiabilitySchedules(claims, [1]).get(1)!;

function decision(allocation: Record<string, number>, maturityRules: PortfolioDecisionV2["maturityRules"] = {}): PortfolioDecisionV2 {
  return { allocation, maturityRules };
}

describe("almSim / scoreFinanciero", () => {
  it("returns null when the allocation has no recognized instruments", () => {
    expect(almSim(lib, decision({ NOPE: 100 }))).toBeNull();
    expect(scoreFinanciero(lib, decision({}))).toBeNull();
  });

  it("produces a composite score within [0, 100] for a diversified allocation", () => {
    const score = scoreFinanciero(lib, decision({ LIQ: 20, CDT90: 20, TES1: 30, TES3: 20, ACC: 10 }));
    expect(score).not.toBeNull();
    expect(score!.nota).toBeGreaterThanOrEqual(0);
    expect(score!.nota).toBeLessThanOrEqual(100);
    expect(score!.cumplimientoCaja).toBeGreaterThanOrEqual(0);
    expect(score!.cumplimientoCaja).toBeLessThanOrEqual(100);
  });

  it("holding everything liquid (LIQ) produces a much smaller shortfall than committing everything to a single very-long-dated instrument", () => {
    // Caja Inicial starts at 0 and this fixture's claims are lumpy relative
    // to the flat monthly notional contribution, so *some* shortfall is
    // realistic even for the most liquid choice — the model doesn't promise
    // zero brecha, only that liquidity choices matter. All-LIQ can draw on
    // whatever liqCash has accumulated; all-TESUVR8 locks every peso away
    // for 8 years with nothing held liquid at all, so it has nothing to
    // draw on and should fare unambiguously worse — compared here on the
    // raw peakBrechaCaja/totalBrechaCaja (not the [0,100] score, which both
    // saturate at 0 for this deliberately severe fixture and would hide the
    // real difference between them).
    const liq = almSim(lib, decision({ LIQ: 100 }));
    const uvr8 = almSim(lib, decision({ TESUVR8: 100 }));
    expect(liq).not.toBeNull();
    expect(uvr8).not.toBeNull();
    expect(liq!.peakBrechaCaja).toBeLessThan(uvr8!.peakBrechaCaja);
    expect(liq!.totalBrechaCaja).toBeLessThan(uvr8!.totalBrechaCaja);
  });

  it("cash-conservation invariant: cajaFinal + brechaCaja == FZ.cajaPct * (primaCobrada + pagoSiniestros) every month", () => {
    const sim = almSim(lib, decision({ LIQ: 20, CDT90: 20, TES1: 30, TES3: 20, ACC: 10 }));
    expect(sim).not.toBeNull();
    for (const row of sim!.rows) {
      const expectedCajaMinima = FZ.cajaPct * (row.primaCobrada + row.pagoSiniestros);
      expect(row.cajaFinal + row.brechaCaja).toBeCloseTo(expectedCajaMinima, 4);
    }
  });

  it("a maturity chain (TES1 -> reinvertir en TES3) locks proceeds away until TES3 matures, unlike a 'mantener en caja' rule on the same instrument", () => {
    // Same allocation for fresh surplus in both runs (half LIQ so there's
    // always some baseline liquidity), differing only in what happens when
    // TES1 matures: held as cash (folds back into that month's available
    // cash, eventually reinvested via `allocation`, i.e. back into LIQ/TES1)
    // vs. chained into TES3 (locked away for another 36 months). The chained
    // run should show a *higher* peak shortfall than the cash-on-maturity
    // run, since money that would have been available mid-horizon is
    // instead tied up in TES3.
    const alloc = { LIQ: 50, TES1: 50 };
    const cashOnMaturity = scoreFinanciero(lib, decision(alloc, { TES1: { action: "cash" } }));
    const chained = scoreFinanciero(lib, decision(alloc, { TES1: { action: "reinvest", instrumentId: "TES3" } }));
    expect(cashOnMaturity).not.toBeNull();
    expect(chained).not.toBeNull();
    expect(chained!.peakBrechaCaja).toBeGreaterThanOrEqual(cashOnMaturity!.peakBrechaCaja);
  });

  it("a self-referential maturity rule (rolling ladder) doesn't crash or loop forever", () => {
    const score = scoreFinanciero(lib, decision({ CDT90: 100 }, { CDT90: { action: "reinvest", instrumentId: "CDT90" } }));
    expect(score).not.toBeNull();
    expect(Number.isFinite(score!.nota)).toBe(true);
  });
});

describe("almObjetivo", () => {
  it("produces a target allocation that sums to ~100%", () => {
    const objective = almObjetivo(lib);
    expect(objective).not.toBeNull();
    const total = Object.values(objective!.allocation).reduce((s, v) => s + v, 0);
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
