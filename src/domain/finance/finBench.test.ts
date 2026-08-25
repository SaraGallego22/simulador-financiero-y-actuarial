import { describe, expect, it } from "vitest";
import { finBench } from "./finBench";
import type { AlmYearBenchInput, FinBenchInput } from "./finBench";
import type { LiabilitySchedule } from "../reserving/liability";
import { computeDevelopment } from "../reserving/development";
import { FZ, CAPITAL_SOCIAL } from "./constants";
import { CLAIMS_INFLATION_ANNUAL } from "../generation/constants";
import { almSimRealYear } from "./alm";
import { projectYear3 } from "./projectYear3";
import { computeLiabilitySchedules } from "../reserving/liability";
import type { PortfolioDecisionV4 } from "./instruments";
import { OUTSOURCED_CONSULTING_FEE_PCT } from "../pricing/outsourced";
import { computeRt } from "../grading/composite";

const liabilityYear1: LiabilitySchedule = {
  L: new Array(48).fill(0),
  payY1: new Array(12).fill(0),
  reserva: 20_000_000,
  hay: true,
};

// portfolioBookValue defaults to CAPITAL_SOCIAL, not 0 — every real ALM now
// starts Año 1 with at least Capital Social funded into the tree (see
// almSimRealYear() in alm.ts), so a fixture with "some ALM decision but no
// portfolio value" no longer represents a realistic state.
function fakeAlmYear(
  capitalComprometido = 0,
  income = 2_000_000,
  portYield = 0.1,
  effectiveYield?: number,
  cajaFinalAnio = 0,
  portfolioBookValue = CAPITAL_SOCIAL
): AlmYearBenchInput {
  return { portYield, income, capitalComprometido, effectiveYield, cajaFinalAnio, portfolioBookValue };
}

/** A realistic Año1(100 claims)/Año2(80 claims) development schedule, for exercising finBench()'s Año3 "rich data" path. */
function fakeDevelopment() {
  const year1Claims = Array.from({ length: 100 }, (_, i) => ({ teamId: 1, noticeMonth: i % 12, ultimate: 1_000_000 }));
  const year2Claims = Array.from({ length: 80 }, (_, i) => ({ teamId: 1, noticeMonth: 12 + (i % 12), ultimate: 1_000_000 }));
  return computeDevelopment(year1Claims, year2Claims, [1]).byTeam.get(1)!;
}

const richYear3Input = (): FinBenchInput => ({
  year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000, insuredCount: 1000 },
  year2: { totalPremium: 520_000_000, claimsAmount: 310_000_000, insuredCount: 1000 },
  liabilityYear1,
  development: fakeDevelopment(),
  almYear1: fakeAlmYear(),
  almYear2: fakeAlmYear(0, 2_718_281, 0.1, 0.07),
  year2Retention: { retainedCount: 800, newCount: 200 },
});

