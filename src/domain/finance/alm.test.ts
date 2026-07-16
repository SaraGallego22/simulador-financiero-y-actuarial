import { describe, expect, it } from "vitest";
import { computeLiabilitySchedules } from "../reserving/liability";
import type { LiabilitySchedule } from "../reserving/liability";
import { almLadder, almNAV, almObjetivo, almSim, almSimRealYear, portfolioConcentrationRatio, portfolioNominalYield, scoreFinanciero } from "./alm";
import { FZ, CAPITAL_SOCIAL, VOL_PENALTY_LAMBDA } from "./constants";
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

  it("holding everything liquid (LIQ) never triggers a forced sale, unlike committing everything to a single very-long-dated instrument", () => {
    // LIQ can always be drawn for free to cover a Caja Mínima shortfall; an
    // all-TESUVR8 portfolio has nothing else to draw on, so any shortfall
    // forces an early sale of TESUVR8 itself — genuine brechaCaja (money
    // unmet even after selling *everything*) is now rare by design (see
    // forceLiquidatePortfolio), so totalVentaForzada is the metric that
    // actually distinguishes these two allocations.
    const liq = almSim(lib, decision([tranche("LIQ", 100, { action: "repeat" }, 6)]));
    const uvr8 = almSim(lib, decision([tranche("TESUVR8", 100, { action: "repeat" })]));
    expect(liq).not.toBeNull();
    expect(uvr8).not.toBeNull();
    expect(liq!.totalVentaForzada).toBe(0);
    expect(uvr8!.totalVentaForzada).toBeGreaterThan(0);
  });

  it("cash-conservation invariant: Caja Mínima is always met exactly, every month, no matter what (cajaFinal == FZ.cajaPct * (primaCobrada + pagoSiniestros))", () => {
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
      expect(row.cajaFinal).toBeCloseTo(expectedCajaMinima, 4);
    }
  });

  it("a maturity chain (TES1 -> reallocate into TES3) risks a costlier forced liquidation than 'mantener en caja' on the same instrument", () => {
    const alloc = [tranche("LIQ", 50, { action: "repeat" }, 3)];
    const cashOnMaturity = almSim(lib, decision([...alloc, tranche("TES1", 50, { action: "cash" })]));
    const chained = almSim(
      lib,
      decision([...alloc, tranche("TES1", 50, { action: "reallocate", tranches: [tranche("TES3", 100, { action: "cash" })] })])
    );
    expect(cashOnMaturity).not.toBeNull();
    expect(chained).not.toBeNull();
    // Both scenarios share the same 50% LIQ leg; the other 50% either comes
    // back as cash every ~12 months (TES1) or stays locked for ~48 months
    // via TES3 — a shortfall the shared LIQ can't cover is more likely to
    // force-sell the still-locked TES3 leg than the more-often-liquid TES1.
    expect(chained!.ventaForzadaVolWeighted).toBeGreaterThanOrEqual(cashOnMaturity!.ventaForzadaVolWeighted);
  });

  it("splitting a maturity's proceeds across reallocate children funds both branches independently, and keeping some LIQ reduces forced-liquidation severity", () => {
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
    // Keeping 40% perpetually liquid (vs. locking 100% into TES1) means more
    // shortfalls get covered by a free LIQ draw instead of a forced sale of
    // TES1 — the forced-liquidation severity should never be higher.
    expect(splitWithLiq!.ventaForzadaVolWeighted).toBeLessThanOrEqual(allIntoTes1!.ventaForzadaVolWeighted);
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

  describe("portfolioConcentrationRatio", () => {
    it("is 1 for a single non-LIQ instrument, 0 for an even spread across every non-LIQ instrument, 0 for 100% LIQ", () => {
      expect(portfolioConcentrationRatio([tranche("TES1", 100, { action: "cash" })])).toBeCloseTo(1, 6);
      expect(
        portfolioConcentrationRatio([
          tranche("CDT90", 20, { action: "cash" }),
          tranche("TES1", 20, { action: "cash" }),
          tranche("TES3", 20, { action: "cash" }),
          tranche("TESUVR8", 20, { action: "cash" }),
          tranche("ACC", 20, { action: "cash" }, 24),
        ])
      ).toBeCloseTo(0, 6);
      expect(portfolioConcentrationRatio([tranche("LIQ", 100, { action: "cash" }, 6)])).toBe(0);
    });

    it("ignores LIQ entirely — half LIQ + half of one risky instrument is exactly as concentrated as 100% of that instrument", () => {
      const full = portfolioConcentrationRatio([tranche("ACC", 100, { action: "cash" }, 24)]);
      const halfLiq = portfolioConcentrationRatio([tranche("LIQ", 50, { action: "cash" }, 12), tranche("ACC", 50, { action: "cash" }, 24)]);
      expect(halfLiq).toBeCloseTo(full, 6);
    });
  });

  it("a well-diversified portfolio can out-score concentrating fully in the single nominally-best instrument, thanks to the concentration discount", () => {
    const concentrated = scoreFinanciero(lib, decision([tranche("TESUVR8", 100, { action: "repeat" })]));
    const diversified = scoreFinanciero(
      lib,
      decision([
        tranche("CDT90", 25, { action: "repeat" }),
        tranche("TES1", 25, { action: "repeat" }),
        tranche("TES3", 25, { action: "repeat" }),
        tranche("TESUVR8", 25, { action: "repeat" }),
      ])
    );
    expect(concentrated).not.toBeNull();
    expect(diversified).not.toBeNull();
    // Concentrated scores higher once only volatility is discounted...
    expect(concentrated!.effYield - VOL_PENALTY_LAMBDA * concentrated!.avgVol).toBeGreaterThan(
      diversified!.effYield - VOL_PENALTY_LAMBDA * diversified!.avgVol
    );
    // ...but the concentration discount flips the actual graded outcome.
    expect(diversified!.rendimiento).toBeGreaterThan(concentrated!.rendimiento);
  });

  it("regression: a shortfall with no LIQ available force-sells the portfolio instead of leaving inversionNeta stuck at 0 with cajaFinal deeply negative", () => {
    const sim = almSim(lib, decision([tranche("TES1", 100, { action: "repeat" })]));
    expect(sim).not.toBeNull();
    expect(sim!.totalVentaForzada).toBeGreaterThan(0);
    // Caja Mínima is now always met exactly — see the dedicated invariant
    // test above — so there's no more "deeply negative cajaFinal" state to
    // regress into; every row's cajaFinal already equals cajaMinima.
    for (const row of sim!.rows) {
      expect(row.cajaFinal).toBeCloseTo(FZ.cajaPct * (row.primaCobrada + row.pagoSiniestros), 4);
    }
  });

  it("once LIQ and the entire rest of the portfolio are exhausted, the remaining shortfall draws on Capital Social and the portfolio's reported value goes negative", () => {
    // A claims spike sized well beyond what a single year's funding-neutral
    // contribution could ever build up in a 100%-TES1 portfolio — LIQ is
    // absent entirely, so any shortfall must eventually exhaust the whole
    // book and spill into Capital Social.
    const L = new Array(48).fill(0);
    L[0] = 2_000_000_000_000;
    const extremeLib: LiabilitySchedule = { payY1: new Array(12).fill(0), L, reserva: 1_000_000_000_000, hay: true };
    const sim = almSim(extremeLib, decision([tranche("TES1", 100, { action: "cash" })]));
    expect(sim).not.toBeNull();
    expect(sim!.totalCapitalComprometido).toBeGreaterThan(0);

    const hit = sim!.rows.find((r) => r.capitalComprometidoPortafolio > 0)!;
    expect(hit).toBeDefined();
    // Caja Mínima still gets met exactly, in full, even in this extreme case.
    expect(hit.cajaFinal).toBeCloseTo(FZ.cajaPct * (hit.primaCobrada + hit.pagoSiniestros), 4);
    // The portfolio's reported value is genuinely negative once Capital
    // Social had to cover more than what was left in the book.
    expect(hit.saldoFinalPortafolio).toBeLessThan(0);
    // This event lands after Year 1 closes (the spike is the very first
    // post-valuation month), so it shows up in the Year 2 checkpoint, not Year 1's.
    expect(sim!.capitalComprometidoY1).toBe(0);
    expect(sim!.capitalComprometidoY2).toBeCloseTo(sim!.totalCapitalComprometido, 4);
  });

  it("a team that keeps enough LIQ never touches Capital Social through either claim year, and keeps essentially all of it", () => {
    const score = scoreFinanciero(
      lib,
      decision([
        tranche("LIQ", 30, { action: "repeat" }, 6),
        tranche("CDT90", 30, { action: "repeat" }),
        tranche("TESUVR8", 40, { action: "repeat" }),
      ])
    );
    expect(score).not.toBeNull();
    // Both checkpoints that actually feed the real Balance/Solvencia
    // (finBench's bal1/bal2) are untouched — this is the part that matters
    // for "aplica bien para ambos años de siniestro".
    expect(score!.capitalComprometidoY1).toBe(0);
    expect(score!.capitalComprometidoY2).toBe(0);
    // Some lumpy month past Year 2 may still nick a negligible amount —
    // this fixture's 3-claim horizon isn't perfectly smooth — but it stays
    // a rounding error against Capital Social, not a real erosion.
    expect(score!.patrimonioDisponible / CAPITAL_SOCIAL).toBeGreaterThan(0.999);
    expect(score!.cumplimientoCaja).toBeGreaterThan(99.9);
  });

  it("forced-selling ACC under duress is penalized more than forced-selling TES1 for an equivalent shortfall — a real hierarchy, not a flat penalty", () => {
    const acc = scoreFinanciero(lib, decision([tranche("ACC", 100, { action: "repeat" }, 24)]));
    const tes1 = scoreFinanciero(lib, decision([tranche("TES1", 100, { action: "repeat" })]));
    expect(acc).not.toBeNull();
    expect(tes1).not.toBeNull();
    expect(acc!.totalVentaForzada).toBeGreaterThan(0);
    expect(tes1!.totalVentaForzada).toBeGreaterThan(0);
    expect(acc!.ventaForzadaSeveridad).toBeGreaterThan(tes1!.ventaForzadaSeveridad);
    expect(acc!.ventaForzada).toBeLessThan(tes1!.ventaForzada);
  });

  it("a forced sale of LIQ itself (drawFromLiq) never counts toward the forced-liquidation penalty — that's exactly what LIQ is for", () => {
    const sim = almSim(lib, decision([tranche("LIQ", 100, { action: "repeat" }, 3)]));
    expect(sim).not.toBeNull();
    expect(sim!.totalVentaForzada).toBe(0);
    expect(sim!.ventaForzadaVolWeighted).toBe(0);
  });
});

