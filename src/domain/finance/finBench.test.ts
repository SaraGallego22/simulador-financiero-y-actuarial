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

function fakeAlmScore(avgVol: number): FinancialScore {
  return {
    cumplimientoCaja: 100,
    rendimiento: 50,
    liquidez: 100,
    nota: 80,
    portYield: 0.1,
    effYield: 0.1,
    reserva: 20_000_000,
    peakBrechaCaja: 0,
    peakBrechaCajaRatio: 0,
    avgBrechaCajaRatio: 0,
    invInc: 20_000_000 * 0.1,
    liq6: 0,
    liab6: 0,
    cobertura: 1,
    avgPV: 20_000_000,
    totIncome: 0,
    tranches: [],
    avgVol,
    riskAdjustedYield: 0.1,
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
});
