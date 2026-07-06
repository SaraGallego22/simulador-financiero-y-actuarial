import { describe, expect, it } from "vitest";
import { computeLiabilitySchedules } from "../reserving/liability";
import { almNAV, almObjetivo, almSim, scoreFinanciero } from "./alm";
import { FZ } from "./constants";
import type { MaturityDecision, PortfolioDecisionV3, Tranche } from "./instruments";

// A handful of claims spread across the Year-1 window, notified early enough
// that meaningful amounts land in both payY1 and the post-valuation reserve.
const claims = [
  { teamId: 1, noticeMonth: 0, severity: 5_000_000 },
  { teamId: 1, noticeMonth: 3, severity: 8_000_000 },
  { teamId: 1, noticeMonth: 6, severity: 3_000_000 },
];
const lib = computeLiabilitySchedules(claims, [1]).get(1)!;

function tranche(instrumentId: string, weight: number, onMaturity: MaturityDecision, durationM?: number): Tranche {
  return durationM != null ? { instrumentId, weight, durationM, onMaturity } : { instrumentId, weight, onMaturity };
}
function decision(tranches: Tranche[]): PortfolioDecisionV3 {
  return { tranches };
}

describe("almSim / scoreFinanciero", () => {
  it("returns null when there are no recognized instruments", () => {
    expect(almSim(lib, decision([tranche("NOPE", 100, { action: "cash" })]))).toBeNull();
    expect(scoreFinanciero(lib, decision([]))).toBeNull();
  });

  it("produces a composite score within [0, 100] for a diversified allocation", () => {
    const score = scoreFinanciero(
      lib,
      decision([
        tranche("LIQ", 20, { action: "cash" }, 6),
        tranche("CDT90", 20, { action: "cash" }),
        tranche("TES1", 30, { action: "cash" }),
        tranche("TES3", 20, { action: "cash" }),
        tranche("ACC", 10, { action: "cash" }, 24),
      ])
    );
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
    // whatever's accumulated; all-TESUVR8 locks every peso away for 8 years
    // with nothing liquid at all. Compared on raw peakBrechaCaja/
    // totalBrechaCaja (not the [0,100] score, which both saturate at 0 for
    // this deliberately severe fixture and would hide the real difference).
    const liq = almSim(lib, decision([tranche("LIQ", 100, { action: "repeat" }, 6)]));
    const uvr8 = almSim(lib, decision([tranche("TESUVR8", 100, { action: "repeat" })]));
    expect(liq).not.toBeNull();
    expect(uvr8).not.toBeNull();
    expect(liq!.peakBrechaCaja).toBeLessThan(uvr8!.peakBrechaCaja);
    expect(liq!.totalBrechaCaja).toBeLessThan(uvr8!.totalBrechaCaja);
  });

  it("cash-conservation invariant: cajaFinal + brechaCaja == FZ.cajaPct * (primaCobrada + pagoSiniestros) every month", () => {
    const sim = almSim(
      lib,
      decision([
        tranche("LIQ", 20, { action: "cash" }, 6),
        tranche("CDT90", 20, { action: "cash" }),
        tranche("TES1", 30, { action: "cash" }),
        tranche("TES3", 20, { action: "cash" }),
        tranche("ACC", 10, { action: "cash" }, 24),
      ])
    );
    expect(sim).not.toBeNull();
    for (const row of sim!.rows) {
      const expectedCajaMinima = FZ.cajaPct * (row.primaCobrada + row.pagoSiniestros);
      expect(row.cajaFinal + row.brechaCaja).toBeCloseTo(expectedCajaMinima, 4);
    }
  });

  it("a maturity chain (TES1 -> reallocate into TES3) locks proceeds away until TES3 matures, unlike 'mantener en caja' on the same instrument", () => {
    const alloc = [tranche("LIQ", 50, { action: "repeat" }, 3)];
    const cashOnMaturity = scoreFinanciero(lib, decision([...alloc, tranche("TES1", 50, { action: "cash" })]));
    const chained = scoreFinanciero(
      lib,
      decision([...alloc, tranche("TES1", 50, { action: "reallocate", tranches: [tranche("TES3", 100, { action: "cash" })] })])
    );
    expect(cashOnMaturity).not.toBeNull();
    expect(chained).not.toBeNull();
    expect(chained!.peakBrechaCaja).toBeGreaterThanOrEqual(cashOnMaturity!.peakBrechaCaja);
  });

  it("splitting a maturity's proceeds across reallocate children funds both branches independently", () => {
    const allIntoTes1 = almSim(
      lib,
      decision([tranche("CDT90", 100, { action: "reallocate", tranches: [tranche("TES1", 100, { action: "cash" })] })])
    );
    const splitWithLiq = almSim(
      lib,
      decision([
        tranche("CDT90", 100, {
          action: "reallocate",
          tranches: [tranche("TES1", 60, { action: "cash" }), tranche("LIQ", 40, { action: "repeat" }, 3)],
        }),
      ])
    );
    expect(allIntoTes1).not.toBeNull();
    expect(splitWithLiq).not.toBeNull();
    // Keeping 40% perpetually liquid (vs. locking 100% into TES1) should
    // reduce the *cumulative* shortfall across the horizon — a single
    // month's peak can go either way depending on exactly when TES1's
    // (smaller, in the split case) maturity lands relative to a payment
    // spike, so total (not peak) is the robust comparison here.
    expect(splitWithLiq!.totalBrechaCaja).toBeLessThanOrEqual(allIntoTes1!.totalBrechaCaja);
  });

  it("a repeating 3-month tranche cycles ~20 times over the horizon without excessive recursion or slowdown", () => {
    const start = performance.now();
    const score = scoreFinanciero(lib, decision([tranche("CDT90", 100, { action: "repeat" })]));
    const elapsedMs = performance.now() - start;
    expect(score).not.toBeNull();
    expect(Number.isFinite(score!.nota)).toBe(true);
    // Tripwire, not a real budget — "repeat"/"reallocate" are resolved
    // inside almSim's flat monthly loop, never via recursive re-funding
    // calls, so call-stack depth is O(1) regardless of repeat count. This
    // just catches a future regression that reintroduces recursion.
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("an ACC tranche with a custom duration converts back to usable cash at maturity (equities are no longer a permanent trap)", () => {
    const sim = almSim(lib, decision([tranche("LIQ", 50, { action: "repeat" }, 6), tranche("ACC", 50, { action: "cash" }, 6)]));
    expect(sim).not.toBeNull();
    // Funded at month 0 (build phase), durationM=6 -> matures at absolute
    // month 6 -> row index 6 (mes = t - BUILD_MONTHS, so absolute t=6 is
    // mes=-6, the 7th row, index 6).
    expect(sim!.rows[6].vencimientosCaja).toBeGreaterThan(0);
  });

  it("portfolio-value invariant: saldoFinalPortafolio == saldoInicialPortafolio + rendimientoPortafolio - vencimientosCaja - inversionNeta every month", () => {
    const sim = almSim(
      lib,
      decision([
        tranche("LIQ", 20, { action: "cash" }, 6),
        tranche("CDT90", 20, { action: "cash" }),
        tranche("TES1", 30, { action: "cash" }),
        tranche("TES3", 20, { action: "cash" }),
        tranche("ACC", 10, { action: "cash" }, 24),
      ])
    );
    expect(sim).not.toBeNull();
    for (const row of sim!.rows) {
      const expected = row.saldoInicialPortafolio + row.rendimientoPortafolio - row.vencimientosCaja - row.inversionNeta;
      expect(row.saldoFinalPortafolio).toBeCloseTo(expected, 4);
    }
  });

  it("an all-ACC portfolio has higher realized volatility and a worse risk-adjusted Rendimiento than an all-TESUVR8 portfolio, despite ACC's higher raw yield", () => {
    const acc = scoreFinanciero(lib, decision([tranche("ACC", 100, { action: "repeat" }, 24)]));
    const uvr8 = scoreFinanciero(lib, decision([tranche("TESUVR8", 100, { action: "repeat" })]));
    expect(acc).not.toBeNull();
    expect(uvr8).not.toBeNull();
    expect(acc!.avgVol).toBeGreaterThan(uvr8!.avgVol);
    expect(acc!.effYield).toBeGreaterThan(uvr8!.effYield);
    expect(acc!.rendimiento).toBeLessThan(uvr8!.rendimiento);
  });

  it("adding a meaningful TESUVR8 weight to an otherwise-safe portfolio raises the risk-adjusted Rendimiento sub-score", () => {
    const safe = scoreFinanciero(lib, decision([tranche("LIQ", 50, { action: "repeat" }, 6), tranche("CDT90", 50, { action: "repeat" })]));
    const withUvr = scoreFinanciero(
      lib,
      decision([tranche("LIQ", 30, { action: "repeat" }, 6), tranche("CDT90", 30, { action: "repeat" }), tranche("TESUVR8", 40, { action: "repeat" })])
    );
    expect(safe).not.toBeNull();
    expect(withUvr).not.toBeNull();
    expect(withUvr!.rendimiento).toBeGreaterThan(safe!.rendimiento);
  });
});

describe("almObjetivo", () => {
  it("produces a target allocation that sums to ~100%", () => {
    const objective = almObjetivo(lib);
    expect(objective).not.toBeNull();
    const total = objective!.tranches.reduce((s, t) => s + t.weight, 0);
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