describe("almLadder", () => {
  it("always reaches the last month of the horizon (mes 47), even when nothing else about that month would otherwise qualify for the filtered view", () => {
    const ladder = almLadder(lib, decision([tranche("LIQ", 30, { action: "repeat" }, 6), tranche("CDT90", 30, { action: "repeat" }), tranche("TESUVR8", 40, { action: "repeat" })]));
    expect(ladder).not.toBeNull();
    const lastRow = ladder!.rows[ladder!.rows.length - 1];
    expect(lastRow.mes).toBe(47);
  });
});

describe("almSim's incomeY1/incomeY2 (what finBench() uses for the P&G's 'Resultado de inversiones', not a formula proxy)", () => {
  const mix = decision([
    tranche("LIQ", 30, { action: "repeat" }, 6),
    tranche("CDT90", 30, { action: "repeat" }),
    tranche("TESUVR8", 40, { action: "repeat" }),
  ]);

  it("incomeY1 is exactly the sum of rendimientoPortafolio across Year 1's 12 build months (mes -12..-1)", () => {
    const sim = almSim(lib, mix);
    expect(sim).not.toBeNull();
    const buildPhaseIncome = sim!.rows.filter((r) => r.mes < 0).reduce((s, r) => s + r.rendimientoPortafolio, 0);
    expect(sim!.incomeY1).toBeCloseTo(buildPhaseIncome, 4);
  });

  it("incomeY2 is exactly the sum of rendimientoPortafolio across the 12 months right after Year 1 closes (mes 0..11)", () => {
    const sim = almSim(lib, mix);
    expect(sim).not.toBeNull();
    const year2Income = sim!.rows.filter((r) => r.mes >= 0 && r.mes < 12).reduce((s, r) => s + r.rendimientoPortafolio, 0);
    expect(sim!.incomeY2).toBeCloseTo(year2Income, 4);
  });

  it("incomeY1 and incomeY2 are both strictly less than totIncome (the full 60-month sum) for a portfolio that keeps earning past month 24", () => {
    const sim = almSim(lib, mix);
    expect(sim).not.toBeNull();
    expect(sim!.incomeY1).toBeLessThan(sim!.totIncome);
    expect(sim!.incomeY2).toBeLessThan(sim!.totIncome);
  });
});

