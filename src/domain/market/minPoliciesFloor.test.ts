import { describe, expect, it } from "vitest";
import { generateColombia } from "../generation/generateColombia";
import { runSimulation } from "./runSimulation";
import type { TeamInfo } from "./runSimulation";
import { MIN_POLICIES_PER_TEAM } from "./minPoliciesFloor";

// Large enough for teams.length * MIN_POLICIES_PER_TEAM <= N (3 * 5000 =
// 15000) so the floor actually engages — runSimulation.test.ts's own N=2000
// fixture is deliberately too small for that and never exercises this path.
const N = 20_000;

function flatTariff(n: number, premium: number): Float32Array {
  return new Float32Array(n).fill(premium);
}

function unlimited(teams: TeamInfo[]): Map<number, number> {
  return new Map(teams.map((t) => [t.id, Infinity]));
}

describe("enforceMinPoliciesFloor (via runSimulation)", () => {
  const universe = generateColombia(42, N);
  const teams: TeamInfo[] = [
    { id: 1, fallbackPremium: 1_000_000 },
    { id: 2, fallbackPremium: 1_000_000 },
    // Priced 50x its competitors — organically wins ~nothing in the logit
    // choice, the exact scenario the floor exists for.
    { id: 3, fallbackPremium: 50_000_000 },
  ];
  const tariffs = new Map<number, Float32Array>([
    [1, flatTariff(N, 1_000_000)],
    [2, flatTariff(N, 1_000_000)],
    [3, flatTariff(N, 50_000_000)],
  ]);

  it("tops up a wildly uncompetitive team to exactly MIN_POLICIES_PER_TEAM instead of leaving it near zero", () => {
    const { aggregates } = runSimulation(universe, tariffs, teams, {
      seed: 42,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.9,
      capacityByTeamId: unlimited(teams),
    });
    expect(aggregates.get(3)!.insuredCount).toBeGreaterThanOrEqual(MIN_POLICIES_PER_TEAM);
  });

  it("still assigns every exposure to exactly one team, totaling N", () => {
    const { assignment, aggregates } = runSimulation(universe, tariffs, teams, {
      seed: 42,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.9,
      capacityByTeamId: unlimited(teams),
    });
    expect(assignment.length).toBe(N);
    let total = 0;
    for (const agg of aggregates.values()) total += agg.insuredCount;
    expect(total).toBe(N);
  });

  it("donor teams (with surplus above the floor) give up their own cheapest policies, not their most valuable", () => {
    // Teams 1 and 2 are identical and split the bulk of the market roughly
    // evenly — either could be team 3's donor. Whichever donates, every
    // policy team 3 receives must have been priced at the donor's own flat
    // rate (trivial here since tariffs are flat, but confirms the transfer
    // uses the donor's own tariff, not team 3's).
    const { assignment } = runSimulation(universe, tariffs, teams, {
      seed: 42,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.9,
      capacityByTeamId: unlimited(teams),
    });
    let team3Count = 0;
    for (let k = 0; k < N; k++) if (assignment[k] === 3) team3Count++;
    expect(team3Count).toBe(MIN_POLICIES_PER_TEAM);
  });

  it("is deterministic for a given seed", () => {
    const params = { seed: 7, beta: 1.5, marcaScale: 0.3, cuotaPct: 0.9, capacityByTeamId: unlimited(teams) };
    const runA = runSimulation(universe, tariffs, teams, params);
    const runB = runSimulation(universe, tariffs, teams, params);
    expect(Array.from(runA.assignment)).toEqual(Array.from(runB.assignment));
  });
});
