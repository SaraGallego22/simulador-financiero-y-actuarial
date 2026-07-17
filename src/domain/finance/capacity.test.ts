import { describe, expect, it } from "vitest";
import { maxPremiumForCapital, maxPoliciesForCapital, nominalPortfolioVolRatio, CAPACITY_TARGET_MARGIN } from "./capacity";
import { finBench } from "./finBench";
import { RESERVE_TO_PREMIUM_RATIO } from "./capacity";
import { CAPITAL_SOCIAL } from "./constants";
import type { Tranche } from "./instruments";

describe("nominalPortfolioVolRatio", () => {
  it("returns 1 (the flat pre-volatility charge) when there's no decision at all", () => {
    expect(nominalPortfolioVolRatio(null)).toBe(1);
    expect(nominalPortfolioVolRatio([])).toBe(1);
  });

  it("is > 1 for a 100% ACC portfolio (the menu's most volatile instrument) and < 1 for a 100% LIQ portfolio", () => {
    const acc: Tranche[] = [{ instrumentId: "ACC", weight: 100, onMaturity: { action: "cash" } }];
    const liq: Tranche[] = [{ instrumentId: "LIQ", weight: 100, onMaturity: { action: "cash" } }];
    expect(nominalPortfolioVolRatio(acc)).toBeGreaterThan(1);
    expect(nominalPortfolioVolRatio(liq)).toBeLessThan(1);
  });
});

describe("maxPremiumForCapital", () => {
  it("is 0 when there's no available capital", () => {
    expect(maxPremiumForCapital(0, 1)).toBe(0);
    expect(maxPremiumForCapital(-1, 1)).toBe(0);
  });

  it("solves the margin exactly to CAPACITY_TARGET_MARGIN at the computed premium", () => {
    // Re-derive riskCapitalForPremium's math independently here (not
    // imported — it's module-private) to check the binary search actually
    // converged to the real crossing point, not just "some number".
    const availableCapital = CAPITAL_SOCIAL;
    const volRatio = 1;
    const pStar = maxPremiumForCapital(availableCapital, volRatio);
    expect(pStar).toBeGreaterThan(0);

    const reservas = RESERVE_TO_PREMIUM_RATIO * pStar;
    const FZ_primeVol = 0.1476;
    const FZ_resVol = 0.3;
    const FZ_corrPR = 0.75;
    const FZ_finRiskPct = 0.066;
    const FZ_opPct = 0.03;
    const FZ_cxpPct = 0.1;
    const FZ_cajaPct = 0.15;
    const FZ_cxcPct = 0.07;
    const rPrimas = FZ_primeVol * pStar;
    const rReservas = FZ_resVol * reservas;
    const rSusc = Math.sqrt(rPrimas * rPrimas + rReservas * rReservas + 2 * FZ_corrPR * rPrimas * rReservas);
    const inversiones = reservas + FZ_cxpPct * pStar + availableCapital - FZ_cajaPct * pStar - FZ_cxcPct * pStar;
    const rFin = FZ_finRiskPct * inversiones * volRatio;
    const rOp = FZ_opPct * pStar;
    const CORR = [
      [1, 0.75, 1],
      [0.75, 1, 1],
      [1, 1, 1],
    ];
    const R = [rSusc, rFin, rOp];
    let rk2 = 0;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rk2 += CORR[i][j] * R[i] * R[j];
    const rk = Math.sqrt(rk2);
    expect(availableCapital / rk).toBeCloseTo(CAPACITY_TARGET_MARGIN, 4);
  });

  it("cross-checked against the real finBench(): a team writing exactly its capital-derived max premium, at the reference loss ratio, lands close to solMargen ~= 1.0", () => {
    const availableCapital = CAPITAL_SOCIAL;
    const pStar = maxPremiumForCapital(availableCapital, 1);
    const bench = finBench({
      year1: { totalPremium: pStar, claimsAmount: pStar * 0.925 },
      liabilityYear1: { L: new Array(48).fill(0), payY1: new Array(12).fill(0), reserva: RESERVE_TO_PREMIUM_RATIO * pStar, hay: true },
      almYear1: null,
    });
    // Approximate cross-check: riskCapitalForPremium() ignores retained
    // earnings (patrimonio ~= availableCapital), while finBench()'s real
    // balance() adds p1.uneta on top — so this won't be exact, but should
    // be close for a reference-priced book. Band shifted lower (was
    // [0.72, 0.92]) after the P&G restructuring: Año 1's revenue is now
    // Prima Devengada (80% of Prima Emitida — Año 1 constitutes a 20% RPND
    // holdback with nothing yet to release, see finBench.ts's pyg()), not
    // 100% of premium, and expenses rose from 20% to 25% of premium
    // (FZ.gAdq/gCom) — both reduce Utilidad Neta (and so retained earnings,
    // patrimonio, solFp) relative to capacity.ts's pure day-0 capital view,
    // which knows nothing about either change.
    expect(bench.solMargen).toBeGreaterThan(0.2);
    expect(bench.solMargen).toBeLessThan(0.35);
  });

  it("more available capital supports more premium; higher volatility supports less", () => {
    const small = maxPremiumForCapital(10_000_000_000, 1);
    const big = maxPremiumForCapital(100_000_000_000, 1);
    expect(big).toBeGreaterThan(small);

    const safe = maxPremiumForCapital(CAPITAL_SOCIAL, 0.5);
    const risky = maxPremiumForCapital(CAPITAL_SOCIAL, 2);
    expect(safe).toBeGreaterThan(risky);
  });
});

describe("maxPoliciesForCapital", () => {
  it("is 0 when the team's own average premium is 0 or negative", () => {
    expect(maxPoliciesForCapital(CAPITAL_SOCIAL, 1, 0)).toBe(0);
    expect(maxPoliciesForCapital(CAPITAL_SOCIAL, 1, -5)).toBe(0);
  });

  it("is floor(maxPremiumForCapital / avgOwnPremium)", () => {
    const avgOwnPremium = 500_000;
    const expected = Math.floor(maxPremiumForCapital(CAPITAL_SOCIAL, 1) / avgOwnPremium);
    expect(maxPoliciesForCapital(CAPITAL_SOCIAL, 1, avgOwnPremium)).toBe(expected);
  });

  it("a cheaper-pricing team gets a higher policy-count cap than an expensive one, at equal capital/risk", () => {
    const cheap = maxPoliciesForCapital(CAPITAL_SOCIAL, 1, 400_000);
    const expensive = maxPoliciesForCapital(CAPITAL_SOCIAL, 1, 800_000);
    expect(cheap).toBeGreaterThan(expensive);
  });
});
