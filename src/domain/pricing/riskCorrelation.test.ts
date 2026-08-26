import { describe, expect, it } from "vitest";
import { tariffRiskCorrelationByTeam } from "./riskCorrelation";
import { generateColombia, getExposure } from "../generation/generateColombia";
import { generateYear2Claims, year2Exposure } from "../generation/generateYear2Claims";
import { calcMediaSev } from "./severity";

/** A small deterministic universe — same generator, just fewer rows. */
const universe = generateColombia(42, 2000);
const purePremium = (k: number) => universe.lam[k] * calcMediaSev(getExposure(universe, k));

/** A full-coverage tariff built from a per-exposure pricing rule. */
function tariff(priceAt: (k: number) => number): Float32Array {
  const t = new Float32Array(universe.n);
  for (let k = 0; k < universe.n; k++) t[k] = priceAt(k);
  return t;
}

function corrOf(priceAt: (k: number) => number): number | null {
  return tariffRiskCorrelationByTeam(universe, new Map([[1, tariff(priceAt)]])).get(1)!;
}

describe("tariffRiskCorrelationByTeam", () => {
  it("is 1 for a tariff that is exactly the true pure premium", () => {
    expect(corrOf(purePremium)).toBeCloseTo(1, 10);
  });

  it("is scale- and shift-invariant: 3x the pure premium plus a flat load still scores 1", () => {
    // Which is the point of reporting a correlation: it measures the ORDER of
    // the tariff, not its level — a team can be uniformly overpriced and still
    // have ranked its risks perfectly.
    expect(corrOf((k) => 3 * purePremium(k) + 250_000)).toBeCloseTo(1, 10);
  });

  it("is negative for a tariff that inverts the true risk ordering", () => {
    // Not exactly −1: a strictly decreasing but non-linear transform of the
    // risk, which is what a real inverted tariff looks like.
    const r = corrOf((k) => 5_000_000 - purePremium(k))!;
    expect(r).toBeCloseTo(-1, 10);
  });

  it("is null (undefined, not 0) for a flat tariff — no spread to correlate", () => {
    expect(corrOf(() => 500_000)).toBeNull();
  });

  it("lands strictly between perfect and useless for a tariff that prices only part of the risk", () => {
    // Prices frequency but ignores severity entirely — a real, partial model.
    const partial = corrOf((k) => universe.lam[k] * 1_000_000)!;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(0.99);
  });

  it("scores over everything a team priced, NOT over some won subset", () => {
    // A team prices its whole book perfectly. Whatever slice of it a market
    // might have handed the team is irrelevant here — there is no assignment
    // in the signature at all, so this can only be the full priced book.
    const full = corrOf(purePremium)!;
    // Same tariff, but the team simply didn't quote the second half.
    const half = corrOf((k) => (k < universe.n / 2 ? purePremium(k) : 0))!;
    expect(full).toBeCloseTo(1, 10);
    expect(half).toBeCloseTo(1, 10);
  });

  it("excludes exposures priced at 0 — 'not priced', not 'priced free'", () => {
    // Perfect on the half it quoted; the unquoted half is priced 0 and must be
    // ignored rather than dragged in as a genuine 0-peso premium (which would
    // pull the correlation well away from 1).
    const quotedHalfOnly = corrOf((k) => (k % 2 === 0 ? purePremium(k) : 0))!;
    expect(quotedHalfOnly).toBeCloseTo(1, 10);
  });

  it("returns null for a team with a single priced exposure — nothing to correlate", () => {
    expect(corrOf((k) => (k === 0 ? 500_000 : 0))).toBeNull();
  });

  it("scores each team independently from its own tariff", () => {
    const corr = tariffRiskCorrelationByTeam(
      universe,
      new Map([
        [1, tariff(purePremium)],
        [2, tariff((k) => 5_000_000 - purePremium(k))],
        [3, tariff(() => 500_000)],
      ])
    );
    expect(corr.get(1)).toBeCloseTo(1, 10);
    expect(corr.get(2)).toBeCloseTo(-1, 10);
    expect(corr.get(3)).toBeNull();
  });

  it("scores an Año 2 tariff against Año 2's own risk, not Año 1's", () => {
    const year2 = generateYear2Claims(universe, 42);
    const pureY2 = (k: number) => year2.lam[k] * calcMediaSev(year2Exposure(universe, k));

    // A tariff that is exactly Año 2's pure premium scores 1 only when Año 2 is
    // the basis; against Año 1's risk it falls short, because the two years'
    // risk differs per exposure (vehicle a year older, and the claim history
    // bumped only for whoever claimed in Año 1 — a non-uniform change that
    // scale-invariance cannot absorb).
    const t = new Map([[1, tariff(pureY2)]]);
    expect(tariffRiskCorrelationByTeam(universe, t, year2).get(1)).toBeCloseTo(1, 10);
    expect(tariffRiskCorrelationByTeam(universe, t).get(1)!).toBeLessThan(0.999);

    // And symmetrically: an Año 1-perfect tariff is no longer perfect in Año 2.
    const t1 = new Map([[1, tariff(purePremium)]]);
    expect(tariffRiskCorrelationByTeam(universe, t1).get(1)).toBeCloseTo(1, 10);
    expect(tariffRiskCorrelationByTeam(universe, t1, year2).get(1)!).toBeLessThan(0.999);
  });

  it("stays within [-1, 1] on a realistic noisy tariff", () => {
    const r = corrOf((k) => purePremium(k) * (0.5 + ((k * 7919) % 1000) / 1000))!;
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThanOrEqual(1);
  });
});
