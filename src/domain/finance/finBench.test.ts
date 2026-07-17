import { describe, expect, it } from "vitest";
import { finBench } from "./finBench";
import type { AlmYearBenchInput, FinBenchInput } from "./finBench";
import type { LiabilitySchedule } from "../reserving/liability";
import { computeDevelopment } from "../reserving/development";

const liabilityYear1: LiabilitySchedule = {
  L: new Array(48).fill(0),
  payY1: new Array(12).fill(0),
  reserva: 20_000_000,
  hay: true,
};

function fakeAlmYear(
  avgVol: number,
  capitalComprometido = 0,
  income = 2_000_000,
  portYield = 0.1,
  effectiveYield?: number,
  concentrationRatio = 0
): AlmYearBenchInput {
  return { portYield, income, capitalComprometido, avgVol, concentrationRatio, effectiveYield };
}

/** A realistic Año1(100 claims)/Año2(80 claims) development schedule, for exercising finBench()'s Año3 "rich data" path. All of team 1's Año-1 claims are reported within Año 1 itself here, which — with only one team in the market — makes `development.development` come out exactly 0 (the "market-wide" factor always exactly retrodicts a single team's own experience). Fine for the Año3-projection tests below, which don't depend on that value; see fakeDevelopmentWithGap() for a fixture that exercises a genuine nonzero development gap. */
function fakeDevelopment() {
  const year1Claims = Array.from({ length: 100 }, (_, i) => ({ teamId: 1, noticeMonth: i % 12, ultimate: 1_000_000 }));
  const year2Claims = Array.from({ length: 80 }, (_, i) => ({ teamId: 1, noticeMonth: 12 + (i % 12), ultimate: 1_000_000 }));
  return computeDevelopment(year1Claims, year2Claims, [1]).byTeam.get(1)!;
}

/**
 * A second team (team 2, all claims reported within Año 1) sets a
 * "healthier" market-wide reporting factor than team 1's own experience (30
 * of team 1's 100 Año-1 claims report late) — the only way to get a
 * genuinely nonzero `development.development`: with just one team in the
 * market, that team's own late-reporting rate always exactly equals the
 * "market-wide" factor derived from itself, so `development` comes out
 * exactly 0 by construction (see fakeDevelopment()'s doc comment).
 */
function fakeDevelopmentWithGap() {
  const team1Y1 = [
    ...Array.from({ length: 70 }, (_, i) => ({ teamId: 1, noticeMonth: i % 12, ultimate: 1_000_000 })),
    ...Array.from({ length: 30 }, (_, i) => ({ teamId: 1, noticeMonth: 12 + (i % 6), ultimate: 1_000_000 })),
  ];
  const team2Y1 = Array.from({ length: 100 }, (_, i) => ({ teamId: 2, noticeMonth: i % 12, ultimate: 1_000_000 }));
  const year1Claims = [...team1Y1, ...team2Y1];
  const year2Claims = Array.from({ length: 80 }, (_, i) => ({ teamId: 1, noticeMonth: 12 + (i % 12), ultimate: 1_000_000 }));
  return computeDevelopment(year1Claims, year2Claims, [1]).byTeam.get(1)!;
}

const richYear3Input = (): FinBenchInput => ({
  year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000, insuredCount: 1000 },
  year2: { totalPremium: 520_000_000, claimsAmount: 310_000_000, insuredCount: 1000 },
  liabilityYear1,
  development: fakeDevelopment(),
  almYear1: fakeAlmYear(0.05),
  almYear2: fakeAlmYear(0.05, 0, 2_718_281, 0.1, 0.07),
  year2Retention: { retainedCount: 800, newCount: 200 },
});

