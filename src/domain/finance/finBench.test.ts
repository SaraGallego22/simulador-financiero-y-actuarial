import { describe, expect, it } from "vitest";
import { finBench } from "./finBench";
import type { LiabilitySchedule } from "../reserving/liability";
import type { FinancialScore } from "./alm";

const liabilityYear1: LiabilitySchedule = {
  L: new Array(48).fill(0),
  payY1: new Array(12).fill(0),
  reserva: 20_000_000,
  hay: true,
};

function fakeAlmScore(
  avgVol: number,
  capitalComprometidoY1 = 0,
  capitalComprometidoY2 = 0,
  incomeY1 = 2_000_000,
  incomeY2 = 2_200_000
): FinancialScore {
  return {
    cumplimientoCaja: 100,
    rendimiento: 50,
    ventaForzada: 100,
    liquidez: 100,
    nota: 80,
    portYield: 0.1,
    effYield: 0.1,
    reserva: 20_000_000,
    peakCapitalComprometidoRatio: 0,
    avgCapitalComprometidoRatio: 0,
    incomeY1,
    incomeY2,
    liq6: 0,
    liab6: 0,
    cobertura: 1,
    avgPV: 20_000_000,
    totIncome: 0,
    tranches: [],
    avgVol,
    riskAdjustedYield: 0.1,
    totalVentaForzada: 0,
    ventaForzadaSeveridad: 0,
    capitalComprometidoY1,
    capitalComprometidoY2,
    patrimonioDisponible: 70_000_000_000 - capitalComprometidoY1 - capitalComprometidoY2,
  };
}

describe("finBench", () => {
  it("produces a Year-1-only benchmark when no Year-2 data is given", () => {
    const bench = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: null,
    });
    expect(bench.p2).toBeNull();
    expect(bench.p3).toBeNull();
    expect(bench.p1.prima).toBe(500_000_000);
    expect(bench.p1.costo).toBe(300_000_000);
    // uai = rt + rinv; rt = prima - costo - gastos
    expect(bench.p1.uai).toBeCloseTo(bench.p1.rt + bench.p1.rinv, 6);
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
    // Year 3 premium/cost grow by FZ.growth3 (6%) over Year 2.
    expect(bench.p3!.prima).toBeCloseTo(bench.p2!.prima * 1.06, 4);
  });

  it("charges more financial risk capital for a team whose ALM decision was materially more volatile", () => {
    const input = (avgVol: number) => ({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: fakeAlmScore(avgVol),
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

  it("erodes bal1's patrimonio by exactly Year 1's committed capital, and bal2's by Year 2's checkpoint", () => {
    const noErosion = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      year2: { totalPremium: 520_000_000, claimsAmount: 310_000_000 },
      liabilityYear1,
      almYear1: fakeAlmScore(0.05, 0, 0),
    });
    const eroded = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      year2: { totalPremium: 520_000_000, claimsAmount: 310_000_000 },
      liabilityYear1,
      almYear1: fakeAlmScore(0.05, 10_000_000_000, 25_000_000_000),
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
      almYear1: fakeAlmScore(0.05, 0, 0, 3_141_592, 2_718_281),
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
      almYear1: fakeAlmScore(0.05, 0, 0),
    });
    const heavilyEroded = finBench({
      year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000 },
      liabilityYear1,
      almYear1: fakeAlmScore(0.05, 50_000_000_000, 0),
    });
    expect(heavilyEroded.p1.rinv).toBe(noErosion.p1.rinv);
    expect(heavilyEroded.p1.uai).toBe(noErosion.p1.uai);
    expect(heavilyEroded.p1.uneta).toBe(noErosion.p1.uneta);
    // The erosion still shows up — just on the balance sheet, not the P&L.
    expect(heavilyEroded.bal1.patrimonio).toBeLessThan(noErosion.bal1.patrimonio);
  });
});
