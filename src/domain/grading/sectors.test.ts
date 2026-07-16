import { describe, expect, it } from "vitest";
import { generateColombia } from "../generation/generateColombia";
import {
  SECTOR_DIMENSIONS,
  computeSectorStats,
  rankForCrecer,
  rankForDisminuir,
  scoreSectorPicks,
  sectorKey,
  sectorLabel,
  isValidSectorPick,
  SECTOR_RANK_WINDOW,
} from "./sectors";
import type { Sector, SectorPick, SectorStat } from "./sectors";

const TOLERANCE = { tolerancePerfect: 0.05, toleranceZero: 0.4 };

describe("SECTOR_DIMENSIONS", () => {
  it("has 8 dimensions, each with at least 3 levels", () => {
    expect(SECTOR_DIMENSIONS.length).toBe(8);
    for (const d of SECTOR_DIMENSIONS) expect(d.levels.length).toBeGreaterThanOrEqual(3);
  });
});

describe("sectorKey / sectorLabel", () => {
  it("is order-independent: (A,valA,B,valB) and (B,valB,A,valA) key the same", () => {
    const s1: Sector = { dimA: "zona", valA: "urbana", dimB: "uso", valB: "comercial" };
    const s2: Sector = { dimA: "uso", valA: "comercial", dimB: "zona", valB: "urbana" };
    expect(sectorKey(s1)).toBe(sectorKey(s2));
    expect(sectorLabel(s1)).toBe(sectorLabel(s2));
  });
});

describe("isValidSectorPick", () => {
  it("rejects picking the same dimension twice", () => {
    expect(isValidSectorPick("zona", "urbana", "zona", "rural")).toBe(false);
  });

  it("rejects an unknown dimension or level", () => {
    expect(isValidSectorPick("zona", "urbana", "marca", "toyota")).toBe(false);
    expect(isValidSectorPick("zona", "atlantida", "uso", "comercial")).toBe(false);
  });

  it("accepts two distinct real dimensions with real levels", () => {
    expect(isValidSectorPick("zona", "urbana", "uso", "comercial")).toBe(true);
  });
});

describe("computeSectorStats", () => {
  // Large enough that plenty of 2-way cells clear even a modest credibility
  // floor, small enough to keep the test fast.
  const universe = generateColombia(42, 200_000);

  it("is deterministic for the same universe", () => {
    const a = computeSectorStats(universe, 500);
    const b = computeSectorStats(universe, 500);
    expect(a).toEqual(b);
  });

  it("drops cells below the credibility floor and keeps ones above it", () => {
    const loose = computeSectorStats(universe, 1);
    // High enough to cut into the highest-cardinality pairs (e.g. tipo x edu,
    // 6x4=24 cells averaging ~8k each at n=200k) while still leaving
    // low-cardinality pairs (e.g. zona x uso, 3x3=9 cells averaging ~22k) standing.
    const strict = computeSectorStats(universe, 15_000);
    expect(strict.length).toBeLessThan(loose.length);
    expect(strict.length).toBeGreaterThan(0);
    for (const s of strict) expect(s.count).toBeGreaterThanOrEqual(15_000);
  });

  it("surfaces the designed zona×uso interaction: urbana+comercial is worse than a naive read of either marginal alone would suggest", () => {
    const stats = computeSectorStats(universe, 500);
    const urbanaComercial = stats.find((s) => sectorKey(s) === sectorKey({ dimA: "zona", valA: "urbana", dimB: "uso", valB: "comercial" }));
    const ruralComercial = stats.find((s) => sectorKey(s) === sectorKey({ dimA: "zona", valA: "rural", dimB: "uso", valB: "comercial" }));
    expect(urbanaComercial).toBeDefined();
    expect(ruralComercial).toBeDefined();
    // Both should be well above the population average (multiplier 1) since
    // "comercial" alone is already a bad marginal — but urbana's own
    // interaction bonus should make it clearly worse than rural's.
    expect(urbanaComercial!.multiplier).toBeGreaterThan(1);
    expect(urbanaComercial!.multiplier).toBeGreaterThan(ruralComercial!.multiplier);
  });

  it("multiplier is centered on 1.0 (population average)", () => {
    const stats = computeSectorStats(universe, 500);
    const weighted = stats.reduce((s, x) => s + x.multiplier * x.count, 0) / stats.reduce((s, x) => s + x.count, 0);
    // Cells overlap heavily (every exposure appears in 28 different cells),
    // so this isn't exactly 1 — just a sanity check that it's in a plausible
    // neighborhood, not off by an order of magnitude.
    expect(weighted).toBeGreaterThan(0.5);
    expect(weighted).toBeLessThan(2);
  });

  it("never includes a sector crossing 'hist' — trap variable, excluded from every true ranking", () => {
    const stats = computeSectorStats(universe, 1);
    for (const s of stats) {
      expect(s.dimA).not.toBe("hist");
      expect(s.dimB).not.toBe("hist");
    }
  });
});