describe("almSim's real-premium override (the 'ALM real' companion to the graded fictitious run)", () => {
  const mix = decision([
    tranche("LIQ", 30, { action: "repeat" }, 6),
    tranche("CDT90", 30, { action: "repeat" }),
    tranche("TESUVR8", 40, { action: "repeat" }),
  ]);

  it("omitting the override reproduces the exact fictitious behavior (regression: existing callers are unaffected)", () => {
    const withoutOverride = almSim(lib, mix);
    const explicitUndefined = almSim(lib, mix, undefined);
    expect(explicitUndefined).toEqual(withoutOverride);
  });

  it("a much lower real premium than the fictitious notional produces a worse (or equal) cumplimientoCaja under the real run", () => {
    const fictitious = scoreFinanciero(lib, mix);
    // The fictitious notional funds exactly reserva+payY1 over 12 months —
    // a real premium far below that should strain Caja Mínima more, not less.
    const muchLowerRealPremium = (lib.reserva + lib.payY1.reduce((a, b) => a + b, 0)) * 0.1;
    const real = scoreFinanciero(lib, mix, muchLowerRealPremium / 12);
    expect(fictitious).not.toBeNull();
    expect(real).not.toBeNull();
    expect(real!.avgCapitalComprometidoRatio).toBeGreaterThanOrEqual(fictitious!.avgCapitalComprometidoRatio);
  });

  it("portYield never changes between the fictitious and real runs — it depends only on the decision tree, never on funding", () => {
    const fictitious = scoreFinanciero(lib, mix);
    const real = scoreFinanciero(lib, mix, 999_999);
    expect(fictitious).not.toBeNull();
    expect(real).not.toBeNull();
    expect(real!.portYield).toBe(fictitious!.portYield);
  });

  it("reserva never changes between the fictitious and real runs — it's the real liability, unaffected by which premium funds the simulation", () => {
    const fictitious = scoreFinanciero(lib, mix);
    const real = scoreFinanciero(lib, mix, 123_456);
    expect(fictitious).not.toBeNull();
    expect(real).not.toBeNull();
    expect(real!.reserva).toBe(fictitious!.reserva);
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

describe("almSimRealYear", () => {
  const treeA = decision([tranche("LIQ", 30, { action: "repeat" }, 6), tranche("CDT90", 30, { action: "repeat" }), tranche("TESUVR8", 40, { action: "repeat" })]);
  const aporte = 200_000_000;

  it("Año 1 runs exactly 12 months, labeled -12..-1, fase a1", () => {
    const y1 = almSimRealYear(1, lib.payY1, treeA, aporte);
    expect(y1).not.toBeNull();
    expect(y1!.rows).toHaveLength(12);
    expect(y1!.rows.map((r) => r.mes)).toEqual([-12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1]);
    expect(y1!.rows.every((r) => r.fase === "a1")).toBe(true);
  });

  it("Año 1's income is exactly the sum of its 12 months' rendimientoPortafolio", () => {
    const y1 = almSimRealYear(1, lib.payY1, treeA, aporte);
    const expected = y1!.rows.reduce((s, r) => s + r.rendimientoPortafolio, 0);
    expect(y1!.income).toBeCloseTo(expected, 4);
  });

  it("portYield is decision-only — identical to portfolioNominalYield(tranches), independent of funding/claims", () => {
    const y1 = almSimRealYear(1, lib.payY1, treeA, aporte);
    expect(y1!.portYield).toBeCloseTo(portfolioNominalYield(treeA.tranches), 8);
  });

  it("Año 2 throws without Año 1's finalState — it's a continuation, not a fresh run", () => {
    expect(() => almSimRealYear(2, new Array(12).fill(0), treeA, aporte)).toThrow();
  });

  it("Año 2 continues Año 1's open positions and accumulated capital comprometido, not a fresh start", () => {
    // Force Año 1 itself to draw on Capital Social (a payY1 spike far beyond
    // what a single month's funding could cover), so Año 1 ends with a
    // nonzero capitalComprometidoAcumulado and a negative saldoFinalPortafolio
    // to actually carry forward.
    const payY1 = new Array(12).fill(0);
    payY1[0] = 2_000_000_000_000;
    const extremeLib: LiabilitySchedule = { payY1, L: new Array(48).fill(0), reserva: 0, hay: true };
    const y1 = almSimRealYear(1, extremeLib.payY1, treeA, aporte);
    expect(y1).not.toBeNull();
    expect(y1!.capitalComprometidoAcumulado).toBeGreaterThan(0);
    expect(y1!.capitalSocialRestante).toBeCloseTo(CAPITAL_SOCIAL - y1!.capitalComprometidoAcumulado, 4);

    const y2 = almSimRealYear(2, new Array(12).fill(0), treeA, aporte, y1!.finalState);
    expect(y2).not.toBeNull();
    // With no new claims at all in Año 2, capital comprometido never drops —
    // it only ever accumulates (see the module's "never repaid" note) — so
    // Año 2 must start from at least what Año 1 ended with.
    expect(y2!.capitalComprometidoAcumulado).toBeGreaterThanOrEqual(y1!.capitalComprometidoAcumulado);
    // Positions genuinely carried over: Año 2's first row picks up exactly
    // where Año 1's last row left off — the same continuity invariant that
    // holds month-to-month within a single almSim() run (see the "identity"
    // test above), now holding *across* the two chained calls.
    expect(y2!.rows[0].saldoInicialPortafolio).toBeCloseTo(y1!.rows[11].saldoFinalPortafolio, 4);
  });

  it("Año 2 is labeled 0..11, fase post, and matches almSim()'s own labeling for the same calendar year", () => {
    const y1 = almSimRealYear(1, lib.payY1, treeA, aporte);
    const y2 = almSimRealYear(2, new Array(12).fill(0), treeA, aporte, y1!.finalState);
    expect(y2!.rows.map((r) => r.mes)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(y2!.rows.every((r) => r.fase === "post")).toBe(true);
  });

  it("a real ALM with ample LIQ never touches Capital Social across either year, same as the fictitious one", () => {
    const y1 = almSimRealYear(1, lib.payY1, treeA, aporte);
    const y2 = almSimRealYear(2, [lib.L[0] || 0, lib.L[1] || 0, ...new Array(10).fill(0)], treeA, aporte, y1!.finalState);
    expect(y1!.capitalComprometidoAcumulado).toBe(0);
    expect(y2!.capitalComprometidoAcumulado).toBe(0);
    expect(y2!.capitalSocialRestante).toBe(CAPITAL_SOCIAL);
  });

  it("returns null when the decision has no recognized instruments", () => {
    expect(almSimRealYear(1, lib.payY1, decision([tranche("NOPE", 100, { action: "cash" })]), aporte)).toBeNull();
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
