import { describe, expect, it } from "vitest";
import { tariffRiskCorrelationByTeam } from "./riskCorrelation";
import { generateColombia, getExposure } from "../generation/generateColombia";
import { calcMediaSev } from "./severity";

/** A small deterministic universe — same generator, just fewer rows. */
const universe = generateColombia(42, 2000);
const purePremium = (k: number) => universe.lam[k] * calcMediaSev(getExposure(universe, k));

/** Everything to team 1, nothing unassigned. */
function allToTeam1(): Int32Array {
  return new Int32Array(universe.n).fill(1);
}

describe("tariffRiskCorrelationByTeam", () => {
  it("is 1 for a tariff that is exactly the true pure premium", () => {
    const corr = tariffRiskCorrelationByTeam(universe, allToTeam1(), (_t, k) => purePremium(k));
    expect(corr.get(1)).toBeCloseTo(1, 10);
  });

  it("is scale- and shift-invariant: charging 3x the pure premium plus a flat load scores the same 1", () => {
    const corr = tariffRiskCorrelationByTeam(universe, allToTeam1(), (_t, k) => 3 * purePremium(k) + 250_000);
    expect(corr.get(1)).toBeCloseTo(1, 10);
    // Which is the point of reporting a correlation: it measures the ORDER of
    // the tariff, not its level — a team can be uniformly overpriced and still
    // have ranked its risks perfectly.
  });

  it("is -1 for a tariff that inverts the true risk ordering", () => {
    const corr = tariffRiskCorrelationByTeam(universe, allToTeam1(), (_t, k) => -purePremium(k));
    expect(corr.get(1)).toBeCloseTo(-1, 10);
  });

  it("is null (undefined, not 0) for a flat tariff — no spread to correlate", () => {
    const corr = tariffRiskCorrelationByTeam(universe, allToTeam1(), () => 500_000);
    expect(corr.get(1)).toBeNull();
  });

  it("lands strictly between a perfect and a useless tariff for one that only prices part of the risk", () => {
    // Prices frequency but ignores severity entirely — a real, partial model.
    const corr = tariffRiskCorrelationByTeam(universe, allToTeam1(), (_t, k) => universe.lam[k]);
    const partial = corr.get(1)!;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(0.99);
  });

  it("scores each team only on the exposures it was actually assigned", () => {
    // Team 1 prices perfectly, team 2 inverts — split the book between them.
    const assignment = new Int32Array(universe.n);
    for (let k = 0; k < universe.n; k++) assignment[k] = k % 2 === 0 ? 1 : 2;
    const corr = tariffRiskCorrelationByTeam(universe, assignment, (teamId, k) =>
      teamId === 1 ? purePremium(k) : -purePremium(k)
    );
    expect(corr.get(1)).toBeCloseTo(1, 10);
    expect(corr.get(2)).toBeCloseTo(-1, 10);
  });

  it("ignores unassigned exposures (-1) entirely", () => {
    const assignment = new Int32Array(universe.n);
    for (let k = 0; k < universe.n; k++) assignment[k] = k < 100 ? 1 : -1;
    const corr = tariffRiskCorrelationByTeam(universe, assignment, (_t, k) => purePremium(k));
    expect(corr.get(1)).toBeCloseTo(1, 10);
    expect(corr.has(-1)).toBe(false);
  });

  it("returns null for a team with a single policy — nothing to correlate", () => {
    const assignment = new Int32Array(universe.n).fill(-1);
    assignment[0] = 1;
    const corr = tariffRiskCorrelationByTeam(universe, assignment, (_t, k) => purePremium(k));
    expect(corr.get(1)).toBeNull();
  });

  it("stays within [-1, 1] on a realistic noisy tariff", () => {
    const corr = tariffRiskCorrelationByTeam(universe, allToTeam1(), (_t, k) => purePremium(k) * (0.5 + ((k * 7919) % 1000) / 1000));
    const r = corr.get(1)!;
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThanOrEqual(1);
  });
});