const gapDevelopmentInput = (): FinBenchInput => ({
  year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000, insuredCount: 1000 },
  year2: { totalPremium: 520_000_000, claimsAmount: 310_000_000, insuredCount: 1000 },
  liabilityYear1,
  development: fakeDevelopmentWithGap(),
  almYear1: fakeAlmYear(0.05),
  almYear2: fakeAlmYear(0.05, 0, 2_718_281, 0.1, 0.07),
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

  it("decouples Year 3's loss ratio from Year 2's when real development + retention data is supplied", () => {
    const bench = finBench(richYear3Input());
    expect(bench.p3).not.toBeNull();

    const lr2 = bench.p2!.costo / bench.p2!.primaEmitida;
    const lr3 = bench.p3!.costo / bench.p3!.primaEmitida;
    // No longer pinned equal by construction (the flat-growth fallback would
    // make these identical) — the rich path derives costo from real
    // development tails + an independently-projected own-year piece.
    expect(lr3).not.toBeCloseTo(lr2, 6);
    // Also no longer the old flat-6%-on-everything fallback.
    expect(bench.p3!.primaEmitida).not.toBeCloseTo(bench.p2!.primaEmitida * 1.06, 0);
  });

  it("projects Year 3 prima from retained + new policies, not a flat growth rate", () => {
    const input = richYear3Input();
    const bench = finBench(input);
    // retained = 800/1000 (retention rate) * 1000 (Año2 insured) = 800; + 200 new = 1000 policies,
    // at Año2's average premium per policy (520_000_000 / 1000 = 520_000).
    const expectedPrima3 = (0.8 * 1000 + 200) * (520_000_000 / 1000);
    expect(bench.p3!.primaEmitida).toBeCloseTo(expectedPrima3, 0);
  });

  it("uses Año2's realized effectiveYield for rinv3, not the tree's nominal portYield", () => {
    const withEffective = finBench(richYear3Input());
    const input2 = richYear3Input();
    input2.almYear2 = fakeAlmYear(0.05, 0, 2_718_281, 0.1, undefined); // no effectiveYield -> falls back to portYield
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

  it("charges more financial risk capital for a team whose ALM decision was materially more volatile", () => {
    const input = (avgVol: number) => ({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(avgVol),
    });
    const safe = finBench(input(0.01)); // near LIQ's own volatility
    const volatile = finBench(input(0.2)); // near ACC's own volatility
    expect(volatile.solRFin).toBeGreaterThan(safe.solRFin);
    expect(volatile.solRk).toBeGreaterThan(safe.solRk);
    expect(volatile.solMargen).toBeLessThan(safe.solMargen);
    expect(volatile.solVolRatio).toBeGreaterThan(safe.solVolRatio);
  });

  it("falls back to the flat pre-volatility financial risk charge when no ALM decision exists", () => {
    const bench = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: null,
    });
    expect(bench.solVolRatio).toBe(1);
  });

  it("charges more concentration-risk capital for a team whose ALM decision was concentrated in a single instrument", () => {
    const input = (concentrationRatio: number) => ({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(0.05, 0, 2_000_000, 0.1, undefined, concentrationRatio),
    });
    const diversified = finBench(input(0));
    const concentrated = finBench(input(1));
    expect(concentrated.solRConc).toBeGreaterThan(diversified.solRConc);
    expect(diversified.solRConc).toBe(0);
    expect(concentrated.solRk).toBeGreaterThan(diversified.solRk);
    expect(concentrated.solMargen).toBeLessThan(diversified.solMargen);
    expect(concentrated.solConcRatio).toBe(1);
  });

  it("charges no concentration-risk capital when no ALM decision exists", () => {
    const bench = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: null,
    });
    expect(bench.solRConc).toBe(0);
    expect(bench.solConcRatio).toBe(0);
  });

  it("erodes bal1's patrimonio by exactly Year 1's committed capital, and bal2's by Year 2's checkpoint", () => {
    const noErosion = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      year2: { totalPremium: 520_000_000, claimsAmount: 310_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(0.05, 0),
      almYear2: fakeAlmYear(0.05, 0),
    });
    const eroded = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      year2: { totalPremium: 520_000_000, claimsAmount: 310_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(0.05, 10_000_000_000),
      almYear2: fakeAlmYear(0.05, 25_000_000_000),
    });
    expect(noErosion.bal1.patrimonio - eroded.bal1.patrimonio).toBeCloseTo(10_000_000_000, 4);
    expect(noErosion.bal2!.patrimonio - eroded.bal2!.patrimonio).toBeCloseTo(25_000_000_000, 4);
    // The eroded patrimonio flows straight into solvency — same rk, lower
    // fondos propios, so a strictly worse margin.
    expect(eroded.solFp).toBeLessThan(noErosion.solFp);
    expect(eroded.solMargen).toBeLessThan(noErosion.solMargen);
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
      almYear1: fakeAlmYear(0.05, 0, 3_141_592),
      almYear2: fakeAlmYear(0.05, 0, 2_718_281),
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
      almYear1: fakeAlmYear(0.05, 0),
    });
    const heavilyEroded = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: fakeAlmYear(0.05, 50_000_000_000),
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
    it("Año 2's costo is exactly its own accident-year ultimate (development.ultY2), never ultY2 + development.development", () => {
      const dev = fakeDevelopmentWithGap();
      expect(dev.development).not.toBe(0); // fixture must actually exercise a nonzero development gap, or this test proves nothing
      const bench = finBench(gapDevelopmentInput());
      expect(bench.p2!.costo).toBeCloseTo(dev.ultY2, 6);
      expect(bench.p2!.costo).not.toBeCloseTo(dev.ultY2 + dev.development, 6);
    });

    it("development.development shows up as its own P&G line (desarrollo), feeding RT directly — not folded into costo", () => {
      const dev = fakeDevelopmentWithGap();
      const bench = finBench(gapDevelopmentInput());
      expect(bench.p2!.desarrollo).toBeCloseTo(dev.development, 6);
      expect(bench.p2!.rt).toBeCloseTo(
        bench.p2!.primaDevengada - bench.p2!.costo - bench.p2!.desarrollo - bench.p2!.gadq - bench.p2!.gcom,
        4
      );
    });

    it("Año 1 and Año 3 (projected) never carry a development line — it's specific to Año 2's known re-estimation gap", () => {
      const bench = finBench(richYear3Input());
      expect(bench.p1.desarrollo).toBe(0);
      expect(bench.p3!.desarrollo).toBe(0);
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

  describe("RT / RI split", () => {
    it("ri = rt − gadm, and uai = ri + rinv (not rt + rinv)", () => {
      const bench = finBench({
        year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
        liabilityYear1,
        almYear1: fakeAlmYear(0.05, 0, 3_000_000),
      });
      expect(bench.p1.ri).toBeCloseTo(bench.p1.rt - bench.p1.gadm, 6);
      expect(bench.p1.uai).toBeCloseTo(bench.p1.ri + bench.p1.rinv, 6);
      expect(bench.p1.uai).not.toBeCloseTo(bench.p1.rt + bench.p1.rinv, 6);
    });
  });

  describe("Reserva de Prima No Devengada (RPND) on the Balance", () => {
    it("bal.rpnd equals that year's own P&G rpndConstituida, and the balance sheet still ties out with RPND included as a liability", () => {
      const bench = finBench({
        year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
        liabilityYear1,
        almYear1: fakeAlmYear(0.05, 0, 3_000_000),
      });
      expect(bench.bal1.rpnd).toBeCloseTo(bench.p1.rpndConstituida, 6);
      // activos == pasivo + patrimonio, i.e. caja+inversiones+cxc == reservasTec+rpnd+cxp+patrimonio
      const pasivoMasPatrimonio = bench.bal1.reservasTec + bench.bal1.rpnd + bench.bal1.cxp + bench.bal1.patrimonio;
      expect(bench.bal1.activos).toBeCloseTo(pasivoMasPatrimonio, 4);
    });
  });
});
