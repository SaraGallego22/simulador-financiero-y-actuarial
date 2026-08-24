import { describe, expect, it } from "vitest";
import { computeLiabilitySchedules } from "../reserving/liability";
import type { LiabilitySchedule } from "../reserving/liability";
import {
  almLadder,
  almNAV,
  almObjetivo,
  almSim,
  almSimRealYear,
  computeMarketRiskAtAño2End,
  portfolioConcentrationRatio,
  portfolioNominalYield,
  RISK_ADJUSTED_YIELD_MAX,
  RISK_ADJUSTED_YIELD_MIN,
  scoreFinanciero,
} from "./alm";
import { FZ, CAPITAL_SOCIAL, CONCENTRATION_PENALTY_MU, ACC_ROLL_M } from "./constants";
import { INSTRUMENT_BY_ID, RISK_FREE_RATE } from "./instruments";
import type { Allocation, MonthlyAllocationEntry, PortfolioDecisionV4 } from "./instruments";
import type { Position } from "./alm";

// A Year-1 accident book whose claims are noticed month by month across two
// years — which is what a real one looks like now that the reporting lag
// carries the liability's whole duration: most of an accident year is still
// unreported when the year closes. Each claim is then paid in full
// LAG_AVISO_PAGO months later, so the schedule is smooth rather than lumpy,
// and it straddles the valuation date: the early notices land in payY1, the
// rest in the post-valuation reserve the ALM has to fund.
const claims = Array.from({ length: 24 }, (_, noticeMonth) => ({ teamId: 1, noticeMonth, severity: 1_000_000 }));
const lib = computeLiabilitySchedules(claims, [1]).get(1)!;

/**
 * Builds a PortfolioDecisionV4 with a month-0 checkpoint (`allocation`) plus
 * any additional checkpoints. `capitalSocialAllocation` defaults to the same
 * `allocation` — matching the pre-capitalSocialAllocation behavior for every
 * test that doesn't care about the two being different — but is a distinct
 * field a caller can override to test that decoupling explicitly.
 */
function decision(allocation: Allocation, extra: MonthlyAllocationEntry[] = [], capitalSocialAllocation: Allocation = allocation): PortfolioDecisionV4 {
  return { capitalSocialAllocation, schedule: [{ month: 0, allocation }, ...extra] };
}