describe("rankForCrecer / rankForDisminuir", () => {
  const stats: SectorStat[] = [
    { dimA: "zona", valA: "urbana", dimB: "uso", valB: "comercial", count: 10_000, claimCount: 900, medianSeverity: 3_000_000, aggregateLoss: 300, multiplier: 1.5 },
    { dimA: "zona", valA: "rural", dimB: "uso", valB: "personal", count: 10_000, claimCount: 500, medianSeverity: 2_000_000, aggregateLoss: 100, multiplier: 0.5 },
    { dimA: "edad", valA: "joven", dimB: "tipo", valB: "deportivo", count: 10_000, claimCount: 700, medianSeverity: 2_500_000, aggregateLoss: 250, multiplier: 1.25 },
  ];

  it("crecer ranks lowest multiplier first", () => {
    const ranked = rankForCrecer(stats);
    expect(ranked[0].multiplier).toBeLessThan(ranked[1].multiplier);
    expect(ranked[1].multiplier).toBeLessThan(ranked[2].multiplier);
  });

  it("disminuir ranks highest multiplier first", () => {
    const ranked = rankForDisminuir(stats);
    expect(ranked[0].multiplier).toBeGreaterThan(ranked[1].multiplier);
    expect(ranked[1].multiplier).toBeGreaterThan(ranked[2].multiplier);
  });
});

describe("scoreSectorPicks", () => {
  const trueRanking: SectorStat[] = Array.from({ length: 12 }, (_, i) => ({
    dimA: "zona" as const,
    valA: `v${i}`,
    dimB: "uso" as const,
    valB: `w${i}`,
    count: 10_000,
    claimCount: 600,
    medianSeverity: 2_000_000,
    aggregateLoss: 100,
    multiplier: 1 - i * 0.01,
  }));
  // Defaults to a perfect multiplier estimate (the true one for that index)
  // so tests about rank behavior aren't also testing multiplier accuracy —
  // pass an explicit override (e.g. null) to isolate the multiplier half
  // instead.
  const pickAt = (i: number, estimatedMultiplier: number | null = trueRanking[i]?.multiplier ?? null): SectorPick => ({
    dimA: "zona",
    valA: `v${i}`,
    dimB: "uso",
    valB: `w${i}`,
    estimatedMultiplier,
  });

  it("scores 100 when every pick lands exactly on its true rank and estimates its true multiplier", () => {
    const picks = [pickAt(0), pickAt(1), pickAt(2)];
    expect(scoreSectorPicks(picks, trueRanking, TOLERANCE)).toBeCloseTo(100, 6);
  });

  it("gives partial credit for a near-miss and decays with the gap (rank half, multiplier held perfect)", () => {
    const oneOff = scoreSectorPicks([pickAt(1)], trueRanking, TOLERANCE); // stated rank 1, true rank 2
    const twoOff = scoreSectorPicks([pickAt(2)], trueRanking, TOLERANCE); // stated rank 1, true rank 3
    expect(oneOff!).toBeLessThan(100);
    expect(oneOff!).toBeGreaterThan(twoOff!);
  });

  it("scores 0 for a pick that isn't in the true ranking at all, regardless of its estimated multiplier", () => {
    const notReal: SectorPick = { dimA: "edad", valA: "mayor", dimB: "estrato", valB: "alto", estimatedMultiplier: 1.5 };
    expect(scoreSectorPicks([notReal], trueRanking, TOLERANCE)).toBe(0);
  });

  it("once the rank gap reaches SECTOR_RANK_WINDOW, only the multiplier half can still contribute", () => {
    // stated rank 1, true rank 11 — rank half scores 0, multiplier half is
    // held perfect (100), so the blended slot score is exactly half of 100.
    const farOff = scoreSectorPicks([pickAt(SECTOR_RANK_WINDOW)], trueRanking, TOLERANCE);
    expect(farOff).toBe(50);
  });

  it("returns null for an empty pick list, and averages over only the filled slots", () => {
    expect(scoreSectorPicks([], trueRanking, TOLERANCE)).toBeNull();
    const twoSlots = scoreSectorPicks([pickAt(0), pickAt(1)], trueRanking, TOLERANCE);
    expect(twoSlots!).toBeGreaterThan(90); // both very close to their true rank, both estimate the true multiplier exactly
  });

  it("naming the right sector but leaving the multiplier blank only gives half credit", () => {
    const rankOnly = scoreSectorPicks([pickAt(0, null)], trueRanking, TOLERANCE); // exact rank, no estimate
    expect(rankOnly).toBe(50);
  });

  it("estimating the multiplier within tolerance scores as well as a perfect estimate; far outside it scores like no estimate at all", () => {
    const trueMultiplier = trueRanking[0].multiplier;
    const withinTolerance = scoreSectorPicks([pickAt(0, trueMultiplier * 1.02)], trueRanking, TOLERANCE); // 2% off, inside tolerancePerfect=5%
    const wayOff = scoreSectorPicks([pickAt(0, trueMultiplier * 10)], trueRanking, TOLERANCE); // 900% off, past toleranceZero=40%
    expect(withinTolerance).toBeCloseTo(100, 6);
    expect(wayOff).toBeCloseTo(50, 6); // rank half still perfect, multiplier half floors at 0
  });
});