describe("finBench", () => {
  it("produces a Year-1-only benchmark when no Year-2 data is given", () => {
    const bench = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: null,
    });
    expect(bench.p2).toBeNull();
    expect(bench.p3).toBeNull();
    expect(bench.p1.primaEmitida).toBe(500_000_000);
    expect(bench.p1.costo).toBe(300_000_000);
    // uai = ri + rinv (ri = rt - gadm, not rt itself — see the RT/RI split test below).
    expect(bench.p1.uai).toBeCloseTo(bench.p1.ri + bench.p1.rinv, 6);
  });

  it("computes a positive capital requirement and a solvency margin", () => {
    const bench = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: null,
    });
    expect(bench.solRk).toBeGreaterThan(0);
    expect(bench.solMargen).toBe(bench.solFp / bench.solRk);
  });

  it("projects a Year-3 P&L only when Year-2 data is present", () => {
    const bench = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      year2: { totalPremium: 520_000_000, claimsAmount: 310_000_000 },
      liabilityYear1,
      almYear1: null,
    });
    expect(bench.p2).not.toBeNull();
    expect(bench.p3).not.toBeNull();
    // Year 3 premium/cost grow by FZ.growth3 (6%) over Year 2 — the flat
    // fallback, used here because none of the richer Año3 inputs
    // (development/insuredCount/year2Retention) were supplied.
    expect(bench.p3!.primaEmitida).toBeCloseTo(bench.p2!.primaEmitida * 1.06, 4);
  });

  it("Year 3's loss ratio (costo/primaEmitida) equals Year 2's by construction, now that prima3 also carries CLAIMS_INFLATION_ANNUAL", () => {
    // prima3 = insuredCount3 × avgPremiumPerPolicy2 × (1+g) and
    // costo3 = insuredCount3 × frecuencia2 × severidad2 × (1+g) — the same
    // insuredCount3 and the same (1+g) cancel out of costo3/prima3, leaving
    // exactly costo2/primaEmitida2, regardless of retention. This is no
    // longer an independent Año 3 loss ratio (it was, before prima3 also
    // grew by CLAIMS_INFLATION_ANNUAL) — a team's own retention/pricing
    // choices no longer move Año 3's projected loss ratio away from Año 2's.
    const input = { ...richYear3Input(), year2Retention: { retainedCount: 700, newCount: 200 } };
    const bench = finBench(input);
    expect(bench.p3).not.toBeNull();

    const lr2 = bench.p2!.costo / bench.p2!.primaEmitida;
    const lr3 = bench.p3!.costo / bench.p3!.primaEmitida;
    expect(lr3).toBeCloseTo(lr2, 10);
    // Still not the old flat-6%-on-everything fallback rate.
    expect(bench.p3!.primaEmitida).not.toBeCloseTo(bench.p2!.primaEmitida * 1.06, 0);
  });

  it("projects Year 3 prima from retained + new policies, repriced by CLAIMS_INFLATION_ANNUAL, not a flat growth rate on the total", () => {
    const input = richYear3Input();
    const bench = finBench(input);
    // retained = 800/1000 (retention rate) * 1000 (Año2 insured) = 800; + 200 new = 1000 policies,
    // at Año2's average premium per policy (520_000_000 / 1000 = 520_000), repriced 9%.
    const expectedPrima3 = (0.8 * 1000 + 200) * (520_000_000 / 1000) * (1 + CLAIMS_INFLATION_ANNUAL);
    expect(bench.p3!.primaEmitida).toBeCloseTo(expectedPrima3, 0);
  });

  it("uses Año2's realized effectiveYield for rinv3, not the tree's nominal portYield", () => {
    const withEffective = finBench(richYear3Input());
    const input2 = richYear3Input();
    input2.almYear2 = fakeAlmYear(0, 2_718_281, 0.1, undefined); // no effectiveYield -> falls back to portYield
    const withoutEffective = finBench(input2);
    expect(withEffective.p3!.rinv).not.toBeCloseTo(withoutEffective.p3!.rinv, 0);
    // effectiveYield=0.07 in richYear3Input() vs. portYield=0.1 fallback — reservas3 is identical between the two, so rinv3 scales by the yield ratio.
    expect(withEffective.p3!.rinv).toBeCloseTo(withoutEffective.p3!.rinv * (0.07 / 0.1), 0);
  });

  it("falls back to the flat growth-rate projection when Año2 retention data is missing, even with development present", () => {
    const input = richYear3Input();
    delete input.year2Retention;
    const bench = finBench(input);
    expect(bench.p3!.primaEmitida).toBeCloseTo(bench.p2!.primaEmitida * 1.06, 4);
    expect(bench.p3!.costo).toBeCloseTo(bench.p2!.costo * 1.06, 4);
  });

  it("combines riesgoTasa/riesgoInflacion/riesgoAcciones into solRMercado via CORR_MERCADO, and folds into solRk/solMargen", () => {
    const base = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(),
    });
    const shocked = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(),
      marketRisk: { riesgoTasa: 5_000_000, riesgoInflacion: 3_000_000 },
    });
    expect(base.solRMercado).toBe(0);
    expect(shocked.solRMercado).toBeGreaterThan(0);
    expect(shocked.solRk).toBeGreaterThan(base.solRk);
    expect(shocked.solMargen).toBeLessThan(base.solMargen);
    // Identity combination between Mercado and Suscripción (no correlation) — rBasico is the
    // Pythagorean sum, not a plain add, so it's strictly less than rMercado + rSusc whenever both are positive.
    const rBasico = shocked.solRk - shocked.solROp;
    expect(rBasico).toBeLessThan(shocked.solRMercado + shocked.solRSusc);
  });

  it("charges operational risk as the worse of a primas-based and a reservas-based rate", () => {
    // primaEmitida=500M×4%=20M vs. reserva(20M)×1.3%=260k — primas leg dominates here.
    const primasWins = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: null,
    });
    expect(primasWins.solROp).toBeCloseTo(FZ.opPctPrimas * 500_000_000, 4);

    // A tiny premium against a huge reserve flips which leg dominates.
    const reservasWins = finBench({
      year1: { totalPremium: 1_000_000, claimsAmount: 300_000_000 },
      liabilityYear1: { ...liabilityYear1, reserva: 5_000_000_000 },
      almYear1: null,
    });
    expect(reservasWins.solROp).toBeCloseTo(FZ.opPctReservas * 5_000_000_000, 4);
  });

  it("charges equity risk capital proportional to ACC exposure, and it folds into solRk/solMargen via solRMercado", () => {
    const input = (accBookValue2: number) => ({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(),
      accBookValue2,
    });
    const noAcc = finBench(input(0));
    const someAcc = finBench(input(100_000_000));
    expect(noAcc.solRAcciones).toBe(0);
    expect(someAcc.solRAcciones).toBeCloseTo(100_000_000 * 0.2, 4);
    expect(someAcc.solRMercado).toBeCloseTo(someAcc.solRAcciones, 4); // only nonzero market leg here
    expect(someAcc.solRk).toBeGreaterThan(noAcc.solRk);
    expect(someAcc.solMargen).toBeLessThan(noAcc.solMargen);
  });

  it("threads riesgoTasa/riesgoInflacion straight through from marketRisk, defaulting to 0 when absent", () => {
    const withRisk = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: null,
      marketRisk: { riesgoTasa: 12_345, riesgoInflacion: 6_789 },
    });
    expect(withRisk.riesgoTasa).toBe(12_345);
    expect(withRisk.riesgoInflacion).toBe(6_789);

    const withoutRisk = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: null,
    });
    expect(withoutRisk.riesgoTasa).toBe(0);
    expect(withoutRisk.riesgoInflacion).toBe(0);
  });

  it("erodes bal1's patrimonio by exactly Year 1's committed capital, and bal2's by Year 2's checkpoint", () => {
    const noErosion = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      year2: { totalPremium: 520_000_000, claimsAmount: 310_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(0),
      almYear2: fakeAlmYear(0),
    });
    const eroded = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      year2: { totalPremium: 520_000_000, claimsAmount: 310_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(10_000_000_000),
      almYear2: fakeAlmYear(25_000_000_000),
    });
    expect(noErosion.bal1.patrimonio - eroded.bal1.patrimonio).toBeCloseTo(10_000_000_000, 4);
    expect(noErosion.bal2!.patrimonio - eroded.bal2!.patrimonio).toBeCloseTo(25_000_000_000, 4);
    // The eroded patrimonio flows straight into solvency — same rk, lower
    // fondos propios, so a strictly worse margin.
    expect(eroded.solFp).toBeLessThan(noErosion.solFp);
    expect(eroded.solMargen).toBeLessThan(noErosion.solMargen);
  });

  it("projects Año 3's capital comprometido off the Año1->Año2 trend when no Año 3 ALM ran, instead of flat-carrying Año 2's checkpoint", () => {
    const noTrend = finBench({
      ...richYear3Input(),
      almYear1: fakeAlmYear(10_000_000_000),
      almYear2: fakeAlmYear(10_000_000_000, 2_718_281, 0.1, 0.07), // delta Y1->Y2 = 0
    });
    const trending = finBench({
      ...richYear3Input(),
      almYear1: fakeAlmYear(10_000_000_000),
      almYear2: fakeAlmYear(25_000_000_000, 2_718_281, 0.1, 0.07), // delta Y1->Y2 = 15B
    });
    // capitalComprometido never touches the P&L (see the "never double-counted" test above) —
    // p3.uneta is identical between the two scenarios, isolating the balance-sheet-only effect.
    expect(trending.p3!.uneta).toBeCloseTo(noTrend.p3!.uneta, 4);
    // capComY3 - capComY2, backed out from patrimonio (bal3.patrimonio = bal2.patrimonio + p3.uneta - (capComY3 - capComY2)).
    const projectedDelta = (b: typeof noTrend) => b.bal2!.patrimonio - b.bal3!.patrimonio + b.p3!.uneta;
    // No Y1->Y2 trend: Y3's committed capital stays at Y2's own checkpoint, same as the old flat-carry behavior.
    expect(projectedDelta(noTrend)).toBeCloseTo(0, 4);
    // 15B of Y1->Y2 erosion: Y3 continues that same trend, landing 15B beyond Y2's own checkpoint.
    expect(projectedDelta(trending)).toBeCloseTo(15_000_000_000, 4);
  });

  it("Balance Año 3 squares exactly through the inversiones plug when no Año 3 ALM ran — with no real fact of its own to respect, it solves for whatever closes Activos = Pasivo + Patrimonio", () => {
    // Same setup that used to break badly under both rejected approaches
    // (static Capital Social, and a patrimonio-delta carry-forward): a big
    // Año 1 book (large reservasTec) whose own reservas run off sharply by
    // Año 3 while new business collapses — real cash leaving the portfolio
    // to pay down reservas, with no matching patrimonio movement to signal
    // it (see finBench()'s doc comment on bal3).
    const shrinking = finBench({
      year1: { totalPremium: 250_000_000_000, claimsAmount: 338_000_000_000, insuredCount: 5000 },
      year2: { totalPremium: 24_000_000_000, claimsAmount: 15_000_000_000, insuredCount: 400 },
      liabilityYear1: { L: new Array(48).fill(0), payY1: new Array(12).fill(0), reserva: 291_000_000_000, hay: true },
      development: fakeDevelopment(),
      almYear1: fakeAlmYear(0, 23_000_000_000, 0.1, undefined, 0, 279_000_000_000),
      almYear2: fakeAlmYear(0, 24_000_000_000, 0.1, 0.1, 0, 169_000_000_000),
      year2Retention: { retainedCount: 300, newCount: 50 },
    });
    const b = shrinking.bal3!;
    const pasivoPatrim = b.reservasTec + b.rpnd + b.cxp + b.necesidadesPatrimonioODeuda + b.impuestoPorPagar + b.patrimonio;
    expect(b.activos).toBeCloseTo(pasivoPatrim, 4);

    // Same property holds for the well-behaved richYear3Input() fixture too.
    const bench = finBench({ ...richYear3Input(), almYear1: fakeAlmYear(), almYear2: fakeAlmYear(0, 2_718_281, 0.1, 0.07) });
    const b2 = bench.bal3!;
    const pasivoPatrim2 = b2.reservasTec + b2.rpnd + b2.cxp + b2.necesidadesPatrimonioODeuda + b2.impuestoPorPagar + b2.patrimonio;
    expect(b2.activos).toBeCloseTo(pasivoPatrim2, 4);
  });

  it("Año 3's ALM continuation drives rinv3 and the whole asset side of bal3 — and the sheet still closes exactly, with no plug", () => {
    // A fully self-consistent 3-year scenario, wired exactly the way
    // finBenchHelper.ts wires production: the same claim lists feed the
    // liability schedules, the development, AND the real ALM's monthly
    // payments, so nothing here is an arbitrary fixture number.
    const teamId = 1;
    const year1Claims = Array.from({ length: 120 }, (_, i) => ({ teamId, noticeMonth: i % 12, ultimate: 2_000_000_000 }));
    const year2Claims = Array.from({ length: 100 }, (_, i) => ({ teamId, noticeMonth: 12 + (i % 12), ultimate: 2_200_000_000 }));
    const liab1 = computeLiabilitySchedules(year1Claims.map((c) => ({ ...c, severity: c.ultimate })), [teamId]).get(teamId)!;
    const liab2 = computeLiabilitySchedules(year2Claims.map((c) => ({ ...c, severity: c.ultimate })), [teamId]).get(teamId)!;
    const development = computeDevelopment(year1Claims, year2Claims, [teamId]).byTeam.get(teamId)!;

    const decision: PortfolioDecisionV4 = {
      capitalSocialAllocation: { CDT90: 40, TES1: 30, TESUVR8: 30 },
      schedule: [{ month: 0, allocation: { LIQ: 20, CDT90: 40, TES1: 20, TESUVR8: 20 } }],
    };
    const totalPremium1 = 400_000_000_000;
    const totalPremium2 = 430_000_000_000;
    const insuredCount1 = 6000;
    const insuredCount2 = 5800;
    const year2Retention = { retainedCount: 4800, newCount: 1000 };

    const real1 = almSimRealYear(1, liab1.payY1, decision, totalPremium1 / 12)!;
    const claimsYear2 = liab1.L.slice(0, 12).map((v, i) => v + liab2.L[i]);
    const real2 = almSimRealYear(2, claimsYear2, decision, totalPremium2 / 12, real1.finalState, totalPremium1)!;

    const proj3 = projectYear3({
      year1InsuredCount: insuredCount1,
      year2InsuredCount: insuredCount2,
      year2PrimaEmitida: totalPremium2,
      year2Retention,
      claimCountY2: development.claimCountY2,
      ultY2: development.ultY2,
      osY1endY3: development.osY1endY3,
      osY2endY3: development.osY2endY3,
      paidY2inY2: development.paidY2inY2,
    })!;
    const claimsYear3 = proj3.ownClaimsSchedule12.map((own, i) => own + liab1.L[12 + i] + liab2.L[12 + i]);
    const real3 = almSimRealYear(3, claimsYear3, decision, proj3.prima3 / 12, real2.finalState, totalPremium2, 0)!;

    const toBench = (r: typeof real1) => ({
      portYield: r.portYield,
      income: r.income,
      capitalComprometido: r.capitalComprometidoAcumulado,
      effectiveYield: r.effectiveYield,
      cajaFinalAnio: r.cajaFinalAnio,
      portfolioBookValue: r.portfolioBookValue,
    });
    const bench = finBench({
      year1: { totalPremium: totalPremium1, claimsAmount: 120 * 2_000_000_000, insuredCount: insuredCount1 },
      year2: { totalPremium: totalPremium2, claimsAmount: development.ultY2, insuredCount: insuredCount2 },
      liabilityYear1: liab1,
      development,
      almYear1: toBench(real1),
      almYear2: toBench(real2),
      almYear3: toBench(real3),
      year2Retention,
    });

    // rinv3 is the projected year's own accrued income, not reservas × yield.
    expect(bench.p3!.rinv).toBeCloseTo(real3.income, 4);
    expect(bench.p3!.rinv).not.toBeCloseTo(bench.p3!.reservas * real2.effectiveYield, 0);
    // The asset side is the ALM's own, exactly like Año 1/Año 2 — no plug.
    expect(bench.bal3!.inversiones).toBeCloseTo(real3.portfolioBookValue, 4);
    expect(bench.bal3!.caja).toBeCloseTo(real3.cajaFinalAnio, 4);
    // And the sheet still closes on its own.
    for (const b of [bench.bal1, bench.bal2!, bench.bal3!]) {
      const pasivoPatrim = b.reservasTec + b.rpnd + b.cxp + b.necesidadesPatrimonioODeuda + b.impuestoPorPagar + b.patrimonio;
      expect(b.activos).toBeCloseTo(pasivoPatrim, 3);
    }
  });

  describe("la identidad contable cierra sin ninguna línea de cuadre", () => {
    /** Runs a fully self-consistent 3-year scenario end to end — same claim lists behind the liability schedules, the development AND the ALM's monthly payments, exactly like finBenchHelper.ts wires production. */
    function fullRun(o: {
      n1: number;
      sev1: number;
      n2: number;
      sev2: number;
      prem1: number;
      prem2: number;
      ins1: number;
      ins2: number;
      retained: number;
      nuevos: number;
      decision: PortfolioDecisionV4;
    }) {
      const t = 1;
      const y1 = Array.from({ length: o.n1 }, (_, i) => ({ teamId: t, noticeMonth: i % 12, ultimate: o.sev1 }));
      const y2 = Array.from({ length: o.n2 }, (_, i) => ({ teamId: t, noticeMonth: 12 + (i % 12), ultimate: o.sev2 }));
      const l1 = computeLiabilitySchedules(y1.map((c) => ({ ...c, severity: c.ultimate })), [t]).get(t)!;
      const l2 = computeLiabilitySchedules(y2.map((c) => ({ ...c, severity: c.ultimate })), [t]).get(t)!;
      const development = computeDevelopment(y1, y2, [t]).byTeam.get(t)!;
      const r1 = almSimRealYear(1, l1.payY1, o.decision, o.prem1 / 12)!;
      const r2 = almSimRealYear(2, l1.L.slice(0, 12).map((v, i) => v + l2.L[i]), o.decision, o.prem2 / 12, r1.finalState, o.prem1)!;
      const year2Retention = { retainedCount: o.retained, newCount: o.nuevos };
      const proj3 = projectYear3({
        year1InsuredCount: o.ins1,
        year2InsuredCount: o.ins2,
        year2PrimaEmitida: o.prem2,
        year2Retention,
        claimCountY2: development.claimCountY2,
        ultY2: development.ultY2,
        osY1endY3: development.osY1endY3,
        osY2endY3: development.osY2endY3,
        paidY2inY2: development.paidY2inY2,
      })!;
      const claims3 = proj3.ownClaimsSchedule12.map((own, i) => own + l1.L[12 + i] + l2.L[12 + i]);
      const r3 = almSimRealYear(3, claims3, o.decision, proj3.prima3 / 12, r2.finalState, o.prem2, 0)!;
      const toBench = (r: typeof r1) => ({
        portYield: r.portYield,
        income: r.income,
        capitalComprometido: r.capitalComprometidoAcumulado,
        effectiveYield: r.effectiveYield,
        cajaFinalAnio: r.cajaFinalAnio,
        portfolioBookValue: r.portfolioBookValue,
      });
      const bench = finBench({
        year1: { totalPremium: o.prem1, claimsAmount: o.n1 * o.sev1, insuredCount: o.ins1 },
        year2: { totalPremium: o.prem2, claimsAmount: development.ultY2, insuredCount: o.ins2 },
        liabilityYear1: l1,
        development,
        almYear1: toBench(r1),
        almYear2: toBench(r2),
        almYear3: toBench(r3),
        year2Retention,
      });
      return { bench, r1, r2, r3 };
    }

    const gap = (b: { activos: number; reservasTec: number; rpnd: number; cxp: number; necesidadesPatrimonioODeuda: number; impuestoPorPagar: number; patrimonio: number }) =>
      b.activos - (b.reservasTec + b.rpnd + b.cxp + b.necesidadesPatrimonioODeuda + b.impuestoPorPagar + b.patrimonio);

    const mixto: PortfolioDecisionV4 = {
      capitalSocialAllocation: { CDT90: 40, TES1: 30, TESUVR8: 30 },
      schedule: [{ month: 0, allocation: { LIQ: 20, CDT90: 40, TES1: 20, TESUVR8: 20 } }],
    };
    const largoPlazo: PortfolioDecisionV4 = {
      capitalSocialAllocation: { TES3: 60, TESUVR8: 40 },
      schedule: [{ month: 0, allocation: { TES3: 60, TESUVR8: 40 } }],
    };
    const todoAcciones: PortfolioDecisionV4 = { capitalSocialAllocation: { ACC: 100 }, schedule: [{ month: 0, allocation: { ACC: 100 } }] };
    const todoLiq: PortfolioDecisionV4 = { capitalSocialAllocation: { LIQ: 100 }, schedule: [{ month: 0, allocation: { LIQ: 100 } }] };

    const base = { n1: 120, sev1: 2e9, n2: 100, sev2: 2.2e9, prem1: 4e11, prem2: 4.3e11, ins1: 6000, ins2: 5800, retained: 4800, nuevos: 1000, decision: mixto };
    const scenarios: [string, Parameters<typeof fullRun>[0]][] = [
      ["cartera y portafolio mixtos", base],
      ["sin siniestros que pagar", { ...base, n1: 0, sev1: 0, n2: 1, sev2: 1e6 }],
      // Los dos casos que rompían las aproximaciones descartadas: una cartera
      // que se encoge (reserva grande drenándose contra negocio nuevo que
      // colapsa) y un portafolio todo a largo plazo, que obliga a vender
      // antes de tiempo para pagar siniestros.
      ["cartera que se encoge", { ...base, n1: 200, n2: 20, prem2: 3e10, ins2: 500, retained: 400, nuevos: 60 }],
      ["todo a largo plazo (venta forzada)", { ...base, n1: 150, n2: 140, prem1: 3e11, prem2: 3.2e11, decision: largoPlazo }],
      ["todo en acciones", { ...base, decision: todoAcciones }],
      ["todo en liquidez", { ...base, decision: todoLiq }],
      ["crecimiento fuerte", { ...base, n1: 50, sev1: 1e9, n2: 200, prem1: 1e11, prem2: 6e11, ins1: 2000, ins2: 9000, retained: 1800, nuevos: 7200 }],
    ];

    it.each(scenarios)("Activos = Pasivo + Patrimonio, exacto, en los tres balances — %s", (_name, o) => {
      const { bench, r3 } = fullRun(o);
      // Mientras al portafolio le quede valor en libros, cualquier capital
      // comprometido ya está embebido en un `inversiones` más bajo y cancela
      // exactamente contra su propia resta en patrimonio — la identidad cierra
      // igual. El único caso que la rompe es el portafolio agotado a cero (ver
      // el test siguiente).
      expect(r3.portfolioBookValue).toBeGreaterThan(0);
      for (const b of [bench.bal1, bench.bal2!, bench.bal3!]) {
        // Relativo, no absoluto: son cifras de cientos de miles de millones,
        // así que 1e-9 de error relativo ya es exactitud de punto flotante.
        expect(Math.abs(gap(b)) / b.activos).toBeLessThan(1e-9);
      }
    });

    it("cierra también cuando el equipo agota su portafolio real y patrimonio queda muy negativo", () => {
      // Siniestralidad de ~400% sobre la prima: el portafolio entero (Capital
      // Social incluido) se agota. El patrimonio ya está muy negativo por las
      // pérdidas acumuladas (retenido) antes siquiera de tocar
      // capitalComprometido — absorbidoPorPatrimonio no tiene nada que
      // absorber (patrimonioAntesDeComprometer ya es negativo), así que todo
      // el capitalComprometido entra completo como necesidadesPatrimonioODeuda,
      // y el balance sigue cerrando exacto.
      const { bench, r2, r3 } = fullRun({ ...base, n1: 400, n2: 380, sev2: 2.4e9, prem1: 2e11, prem2: 2e11, decision: largoPlazo });
      expect(r2.capitalComprometidoAcumulado).toBeGreaterThan(0);
      expect(r3.capitalComprometidoAcumulado).toBeGreaterThan(0);
      expect(r3.portfolioBookValue).toBe(0); // agotado: `inversiones` ya no puede bajar más
      expect(bench.bal3!.patrimonio).toBeLessThan(0);
      for (const b of [bench.bal1, bench.bal2!, bench.bal3!]) {
        expect(Math.abs(gap(b)) / Math.abs(b.activos)).toBeLessThan(1e-9);
      }
    });
  });

  it("impuestoPorPagar equals this year's own Impuesto — a standard 'tax payable' liability, same treatment rpnd/cxp already get for their own accrual-vs-cash gap", () => {
    const bench = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 200_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(),
    });
    expect(bench.bal1.impuestoPorPagar).toBeCloseTo(bench.p1.imp, 6);
  });

  it("bal2.impuestoPorPagar is CUMULATIVE (p1.imp + p2.imp), not just Año 2's own — Año 1's tax bill is exactly as unpaid at Año 2's close as it was at its own, since the real ALM never models a tax payment in any year", () => {
    const bench = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 100_000_000, insuredCount: 1000 },
      year2: { totalPremium: 520_000_000, claimsAmount: 110_000_000, insuredCount: 1000 },
      liabilityYear1,
      development: fakeDevelopment(),
      almYear1: fakeAlmYear(),
      almYear2: fakeAlmYear(0, 2_718_281, 0.1, 0.07),
    });
    expect(bench.p1.imp).toBeGreaterThan(0);
    expect(bench.bal2!.impuestoPorPagar).toBeCloseTo(bench.p1.imp + bench.p2!.imp, 4);
  });

  it("Balance Año 1/2 closes Activos = Pasivo + Patrimonio EXACTLY against a genuine almSimRealYear() run, not just the ~1-2% documented residual — the cxc/cxp holdback in almSimRealYear() plus cumulative impuestoPorPagar together account for the whole gap", () => {
    const decision: PortfolioDecisionV4 = {
      capitalSocialAllocation: { CDT90: 40, TES1: 30, TESUVR8: 30 },
      schedule: [{ month: 0, allocation: { LIQ: 20, CDT90: 40, TES1: 20, TESUVR8: 20 } }],
    };
    const totalPremium1 = 500_000_000;
    const totalPremium2 = 520_000_000;
    const U1 = 250_000_000;
    const U2 = 260_000_000;
    const reserva1 = U1 * 0.5;
    const payY1 = new Array(12).fill((U1 * 0.5) / 12);
    // Año 2's own claims payment schedule = Año 1's tail (fully paid off,
    // matching reserva1) plus Año 2's own new claims — mirrors how
    // finBenchHelper.ts actually wires production claims into Año 2.
    const claimsYear2 = new Array(12).fill((U2 * 0.5) / 12 + reserva1 / 12);

    const real1 = almSimRealYear(1, payY1, decision, totalPremium1 / 12)!;
    const real2 = almSimRealYear(2, claimsYear2, decision, totalPremium2 / 12, real1.finalState, totalPremium1)!;

    const bench = finBench({
      year1: { totalPremium: totalPremium1, claimsAmount: U1, insuredCount: 1000 },
      year2: { totalPremium: totalPremium2, claimsAmount: U2, insuredCount: 1000 },
      liabilityYear1: { L: new Array(48).fill(0), payY1, reserva: reserva1, hay: true },
      almYear1: {
        portYield: real1.portYield,
        income: real1.income,
        capitalComprometido: real1.capitalComprometidoAcumulado,
        cajaFinalAnio: real1.cajaFinalAnio,
        portfolioBookValue: real1.portfolioBookValue,
      },
      almYear2: {
        portYield: real2.portYield,
        income: real2.income,
        capitalComprometido: real2.capitalComprometidoAcumulado,
        effectiveYield: real2.effectiveYield,
        cajaFinalAnio: real2.cajaFinalAnio,
        portfolioBookValue: real2.portfolioBookValue,
      },
      // No `development` — uses finBench()'s ratio-based reservas2 fallback,
      // self-consistent with claimsYear2's own 50% payment pattern above.
    });

    for (const b of [bench.bal1, bench.bal2!]) {
      const pasivoPatrim = b.reservasTec + b.rpnd + b.cxp + b.necesidadesPatrimonioODeuda + b.impuestoPorPagar + b.patrimonio;
      expect(b.activos).toBeCloseTo(pasivoPatrim, 3);
    }
  });

  it("impuestoPorPagar shrinks the Activos-vs-Pasivo+Patrimonio gap by exactly that year's own unpaid tax bill, compared to the old formula that omitted it", () => {
    // Not asserting the gap lands near zero here: that identity only holds
    // when caja/inversiones genuinely derive from this scenario's own
    // primaEmitida/costo/gastos via the real ALM cash flow (verified against
    // the live cohort instead — see finBench()'s doc comment on balance());
    // fakeAlmYear()'s income/portfolioBookValue are arbitrary fixture
    // constants, not derived from this fixture's own P&G. What's fixture-
    // independent, and what this asserts, is the pure algebraic effect of
    // adding impuestoPorPagar to pasivo: it must shift the gap by exactly
    // -impuestoPorPagar relative to the old (pre-fix) formula, for any bench.
    const bench = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 200_000_000, insuredCount: 1000 },
      year2: { totalPremium: 520_000_000, claimsAmount: 210_000_000, insuredCount: 1000 },
      liabilityYear1,
      development: fakeDevelopment(),
      almYear1: fakeAlmYear(),
      almYear2: fakeAlmYear(0, 2_718_281, 0.1, 0.07),
    });
    for (const b of [bench.bal1, bench.bal2!]) {
      const oldPasivoPatrim = b.reservasTec + b.rpnd + b.cxp + b.patrimonio;
      const newPasivoPatrim = oldPasivoPatrim + b.impuestoPorPagar;
      const oldGap = b.activos - oldPasivoPatrim;
      const newGap = b.activos - newPasivoPatrim;
      expect(oldGap - newGap).toBeCloseTo(b.impuestoPorPagar, 4);
    }
  });

  it("every team starts capital0 from the same fixed Capital Social, independent of its own premium", () => {
    const smallPremium = finBench({
      year1: { totalPremium: 100_000_000, claimsAmount: 60_000_000 },
      liabilityYear1,
      almYear1: null,
    });
    const bigPremium = finBench({
      year1: { totalPremium: 900_000_000, claimsAmount: 540_000_000 },
      liabilityYear1,
      almYear1: null,
    });
    // Same starting equity before retained earnings diverge it — patrimonio
    // - uneta isolates capital0 itself.
    expect(smallPremium.bal1.patrimonio - smallPremium.p1.uneta).toBeCloseTo(bigPremium.bal1.patrimonio - bigPremium.p1.uneta, 4);
  });

  it("rinv1/rinv2 (P&G 'Resultado de inversiones') are the ALM's real simulated income for that year, not reserva×portYield", () => {
    const bench = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      year2: { totalPremium: 520_000_000, claimsAmount: 310_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(0, 3_141_592),
      almYear2: fakeAlmYear(0, 2_718_281),
    });
    expect(bench.p1.rinv).toBe(3_141_592);
    // Deliberately not reserva*portYield (20_000_000*0.1=2_000_000) — if it
    // were, this would fail, which is exactly the point.
    expect(bench.p1.rinv).not.toBeCloseTo(20_000_000 * 0.1, 0);
    expect(bench.p2!.rinv).toBe(2_718_281);
  });

  it("capital comprometido never affects rinv/uai — it only reduces patrimonio directly, so it's never double-counted", () => {
    const noErosion = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(0),
    });
    const heavilyEroded = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(50_000_000_000),
    });
    expect(heavilyEroded.p1.rinv).toBe(noErosion.p1.rinv);
    expect(heavilyEroded.p1.uai).toBe(noErosion.p1.uai);
    expect(heavilyEroded.p1.uneta).toBe(noErosion.p1.uneta);
    // The erosion still shows up — just on the balance sheet, not the P&L.
    expect(heavilyEroded.bal1.patrimonio).toBeLessThan(noErosion.bal1.patrimonio);
  });

  describe("Prima Emitida vs. Prima Devengada (RPND roll-forward)", () => {
    it("Año 1 has nothing to release, so primaDevengada is exactly 80% of primaEmitida", () => {
      const bench = finBench({
        year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
        liabilityYear1,
        almYear1: null,
      });
      expect(bench.p1.rpndLiberada).toBe(0);
      expect(bench.p1.rpndConstituida).toBeCloseTo(0.2 * 500_000_000, 6);
      expect(bench.p1.primaDevengada).toBeCloseTo(0.8 * 500_000_000, 6);
    });

    it("Año 2 releases Año 1's own RPND — primaDevengada is a genuine roll-forward, not a flat 80% of Año 2's own emitida, once premium changes year over year", () => {
      const bench = finBench({
        year1: { totalPremium: 400_000_000, claimsAmount: 200_000_000 },
        year2: { totalPremium: 600_000_000, claimsAmount: 250_000_000 },
        liabilityYear1,
        almYear1: null,
      });
      const flat80PctOfYear2 = 0.8 * 600_000_000;
      const expectedDevengada2 = 600_000_000 - 0.2 * 600_000_000 + 0.2 * 400_000_000;
      expect(bench.p2!.rpndLiberada).toBeCloseTo(0.2 * 400_000_000, 6);
      expect(bench.p2!.primaDevengada).toBeCloseTo(expectedDevengada2, 6);
      // devengada = 0.8×emitida(year) + 0.2×emitida(year−1) — always above a
      // flat 80%-of-this-year's-own-emitida by exactly 0.2×the prior year's
      // emitida (never 0 as long as some premium was collected the year
      // before), regardless of whether premium grew or shrank.
      expect(bench.p2!.primaDevengada).not.toBeCloseTo(flat80PctOfYear2, 0);
      expect(bench.p2!.primaDevengada - flat80PctOfYear2).toBeCloseTo(0.2 * 400_000_000, 6);
    });

    it("Año 3's projection also releases Año 2's RPND (rich path)", () => {
      const bench = finBench(richYear3Input());
      expect(bench.p3!.rpndLiberada).toBeCloseTo(0.2 * bench.p2!.primaEmitida, 6);
      const expectedDevengada3 = bench.p3!.primaEmitida - 0.2 * bench.p3!.primaEmitida + bench.p3!.rpndLiberada;
      expect(bench.p3!.primaDevengada).toBeCloseTo(expectedDevengada3, 4);
    });
  });

  describe("Costo de siniestros stays on an accident-year basis (no prior-year development mixed in)", () => {
    it("Año 2's costo is exactly its own accident-year ultimate (development.ultY2), never mixed with Año 1's tail", () => {
      const dev = fakeDevelopment();
      const bench = finBench(richYear3Input());
      expect(bench.p2!.costo).toBeCloseTo(dev.ultY2, 6);
    });

    it("rt is a uniform formula for every year (primaDevengada − costo − ajusteSiniestralidad − gadq − gcom) — there's no separate 'desarrollo' term inside the true bench P&G", () => {
      const bench = finBench(richYear3Input());
      for (const p of [bench.p1, bench.p2!, bench.p3!]) {
        expect(p.rt).toBeCloseTo(p.primaDevengada - p.costo - p.ajusteSiniestralidad - p.gadq - p.gcom, 6);
      }
    });

    it("ajusteSiniestralidad is 0 for Año 1 and Año 3 — only Año 2 carries the one-time release", () => {
      const bench = finBench(richYear3Input());
      expect(bench.p1.ajusteSiniestralidad).toBe(0);
      expect(bench.p3!.ajusteSiniestralidad).toBe(0);
    });

    it("reservas1 (feeding bal1.reservasTec) is always liabilityYear1.reserva — the true unpaid ultimate — never a market-wide estimate, whether or not Año 2's development has been computed yet", () => {
      const withoutDevelopment = finBench({
        year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
        liabilityYear1,
        almYear1: null,
      });
      const withDevelopment = finBench(richYear3Input());
      expect(withoutDevelopment.resTotal).toBeCloseTo(liabilityYear1.reserva, 6);
      expect(withDevelopment.resTotal).toBeCloseTo(liabilityYear1.reserva, 6);
    });

    it("Año 3's projected costo is only its own new accident-year claims — no prior-year development tails added in", () => {
      const input = richYear3Input();
      const dev = fakeDevelopment();
      const bench = finBench(input);
      const retentionRate = input.year2Retention!.retainedCount / input.year1.insuredCount!;
      const insuredCount3 = retentionRate * input.year2!.insuredCount! + input.year2Retention!.newCount;
      const frecuencia2 = dev.claimCountY2 / input.year2!.insuredCount!;
      const severidad2 = dev.ultY2 / dev.claimCountY2;
      const severidad3 = severidad2 * 1.09; // CLAIMS_INFLATION_ANNUAL
      const expectedCosto3 = insuredCount3 * frecuencia2 * severidad3;
      expect(bench.p3!.costo).toBeCloseTo(expectedCosto3, 0);
      // The old (wrong) formula would have added both prior-year tails —
      // confirm the actual result is strictly less than that.
      expect(bench.p3!.costo).toBeLessThan(expectedCosto3 + dev.devTailY1InY3 + dev.devTailY2InY3);
    });
  });

  describe("Ajuste de siniestralidad (Año 2) is a real event, not just a reporting line", () => {
    it("is exactly -FZ.sevRevisionA1Pct × Año 1's own remaining share of the reserve at Año 2's close (osY1endY2, not the full 2027 closing reserve), and raises p2.rt by exactly that magnitude", () => {
      const dev = fakeDevelopment();
      const bench = finBench(richYear3Input());
      const expectedAjuste = -FZ.sevRevisionA1Pct * dev.osY1endY2;
      expect(bench.p2!.ajusteSiniestralidad).toBeCloseTo(expectedAjuste, 6);

      const rtWithoutAjuste = bench.p2!.primaDevengada - bench.p2!.costo - bench.p2!.gadq - bench.p2!.gcom;
      expect(bench.p2!.rt).toBeCloseTo(rtWithoutAjuste - expectedAjuste, 6);
    });

    it("reduces bal2.reservasTec by exactly the same amount it raises rt — the release isn't just reported, the liability genuinely shrinks", () => {
      const dev = fakeDevelopment();
      const bench = finBench(richYear3Input());
      const expectedAjuste = -FZ.sevRevisionA1Pct * dev.osY1endY2;
      expect(bench.bal2!.reservasTec).toBeCloseTo(dev.reservaFinY2 + expectedAjuste, 6);
    });

    it("never drives reservas2 negative even when the release would exceed Año 1's full 2027 closing reserve, because it's based on what's left at Año 2's close instead", () => {
      const dev = fakeDevelopment();
      const bench = finBench(richYear3Input());
      // Sanity check on the fixture itself: osY1endY2 is a strict subset of
      // Año 1's much larger 2027 closing reserve (most of it already paid
      // down by Año 2's close) — exactly the gap that used to risk a
      // negative reserve when the release was based on the 2027 figure.
      expect(dev.osY1endY2).toBeLessThan(liabilityYear1.reserva);
      expect(bench.bal2!.reservasTec).toBeGreaterThanOrEqual(0);
    });

    it("carries forward into bal3.reservasTec, capped at what's actually still outstanding of Año 1's origin by Año 3's own close (osY1endY3) — never the raw Año 2 dollar amount unconditionally", () => {
      const input = richYear3Input();
      const bench = finBench(input);
      const dev = input.development!;
      const releaseY2 = FZ.sevRevisionA1Pct * dev.osY1endY2;
      const releaseCarriedToY3 = Math.min(releaseY2, dev.osY1endY3);
      const proj3 = projectYear3({
        year1InsuredCount: input.year1.insuredCount!,
        year2InsuredCount: input.year2!.insuredCount!,
        year2PrimaEmitida: bench.p2!.primaEmitida,
        year2Retention: input.year2Retention!,
        claimCountY2: dev.claimCountY2,
        ultY2: dev.ultY2,
        osY1endY3: dev.osY1endY3,
        osY2endY3: dev.osY2endY3,
        paidY2inY2: dev.paidY2inY2,
      })!;
      expect(bench.bal3!.reservasTec).toBeCloseTo(proj3.reservas3 - releaseCarriedToY3, 6);
      expect(bench.bal3!.reservasTec).toBeGreaterThanOrEqual(0);
    });

    it("never appears for Año 1 or Año 3's own P&G — only Año 2 gets a new release event, even though its Balance effect persists", () => {
      const bench = finBench(richYear3Input());
      expect(bench.p1.ajusteSiniestralidad).toBe(0);
      expect(bench.p3!.ajusteSiniestralidad).toBe(0);
    });

    // Exact Activos = Pasivo + Patrimonio closure with the ajuste applied is
    // already covered end-to-end by the "identidad contable cierra" suite
    // below, which runs against genuine almSimRealYear() fixtures — this
    // file's richYear3Input() uses a hand-rolled fake AlmYearBenchInput, not
    // a real ALM run, so it carries its own small residual unrelated to this
    // feature (see this file's other closure tests' own doc comments).
  });

  describe("RT / RI split", () => {
    it("ri = rt − gadm, and uai = ri + rinv (not rt + rinv)", () => {
      const bench = finBench({
        year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
        liabilityYear1,
        almYear1: fakeAlmYear(0, 3_000_000),
      });
      expect(bench.p1.ri).toBeCloseTo(bench.p1.rt - bench.p1.gadm, 6);
      expect(bench.p1.uai).toBeCloseTo(bench.p1.ri + bench.p1.rinv, 6);
      expect(bench.p1.uai).not.toBeCloseTo(bench.p1.rt + bench.p1.rinv, 6);
    });
  });

  describe("Honorarios de la consultora (Tercerizar tarifas)", () => {
    const base = {
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(0, 3_000_000),
    };

    it("rides inside gastos de adquisición — no P&G line of its own", () => {
      const own = finBench(base);
      const outsourced = finBench({ ...base, outsourcedYear1: true });
      expect(own.p1.gadq).toBeCloseTo(FZ.gAdq * 500_000_000, 6);
      expect(outsourced.p1.gadq).toBeCloseTo((FZ.gAdq + OUTSOURCED_CONSULTING_FEE_PCT) * 500_000_000, 6);
      // Every other expense line is untouched.
      expect(outsourced.p1.gcom).toBeCloseTo(own.p1.gcom, 6);
      expect(outsourced.p1.gadm).toBeCloseTo(own.p1.gadm, 6);
    });

    it("lands inside RT, so it costs the team its technical result too", () => {
      const own = finBench(base);
      const outsourced = finBench({ ...base, outsourcedYear1: true });
      const fee = OUTSOURCED_CONSULTING_FEE_PCT * 500_000_000;
      expect(outsourced.p1.rt).toBeCloseTo(own.p1.rt - fee, 6);
      expect(outsourced.p1.ri).toBeCloseTo(outsourced.p1.rt - outsourced.p1.gadm, 6);
    });

    it("matches computeRt(), the shared RT definition used for the tariff score", () => {
      const outsourced = finBench({ ...base, outsourcedYear1: true });
      expect(
        computeRt({ totalPremium: 500_000_000, claimsAmount: 300_000_000, acquisitionFeePct: OUTSOURCED_CONSULTING_FEE_PCT })
      ).toBeCloseTo(outsourced.p1.rt, 6);
    });

    it("is charged per year — outsourcing Año 1 doesn't charge Año 2", () => {
      const bench = finBench({ ...base, outsourcedYear1: true });
      expect(bench.p1.gadq).toBeCloseTo((FZ.gAdq + OUTSOURCED_CONSULTING_FEE_PCT) * 500_000_000, 6);
      expect(finBench(base).p1.gadq).toBeCloseTo(FZ.gAdq * 500_000_000, 6);
    });
  });

  describe("Reserva de Prima No Devengada (RPND) on the Balance", () => {
    it("bal.rpnd equals that year's own P&G rpndConstituida", () => {
      const bench = finBench({
        year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
        liabilityYear1,
        almYear1: fakeAlmYear(0, 3_000_000),
      });
      expect(bench.bal1.rpnd).toBeCloseTo(bench.p1.rpndConstituida, 6);
    });
  });

  describe("Inversiones is a real fact (ALM + Capital Social, genuinely invested), not a balancing residual", () => {
    it("inversiones equals the real ALM's own portfolioBookValue directly — no separate Capital Social term added on top (it's already inside portfolioBookValue, see almSimRealYear())", () => {
      const bench = finBench({
        year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
        liabilityYear1,
        almYear1: fakeAlmYear(0, 3_000_000, 0.1, undefined, 0, 259_453_712),
      });
      expect(bench.bal1.inversiones).toBeCloseTo(259_453_712, 0);
    });

    it("capital comprometido is subtracted exactly once, from patrimonio (equity side) — inversiones no longer double-subtracts it (balance() trusts portfolioBookValue as-is; it's almSimRealYear()'s job to have already reflected any liquidation there)", () => {
      const noErosion = finBench({
        year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
        liabilityYear1,
        almYear1: fakeAlmYear(0, 3_000_000, 0.1, undefined, 0, 200_000_000),
      });
      const eroded = finBench({
        year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
        liabilityYear1,
        almYear1: fakeAlmYear(10_000_000_000, 3_000_000, 0.1, undefined, 0, 200_000_000),
      });
      expect(eroded.bal1.inversiones).toBe(noErosion.bal1.inversiones);
      expect(noErosion.bal1.patrimonio - eroded.bal1.patrimonio).toBeCloseTo(10_000_000_000, 0);
    });

    it("patrimonio can go negative purely from retenido (accumulated losses), no floor and no separate liability line involved — that's genuinely different from capitalComprometido, which does still get the absorbidoPorPatrimonio/necesidadesPatrimonioODeuda split", () => {
      const year1 = { totalPremium: 500_000_000, claimsAmount: 900_000_000_000 };
      // Pure accrued losses, zero capitalComprometido.
      const soloRetenido = finBench({ year1, liabilityYear1, almYear1: fakeAlmYear(0, 3_000_000, 0.1, undefined, 7_750_000, 259_453_712) });
      expect(soloRetenido.bal1.patrimonio).toBeCloseTo(CAPITAL_SOCIAL + soloRetenido.p1.uneta, 4);
      expect(soloRetenido.bal1.patrimonio).toBeLessThan(0);
      expect(soloRetenido.bal1.necesidadesPatrimonioODeuda).toBe(0);

      // capitalComprometido on top of an already-negative patrimonio doesn't
      // drag patrimonio down further (absorbidoPorPatrimonio has nothing left
      // to absorb) — it flows entirely into necesidadesPatrimonioODeuda
      // instead, unchanged from before this whole line of investigation.
      const conCapitalComprometido = finBench({ year1, liabilityYear1, almYear1: fakeAlmYear(40_000_000_000, 3_000_000, 0.1, undefined, 7_750_000, 259_453_712) });
      expect(conCapitalComprometido.bal1.patrimonio).toBeCloseTo(soloRetenido.bal1.patrimonio, 4);
      expect(conCapitalComprometido.bal1.necesidadesPatrimonioODeuda).toBeCloseTo(40_000_000_000, 4);
    });

    it("falls back to a Capital-Social-only inversiones (never invested) only when there's no real ALM decision at all", () => {
      const bench = finBench({
        year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
        liabilityYear1,
        almYear1: null,
      });
      expect(bench.bal1.caja).toBeCloseTo(FZ.cajaPct * 500_000_000, 6);
      expect(bench.bal1.inversiones).toBeCloseTo(CAPITAL_SOCIAL, 0);
    });
  });

  describe("solSigmaLR (Día 4's own siniestralidad/prima volatility, replacing the old flat FZ.primeVol in rPrimas)", () => {
    it("is the sample stdev (n-1) of true costo/primaDevengada across Año 1/2/3 once all three years exist", () => {
      const bench = finBench(richYear3Input());
      const ratios = [bench.p1.costo / bench.p1.primaDevengada, bench.p2!.costo / bench.p2!.primaDevengada, bench.p3!.costo / bench.p3!.primaDevengada];
      const mean = ratios.reduce((a, b) => a + b, 0) / 3;
      const variance = ratios.reduce((s, r) => s + (r - mean) ** 2, 0) / 2;
      expect(bench.solSigmaLR).toBeCloseTo(Math.sqrt(variance), 10);
      // With a real solSigmaLR feeding rPrimas, the true RK is no longer pinned to the old flat FZ.primeVol.
      expect(bench.solSigmaLR).not.toBeCloseTo(FZ.primeVol, 4);
    });

    it("falls back to the flat FZ.primeVol when Año 2/3 data doesn't exist yet (finBench() called with only Año 1, e.g. Día 2 grading)", () => {
      const bench = finBench({
        year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
        liabilityYear1,
        almYear1: null,
      });
      expect(bench.solSigmaLR).toBe(FZ.primeVol);
    });
  });
});