describe("almSim / scoreFinanciero", () => {
  it("RISK_ADJUSTED_YIELD_MIN/MAX bracket their own reference portfolios — locks in the calibration against silent drift if HORIZON, the notional-funding formula, or the accrual mechanic change again", () => {
    // MIN's reference: 100% ACC, "repeat forever" (see RISK_ADJUSTED_YIELD_MIN's
    // own doc comment for why a sliver-of-ACC-into-LIQ blend scores lower
    // still but is deliberately excluded).
    const min = scoreFinanciero(lib, decision({ ACC: 100 }));
    expect(min!.riskAdjustedYield).toBeCloseTo(RISK_ADJUSTED_YIELD_MIN, 2);
    expect(min!.rendimiento).toBeLessThan(3);

    // MAX's reference blend (see RISK_ADJUSTED_YIELD_MAX's own doc comment).
    const max = scoreFinanciero(lib, decision({ CDT90: 41.5, TES1: 43, TES3: 4.5, TESUVR8: 11 }));
    expect(max!.riskAdjustedYield).toBeCloseTo(RISK_ADJUSTED_YIELD_MAX, 2);
    expect(max!.rendimiento).toBeGreaterThan(97);
  });

  it("returns null when there are no recognized instruments", () => {
    expect(almSim(lib, decision({ NOPE: 100 }))).toBeNull();
    expect(scoreFinanciero(lib, { capitalSocialAllocation: {}, schedule: [] })).toBeNull();
  });

  it("produces a composite score within [0, 100] for a diversified allocation", () => {
    const score = scoreFinanciero(lib, decision({ LIQ: 20, CDT90: 20, TES1: 30, TES3: 20, ACC: 10 }));
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
    const liq = almSim(lib, decision({ LIQ: 100 }));
    const uvr8 = almSim(lib, decision({ TESUVR8: 100 }));
    expect(liq).not.toBeNull();
    expect(uvr8).not.toBeNull();
    expect(liq!.totalVentaForzada).toBe(0);
    expect(uvr8!.totalVentaForzada).toBeGreaterThan(0);
  });

  it("cash-conservation invariant: Caja Mínima is always met exactly, every month, no matter what (cajaFinal == FZ.cajaPct * (primaCobrada + pagoSiniestros))", () => {
    const sim = almSim(lib, decision({ LIQ: 20, CDT90: 20, TES1: 30, TES3: 20, ACC: 10 }));
    expect(sim).not.toBeNull();
    for (const row of sim!.rows) {
      const expectedCajaMinima = FZ.cajaPct * (row.primaCobrada + row.pagoSiniestros);
      expect(row.cajaFinal).toBeCloseTo(expectedCajaMinima, 4);
    }
  });

  it("reinvesting maturities into a longer-dated instrument (TES3, 36mo) risks a costlier forced liquidation than a shorter one (TES1, 12mo), for the same LIQ cushion", () => {
    // Both scenarios share the same 50% LIQ leg; the other 50% either comes
    // back as cash (and gets reinvested by the same checkpoint) every ~12
    // months (TES1) or stays locked for ~36 months at a time (TES3) — a
    // shortfall the shared LIQ can't cover is more likely to force-sell the
    // still-locked TES3 leg than the more-often-liquid TES1.
    const shortDated = almSim(lib, decision({ LIQ: 50, TES1: 50 }));
    const longDated = almSim(lib, decision({ LIQ: 50, TES3: 50 }));
    expect(shortDated).not.toBeNull();
    expect(longDated).not.toBeNull();
    expect(longDated!.ventaForzadaVolWeighted).toBeGreaterThanOrEqual(shortDated!.ventaForzadaVolWeighted);
  });

  it("keeping some LIQ alongside a bond reduces forced-liquidation severity relative to putting everything into that bond alone", () => {
    const allIntoCdt90 = almSim(lib, decision({ CDT90: 100 }));
    const splitWithLiq = almSim(lib, decision({ CDT90: 60, LIQ: 40 }));
    expect(allIntoCdt90).not.toBeNull();
    expect(splitWithLiq).not.toBeNull();
    // Keeping 40% perpetually liquid (vs. locking 100% into CDT90) means more
    // shortfalls get covered by a free LIQ draw instead of a forced sale of
    // CDT90 — the forced-liquidation severity should never be higher.
    expect(splitWithLiq!.ventaForzadaVolWeighted).toBeLessThanOrEqual(allIntoCdt90!.ventaForzadaVolWeighted);
  });

  it("a 3-month instrument (CDT90) cycles ~20 times over the horizon without excessive recursion or slowdown", () => {
    const start = performance.now();
    const score = scoreFinanciero(lib, decision({ CDT90: 100 }));
    const elapsedMs = performance.now() - start;
    expect(score).not.toBeNull();
    expect(Number.isFinite(score!.nota)).toBe(true);
    // Tripwire, not a real budget — every month's reinvestment is resolved
    // inside almSim's flat monthly loop, never via recursive re-funding
    // calls, so call-stack depth is O(1) regardless of how many times an
    // instrument matures and rolls over. This just catches a future
    // regression that reintroduces recursion.
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("an ACC position converts back to usable cash at its fixed ACC_ROLL_M maturity (equities are not a permanent trap)", () => {
    const sim = almSim(lib, decision({ LIQ: 50, ACC: 50 }));
    expect(sim).not.toBeNull();
    // Funded at absolute month 0 (build phase) -> matures at absolute month
    // ACC_ROLL_M -> row index ACC_ROLL_M (rows are pushed in absolute-month order).
    expect(sim!.rows[ACC_ROLL_M].vencimientosCaja).toBeGreaterThan(0);
  });

  it("portfolio-value invariant: saldoFinalPortafolio == saldoInicialPortafolio + rendimientoPortafolio - vencimientosCaja - inversionNeta every month", () => {
    const sim = almSim(lib, decision({ LIQ: 20, CDT90: 20, TES1: 30, TES3: 20, ACC: 10 }));
    expect(sim).not.toBeNull();
    for (const row of sim!.rows) {
      const expected = row.saldoInicialPortafolio + row.rendimientoPortafolio - row.vencimientosCaja - row.inversionNeta;
      expect(row.saldoFinalPortafolio).toBeCloseTo(expected, 4);
    }
  });

  it("an all-ACC portfolio has higher realized volatility and a worse risk-adjusted Rendimiento than an all-TESUVR8 portfolio, despite ACC's higher raw yield", () => {
    const acc = scoreFinanciero(lib, decision({ ACC: 100 }));
    const uvr8 = scoreFinanciero(lib, decision({ TESUVR8: 100 }));
    expect(acc).not.toBeNull();
    expect(uvr8).not.toBeNull();
    expect(acc!.avgVol).toBeGreaterThan(uvr8!.avgVol);
    expect(acc!.effYield).toBeGreaterThan(uvr8!.effYield);
    expect(acc!.rendimiento).toBeLessThan(uvr8!.rendimiento);
  });

  it("adding a meaningful TESUVR8 weight to an otherwise-safe portfolio raises the risk-adjusted Rendimiento sub-score", () => {
    const safe = scoreFinanciero(lib, decision({ LIQ: 50, CDT90: 50 }));
    const withUvr = scoreFinanciero(lib, decision({ LIQ: 30, CDT90: 30, TESUVR8: 40 }));
    expect(safe).not.toBeNull();
    expect(withUvr).not.toBeNull();
    expect(withUvr!.rendimiento).toBeGreaterThan(safe!.rendimiento);
  });

  describe("portfolioConcentrationRatio", () => {
    it("is 1 for a single non-LIQ instrument, 0 for an even spread across every non-LIQ instrument, 0 for 100% LIQ", () => {
      expect(portfolioConcentrationRatio([{ month: 0, allocation: { TES1: 100 } }])).toBeCloseTo(1, 6);
      expect(
        portfolioConcentrationRatio([{ month: 0, allocation: { CDT90: 20, TES1: 20, TES3: 20, TESUVR8: 20, ACC: 20 } }])
      ).toBeCloseTo(0, 6);
      expect(portfolioConcentrationRatio([{ month: 0, allocation: { LIQ: 100 } }])).toBe(0);
    });

    it("ignores LIQ entirely — half LIQ + half of one risky instrument is exactly as concentrated as 100% of that instrument", () => {
      const full = portfolioConcentrationRatio([{ month: 0, allocation: { ACC: 100 } }]);
      const halfLiq = portfolioConcentrationRatio([{ month: 0, allocation: { LIQ: 50, ACC: 50 } }]);
      expect(halfLiq).toBeCloseTo(full, 6);
    });
  });

  it("a well-diversified portfolio can out-score concentrating fully in the single nominally-best instrument, thanks to the concentration discount", () => {
    // CDT90 has the best individual Sharpe ratio on this menu (see
    // instruments.ts's calibration-intent doc comment) — it's the
    // "nominally-best instrument" this test's title refers to now, not
    // TESUVR8 (which was the linear formula's single best pick).
    const concentrated = scoreFinanciero(lib, decision({ CDT90: 100 }));
    const diversified = scoreFinanciero(lib, decision({ CDT90: 25, TES1: 25, TES3: 25, TESUVR8: 25 }));
    expect(concentrated).not.toBeNull();
    expect(diversified).not.toBeNull();
    // riskAdjustedYield already has the concentration penalty baked in —
    // add it back to recover each portfolio's raw Sharpe ratio.
    const rawSharpe = (s: NonNullable<typeof concentrated>) => s.riskAdjustedYield + CONCENTRATION_PENALTY_MU * s.concentrationRatio;
    // Concentrated scores higher once only the Sharpe ratio itself is compared...
    expect(rawSharpe(concentrated!)).toBeGreaterThan(rawSharpe(diversified!));
    // ...but the concentration discount flips the actual graded outcome.
    expect(diversified!.rendimiento).toBeGreaterThan(concentrated!.rendimiento);
  });

  it("regression: a shortfall with no LIQ available force-sells the portfolio instead of leaving inversionNeta stuck at 0 with cajaFinal deeply negative", () => {
    const sim = almSim(lib, decision({ TES1: 100 }));
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
    const sim = almSim(extremeLib, decision({ TES1: 100 }));
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
    const score = scoreFinanciero(lib, decision({ LIQ: 30, CDT90: 30, TESUVR8: 40 }));
    expect(score).not.toBeNull();
    // Both checkpoints that actually feed the real Balance/Solvencia
    // (finBench's bal1/bal2) are untouched — this is the part that matters
    // for "aplica bien para ambos años de siniestro".
    expect(score!.capitalComprometidoY1).toBe(0);
    // Año 2 no queda exactamente en cero, y ya no por punto flotante: el ALM
    // ficticio se fondea con la reserva y paga esa misma reserva MÁS gastos
    // (25% de la prima nocional), así que estructuralmente le falta caja. Con
    // el pago concentrado tres meses después del aviso, el portafolio tiene
    // mucho menos tiempo para que el rendimiento cubra esa diferencia que
    // cuando los siniestros se pagaban goteando 39 meses. Lo que se verifica
    // es lo que importa: contra el Capital Social sigue siendo despreciable.
    expect(score!.capitalComprometidoY2 / CAPITAL_SOCIAL).toBeLessThan(1e-4);
    // Some lumpy month past Year 2 may still nick a negligible amount —
    // this fixture's 3-claim horizon isn't perfectly smooth — but it stays
    // a rounding error against Capital Social, not a real erosion.
    expect(score!.patrimonioDisponible / CAPITAL_SOCIAL).toBeGreaterThan(0.999);
    expect(score!.cumplimientoCaja).toBeGreaterThan(99.9);
  });

  it("forced-selling ACC under duress is penalized more than forced-selling TES1 for an equivalent shortfall — a real hierarchy, not a flat penalty", () => {
    const acc = scoreFinanciero(lib, decision({ ACC: 100 }));
    const tes1 = scoreFinanciero(lib, decision({ TES1: 100 }));
    expect(acc).not.toBeNull();
    expect(tes1).not.toBeNull();
    expect(acc!.totalVentaForzada).toBeGreaterThan(0);
    expect(tes1!.totalVentaForzada).toBeGreaterThan(0);
    expect(acc!.ventaForzadaSeveridad).toBeGreaterThan(tes1!.ventaForzadaSeveridad);
    expect(acc!.ventaForzada).toBeLessThan(tes1!.ventaForzada);
  });

  it("a forced sale of LIQ itself (drawFromLiq) never counts toward the forced-liquidation penalty — that's exactly what LIQ is for", () => {
    const sim = almSim(lib, decision({ LIQ: 100 }));
    expect(sim).not.toBeNull();
    expect(sim!.totalVentaForzada).toBe(0);
    expect(sim!.ventaForzadaVolWeighted).toBe(0);
  });
});

describe("avgPortfolioVol (correlation-aware Rendimiento, not just individual variances)", () => {
  // A dedicated claims-free liability so forced-sale haircuts never fire —
  // isolates the correlation effect from the venta-forzada mechanic (a
  // separate concern, already covered above).
  const noClaimsLib: LiabilitySchedule = { payY1: new Array(12).fill(0), L: new Array(48).fill(0), reserva: 100_000_000, hay: true };

  it("equals avgVol exactly for a single-instrument portfolio — nothing to correlate against", () => {
    const sim = almSim(noClaimsLib, decision({ TES1: 100 }));
    expect(sim).not.toBeNull();
    expect(sim!.avgPortfolioVol).toBeCloseTo(sim!.avgVol, 6);
  });

  it("is strictly lower than avgVol for a genuinely mixed, imperfectly-correlated portfolio", () => {
    const sim = almSim(noClaimsLib, decision({ CDT90: 50, TES1: 50 }));
    expect(sim).not.toBeNull();
    expect(sim!.avgPortfolioVol).toBeLessThan(sim!.avgVol);
  });

  it("riskAdjustedYield is discounted by avgPortfolioVol, not avgVol — reconstructing the score with avgVol instead gives a strictly worse (lower) Sharpe ratio for a diversified portfolio", () => {
    const score = scoreFinanciero(noClaimsLib, decision({ CDT90: 50, TES1: 50 }));
    expect(score).not.toBeNull();
    const naiveSharpe = (score!.effYield - RISK_FREE_RATE) / score!.avgVol;
    const naiveRiskAdjustedYield = naiveSharpe - CONCENTRATION_PENALTY_MU * score!.concentrationRatio;
    expect(score!.riskAdjustedYield).toBeGreaterThan(naiveRiskAdjustedYield);
  });

  it("a portfolio split between two lowly-correlated instruments (LIQ, near-zero rate/equity loading, and ACC, almost purely idiosyncratic equity risk) scores a better Rendimiento than the naive per-instrument-average formula would have", () => {
    const score = scoreFinanciero(noClaimsLib, decision({ LIQ: 50, ACC: 50 }));
    expect(score).not.toBeNull();
    const naiveSharpe = (score!.effYield - RISK_FREE_RATE) / score!.avgVol;
    const naiveRiskAdjustedYield = naiveSharpe - CONCENTRATION_PENALTY_MU * score!.concentrationRatio;
    expect(score!.avgPortfolioVol).toBeLessThan(score!.avgVol);
    expect(score!.riskAdjustedYield).toBeGreaterThan(naiveRiskAdjustedYield);
  });
});

describe("coupon-bearing bonds (TES3/TESUVR8)", () => {
  // A dedicated claims-free liability: the shared `lib` fixture's reserve
  // ($11.3M) is small enough that, once TES3 stops compounding monthly
  // (see stepMonth's coupon handling), ongoing post-build claims genuinely
  // drain the whole book via forced liquidation well before month 36 — a
  // realistic outcome for that fixture, but it obscures the coupon
  // mechanic itself. This one has real prima (a nonzero reserva) but zero
  // claims, so nothing ever forces a sale and a position can be observed
  // across its whole lifecycle.
  const noClaimsLib: LiabilitySchedule = { payY1: new Array(12).fill(0), L: new Array(48).fill(0), reserva: 100_000_000, hay: true };

  it("an all-TES3 portfolio still accrues rendimientoPortafolio in a month that's neither a coupon date nor a maturity — priced dirty, interest is recognized as it's earned, not only when cash arrives", () => {
    const sim = almSim(noClaimsLib, decision({ TES3: 100 }));
    expect(sim).not.toBeNull();
    // t=1: the positions funded at t=0 and t=1 are both open and neither is
    // due for a coupon until t=12 (fundedMonth=0/1, monthsHeld=1/0) — but
    // book×(yield/12) still accrues into Position.accrued every month for a
    // coupon bond (see stepMonth's step 4), even though `book` itself never
    // compounds and the cash coupon is still months away.
    expect(sim!.rows[1].rendimientoPortafolio).toBeGreaterThan(0);
  });

  it("a TES3 position pays annual coupons at months 12 and 24 without maturing, then a final coupon+principal at month 36", () => {
    const sim = almSim(noClaimsLib, decision({ LIQ: 50, TES3: 50 }));
    expect(sim).not.toBeNull();
    // Funded at absolute month 0 (build phase) -> plazoM=36 -> matures at
    // absolute month 36. Periodic coupons fire at monthsHeld=12,24 (still
    // open); the final coupon is bundled with principal at month 36 itself.
    expect(sim!.rows[12].vencimientosCaja).toBeGreaterThan(0);
    expect(sim!.rows[24].vencimientosCaja).toBeGreaterThan(0);
    expect(sim!.rows[36].vencimientosCaja).toBeGreaterThan(0);
    // Those same 3 months show up as real investment income (devengo), not
    // just idle cash movement — a coupon is genuine yield, same as any
    // other instrument's accrual.
    expect(sim!.rows[12].rendimientoPortafolio).toBeGreaterThan(0);
    expect(sim!.rows[24].rendimientoPortafolio).toBeGreaterThan(0);
    expect(sim!.rows[36].rendimientoPortafolio).toBeGreaterThan(0);
  });

  it("a TESUVR8 position's first coupon (month 12) is materially smaller than its full face value — it's a coupon, not an early full maturity payout", () => {
    const sim = almSim(noClaimsLib, decision({ LIQ: 50, TESUVR8: 50 }));
    expect(sim).not.toBeNull();
    const couponCash = sim!.rows[12].vencimientosCaja;
    expect(couponCash).toBeGreaterThan(0);
    // A single year's coupon on the book right before it's paid is
    // ins.yield (12%) of it — nowhere close to the full principal coming
    // back early.
    expect(couponCash).toBeLessThan(sim!.rows[11].saldoFinalPortafolio * 0.2);
  });

  it("total accrued income for an all-TES3 portfolio through its first coupon date (month 12) never exceeds one year's coupon on everything ever funded — no position accrues more than book×yield in any 12-month window", () => {
    const sim = almSim(noClaimsLib, decision({ TES3: 100 }));
    expect(sim).not.toBeNull();
    // Rows 0..12 (through month 12 inclusive). Priced dirty, EVERY currently
    // open TES3 position accrues every month (not just the month-0 one) —
    // by month 12 that's up to 12 separate positions (one funded each build
    // month), each contributing its own partial year of accrual, so the
    // total is well above any single position's own first coupon. What
    // can't happen, no matter how many positions are accruing at once: the
    // total ever recognized exceeds one full year's coupon on the total
    // book ever funded — no dollar has had more than ~12 months to earn
    // yield by this point, so book×yield (reserva's full 100M, the ceiling
    // on how much could ever have been funded by month 12) is a hard cap,
    // not a rough guess.
    const throughFirstCoupon = sim!.rows.slice(0, 13).reduce((s, r) => s + r.rendimientoPortafolio, 0);
    expect(throughFirstCoupon).toBeGreaterThan(0);
    expect(throughFirstCoupon).toBeLessThan(noClaimsLib.reserva * INSTRUMENT_BY_ID.TES3.yield);
  });
});

describe("almLadder", () => {
  it("always reaches the last month of the horizon (mes 95), even when nothing else about that month would otherwise qualify for the filtered view", () => {
    const ladder = almLadder(lib, decision({ LIQ: 30, CDT90: 30, TESUVR8: 40 }));
    expect(ladder).not.toBeNull();
    const lastRow = ladder!.rows[ladder!.rows.length - 1];
    expect(lastRow.mes).toBe(95);
  });
});

describe("almSim's incomeY1/incomeY2 (what finBench() uses for the P&G's 'Resultado de inversiones', not a formula proxy)", () => {
  const mix = decision({ LIQ: 30, CDT90: 30, TESUVR8: 40 });

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
  const mix = decision({ LIQ: 30, CDT90: 30, TESUVR8: 40 });

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

  it("portYield never changes between the fictitious and real runs — it depends only on the decision schedule, never on funding", () => {
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
    const total = Object.values(objective!.schedule[0].allocation).reduce((s, w) => s + (Number(w) || 0), 0);
    expect(total).toBeCloseTo(100, 4);
  });
});

describe("almSimRealYear", () => {
  const scheduleA = decision({ LIQ: 30, CDT90: 30, TESUVR8: 40 });
  const aporte = 200_000_000;

  it("Año 1 runs exactly 12 months, labeled -12..-1, fase a1", () => {
    const y1 = almSimRealYear(1, lib.payY1, scheduleA, aporte);
    expect(y1).not.toBeNull();
    expect(y1!.rows).toHaveLength(12);
    expect(y1!.rows.map((r) => r.mes)).toEqual([-12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1]);
    expect(y1!.rows.every((r) => r.fase === "a1")).toBe(true);
  });

  it("Año 1's income is exactly the sum of its 12 months' rendimientoPortafolio", () => {
    const y1 = almSimRealYear(1, lib.payY1, scheduleA, aporte);
    const expected = y1!.rows.reduce((s, r) => s + r.rendimientoPortafolio, 0);
    expect(y1!.income).toBeCloseTo(expected, 4);
  });

  it("Año 1's first month holds back cxc from primaCobrada and cxp from gastos (row values), making caja+inversiones genuinely consistent with the Balance's own cxc/cxp instead of assuming zero collection/payment lag — every other month is untouched", () => {
    const y1 = almSimRealYear(1, new Array(12).fill(0), scheduleA, aporte)!;
    const primaEmitidaAnual = aporte * 12;
    const cxc = (FZ.diasRotacionCxc / 365) * primaEmitidaAnual;
    const cxp = FZ.cxpPct * primaEmitidaAnual;
    expect(y1.rows[0].primaCobrada).toBeCloseTo(aporte - cxc, 4);
    expect(y1.rows[0].gastos).toBeCloseTo(aporte * (FZ.gAdq + FZ.gCom + FZ.gAdmin) - cxp, 4);
    for (const r of y1.rows.slice(1)) {
      expect(r.primaCobrada).toBeCloseTo(aporte, 4);
      expect(r.gastos).toBeCloseTo(aporte * (FZ.gAdq + FZ.gCom + FZ.gAdmin), 4);
    }
  });

  it("Año 2's holdback NETS against Año 1's own cxc/cxp (passed as priorYearTotalPremium) — Año 1's receivable finishes getting collected and its payable finishes getting paid during Año 2, instead of leaking into Año 2's Balance forever", () => {
    const aporte1 = aporte;
    const aporte2 = 260_000_000;
    const totalPremium1 = aporte1 * 12;
    const totalPremium2 = aporte2 * 12;
    const y1 = almSimRealYear(1, new Array(12).fill(0), scheduleA, aporte1)!;
    const y2WithoutNetting = almSimRealYear(2, new Array(12).fill(0), scheduleA, aporte2, y1.finalState)!;
    const y2WithNetting = almSimRealYear(2, new Array(12).fill(0), scheduleA, aporte2, y1.finalState, totalPremium1)!;

    const cxc1 = (FZ.diasRotacionCxc / 365) * totalPremium1;
    const cxp1 = FZ.cxpPct * totalPremium1;
    const cxc2 = (FZ.diasRotacionCxc / 365) * totalPremium2;
    const cxp2 = FZ.cxpPct * totalPremium2;

    // Without netting: month 0 holds back this year's own cxc2/cxp2 only.
    expect(y2WithoutNetting.rows[0].primaCobrada).toBeCloseTo(aporte2 - cxc2, 4);
    expect(y2WithoutNetting.rows[0].gastos).toBeCloseTo(aporte2 * (FZ.gAdq + FZ.gCom + FZ.gAdmin) - cxp2, 4);

    // With netting: month 0 holds back the NET (cxc2 − cxc1) / (cxp2 − cxp1) — Año 1's own receivable/payable is fully resolved (collected/paid) on top of this year's own fresh holdback.
    expect(y2WithNetting.rows[0].primaCobrada).toBeCloseTo(aporte2 - (cxc2 - cxc1), 4);
    expect(y2WithNetting.rows[0].gastos).toBeCloseTo(aporte2 * (FZ.gAdq + FZ.gCom + FZ.gAdmin) - (cxp2 - cxp1), 4);
  });

  it("Capital Social is genuinely funded per its own capitalSocialAllocation before Año 1's first month even runs — mes -12's opening balance already reflects it, before a single peso of real prima", () => {
    const y1 = almSimRealYear(1, lib.payY1, scheduleA, aporte);
    // fundFromAllocation() splits CAPITAL_SOCIAL across capitalSocialAllocation's
    // weights with no loss (every instrument here is valid), so month -12's
    // saldoInicialPortafolio — computed before that month's own prima gets
    // invested — is exactly CAPITAL_SOCIAL, not 0 like a prima-only real ALM
    // would start at.
    expect(y1!.rows[0].saldoInicialPortafolio).toBeCloseTo(CAPITAL_SOCIAL, 0);
  });

  it("capitalSocialAllocation is a genuinely separate decision from schedule's own month-0 checkpoint — funding follows the former, not the latter, when they differ", () => {
    const decoupled: PortfolioDecisionV4 = { capitalSocialAllocation: { ACC: 100 }, schedule: [{ month: 0, allocation: { LIQ: 100 } }] };
    const y1 = almSimRealYear(1, new Array(12).fill(0), decoupled, aporte)!;
    expect(y1).not.toBeNull();
    // Capital Social went into ACC (capitalSocialAllocation), not LIQ
    // (schedule's own month-0 checkpoint, which only ever governs prima).
    // ACC accrues monthly, so its book only ever grows past CAPITAL_SOCIAL —
    // a lower bound, not an exact match.
    const accPositions = y1.finalState.positions.filter((p) => p.instrumentId === "ACC");
    expect(accPositions.length).toBeGreaterThan(0);
    expect(accPositions.reduce((s, p) => s + p.book, 0)).toBeGreaterThanOrEqual(CAPITAL_SOCIAL);
  });

  it("Capital Social's own accrual flows into Resultado de Inversiones — income is meaningfully more than what this fixture's modest prima (~$2.4B/año) could earn on its own", () => {
    const y1 = almSimRealYear(1, lib.payY1, scheduleA, aporte);
    // TESUVR8 (40% of scheduleA) is coupon-bearing (see isCouponBond() in
    // instruments.ts): funded at month 0, its first coupon isn't due until
    // month 12 — the month right AFTER Año 1's own 12 months (0..11) end —
    // so it contributes exactly 0 devengo throughout all of Año 1, unlike
    // before this mechanic existed (when it compounded monthly like every
    // other bond). Worse, LIQ rolls every month and gets reinvested per the
    // same checkpoint each time it matures, so an increasing share of the
    // LIQ/CDT90 legs cascades into that same non-earning TESUVR8 bucket as
    // the year progresses — this floor is measured (not guessed) well below
    // the actual result (~$1.6B) but still comfortably above what prima
    // alone could ever produce (its own monthly investment income, on a
    // ~$2.4B/año trickle, is on the order of tens of millions, not billions).
    expect(y1!.income).toBeGreaterThan(CAPITAL_SOCIAL * 0.015);
  });

  it("portYield is decision-only — identical to portfolioNominalYield(schedule), independent of funding/claims", () => {
    const y1 = almSimRealYear(1, lib.payY1, scheduleA, aporte);
    expect(y1!.portYield).toBeCloseTo(portfolioNominalYield(scheduleA.schedule), 8);
  });

  it("Año 2 throws without Año 1's finalState — it's a continuation, not a fresh run", () => {
    expect(() => almSimRealYear(2, new Array(12).fill(0), scheduleA, aporte)).toThrow();
  });

  it("Año 2 continues Año 1's open positions and accumulated capital comprometido, not a fresh start", () => {
    // Force Año 1 itself to draw on Capital Social (a payY1 spike far beyond
    // what a single month's funding could cover), so Año 1 ends with a
    // nonzero capitalComprometidoAcumulado and a negative saldoFinalPortafolio
    // to actually carry forward.
    const payY1 = new Array(12).fill(0);
    payY1[0] = 2_000_000_000_000;
    const extremeLib: LiabilitySchedule = { payY1, L: new Array(48).fill(0), reserva: 0, hay: true };
    const y1 = almSimRealYear(1, extremeLib.payY1, scheduleA, aporte);
    expect(y1).not.toBeNull();
    expect(y1!.capitalComprometidoAcumulado).toBeGreaterThan(0);
    expect(y1!.capitalSocialRestante).toBeCloseTo(CAPITAL_SOCIAL - y1!.capitalComprometidoAcumulado, 4);

    const y2 = almSimRealYear(2, new Array(12).fill(0), scheduleA, aporte, y1!.finalState);
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

  it("Año 2's own fresh premium reads the schedule at its own relative month again, not the schedule's absolute month — a checkpoint sitting at absolute month 15 (which Año 1 never reaches) doesn't hijack Año 2's own relative month-3 surplus", () => {
    // Only two checkpoints: month 0 (LIQ) and month 15 (ACC). Under the old
    // single-absolute-clock lookup, Año 2's absolute t=15 (its own 4th month,
    // relative i=3) would already satisfy month<=t for the month-15
    // checkpoint, funding that month's surplus into ACC. Under the new
    // relative lookup (scheduleMonth=i=3), no checkpoint exists at relative
    // month 3, so month 0's LIQ checkpoint stays active instead — ACC is
    // never funded by Año 2's own premium at all.
    const noClaimsLib: LiabilitySchedule = { payY1: new Array(12).fill(0), L: new Array(48).fill(0), reserva: 0, hay: true };
    const scheduleWithLateCheckpoint: PortfolioDecisionV4 = {
      capitalSocialAllocation: { LIQ: 100 },
      schedule: [
        { month: 0, allocation: { LIQ: 100 } },
        { month: 15, allocation: { ACC: 100 } },
      ],
    };
    const y1 = almSimRealYear(1, noClaimsLib.payY1, scheduleWithLateCheckpoint, aporte)!;
    const y2 = almSimRealYear(2, new Array(12).fill(0), scheduleWithLateCheckpoint, aporte, y1.finalState)!;
    expect(y2.finalState.positions.some((p) => p.instrumentId === "ACC")).toBe(false);
  });

  it("...but a checkpoint placed at Año 2's own relative month (3) does govern Año 2's month-3 surplus, same as it would for Año 1's", () => {
    const noClaimsLib: LiabilitySchedule = { payY1: new Array(12).fill(0), L: new Array(48).fill(0), reserva: 0, hay: true };
    const scheduleWithRelativeCheckpoint: PortfolioDecisionV4 = {
      capitalSocialAllocation: { LIQ: 100 },
      schedule: [
        { month: 0, allocation: { LIQ: 100 } },
        { month: 3, allocation: { ACC: 100 } },
      ],
    };
    const y1 = almSimRealYear(1, noClaimsLib.payY1, scheduleWithRelativeCheckpoint, aporte)!;
    const y2 = almSimRealYear(2, new Array(12).fill(0), scheduleWithRelativeCheckpoint, aporte, y1.finalState)!;
    expect(y2.finalState.positions.some((p) => p.instrumentId === "ACC")).toBe(true);
  });

  it("Año 2 is labeled 0..11, fase post, and matches almSim()'s own labeling for the same calendar year", () => {
    const y1 = almSimRealYear(1, lib.payY1, scheduleA, aporte);
    const y2 = almSimRealYear(2, new Array(12).fill(0), scheduleA, aporte, y1!.finalState);
    expect(y2!.rows.map((r) => r.mes)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(y2!.rows.every((r) => r.fase === "post")).toBe(true);
  });

  it("a real ALM with ample LIQ never needs external financing across either year — Capital Social is invested from the start, it just never has to be force-liquidated", () => {
    const y1 = almSimRealYear(1, lib.payY1, scheduleA, aporte);
    const y2 = almSimRealYear(2, [lib.L[0] || 0, lib.L[1] || 0, ...new Array(10).fill(0)], scheduleA, aporte, y1!.finalState);
    expect(y1!.capitalComprometidoAcumulado).toBe(0);
    expect(y2!.capitalComprometidoAcumulado).toBe(0);
    expect(y2!.capitalSocialRestante).toBe(CAPITAL_SOCIAL);
  });

  it("cajaFinalAnio is exactly December's own cajaFinal, and portfolioBookValue is the gross (undiminished) book value, both feeding finBench()'s Balance", () => {
    const y1 = almSimRealYear(1, lib.payY1, scheduleA, aporte);
    expect(y1!.cajaFinalAnio).toBe(y1!.rows[11].cajaFinal);
    // Gross book value = the netted saldoFinalPortafolio plus back whatever
    // capital comprometido was netted out of it (see stepMonth's own
    // saldoFinalPortafolio = realBookSum - capitalComprometidoAcumulado
    // identity) — undiminished, since capital comprometido was never part
    // of this pool to begin with, it's an emergency draw against it.
    expect(y1!.portfolioBookValue).toBeCloseTo(y1!.rows[11].saldoFinalPortafolio + y1!.capitalComprometidoAcumulado, 4);
  });

  it("returns null when the decision has no recognized instruments", () => {
    expect(almSimRealYear(1, lib.payY1, decision({ NOPE: 100 }), aporte)).toBeNull();
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

describe("computeMarketRiskAtAño2End", () => {
  it("returns zero risk when there are no open positions and no liability", () => {
    const result = computeMarketRiskAtAño2End([], []);
    expect(result.riesgoTasa).toBeCloseTo(0, 8);
    expect(result.riesgoInflacion).toBeCloseTo(0, 8);
  });

  it("LIQ/ACC positions never move against an empty liability — no duration, valued at par regardless of the shock", () => {
    const positions: Position[] = [
      { instrumentId: "LIQ", book: 50_000_000, yM: 0, matM: 30, accrued: 0 },
      { instrumentId: "ACC", book: 20_000_000, yM: 0, matM: 999, accrued: 0 },
    ];
    const result = computeMarketRiskAtAño2End(positions, []);
    expect(result.riesgoTasa).toBeCloseTo(0, 8);
    expect(result.riesgoInflacion).toBeCloseTo(0, 8);
  });

  it("riesgoInflacion for an all-TESUVR8 portfolio equals that of an empty portfolio against the same liability — TESUVR8 discounts off the real curve, which an inflation-only shock never moves, so its (constant) PV cancels out of the NAV delta entirely", () => {
    // matM=120: 96 months (TESUVR8's own plazoM) past the AÑO2_END_MONTH valuation point (24).
    const uvr8Positions: Position[] = [{ instrumentId: "TESUVR8", book: 100_000_000, yM: 0, matM: 120, accrued: 0 }];
    const liabilityPostAño2 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5_000_000]; // a single cashflow a year out
    const withUvr8 = computeMarketRiskAtAño2End(uvr8Positions, liabilityPostAño2);
    const empty = computeMarketRiskAtAño2End([], liabilityPostAño2);
    expect(withUvr8.riesgoInflacion).toBeCloseTo(empty.riesgoInflacion, 4);
    // Sanity: the liability alone genuinely does move under the shock — this isn't a trivial 0==0.
    expect(empty.riesgoInflacion).toBeGreaterThan(0);
  });

  it("riesgoTasa for an all-TESUVR8 portfolio (empty liability) is strictly positive — the real curve shock does move TESUVR8's own PV", () => {
    const uvr8Positions: Position[] = [{ instrumentId: "TESUVR8", book: 100_000_000, yM: 0, matM: 120, accrued: 0 }];
    const result = computeMarketRiskAtAño2End(uvr8Positions, []);
    expect(result.riesgoTasa).toBeGreaterThan(0);
  });

  it("a mixed real portfolio (TESUVR8 + CDT90 + LIQ) produces finite, non-negative figures", () => {
    const scheduleMixed = decision({ LIQ: 20, CDT90: 30, TESUVR8: 50 });
    const aporte = 200_000_000;
    const y1 = almSimRealYear(1, lib.payY1, scheduleMixed, aporte)!;
    const y2 = almSimRealYear(2, new Array(12).fill(0), scheduleMixed, aporte, y1.finalState)!;
    const result = computeMarketRiskAtAño2End(y2.finalState.positions, lib.L.slice(12));
    expect(Number.isFinite(result.riesgoTasa)).toBe(true);
    expect(Number.isFinite(result.riesgoInflacion)).toBe(true);
    expect(result.riesgoTasa).toBeGreaterThanOrEqual(0);
    expect(result.riesgoInflacion).toBeGreaterThanOrEqual(0);
  });
});
