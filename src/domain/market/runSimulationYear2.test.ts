import { describe, expect, it } from "vitest";
import { generateColombia } from "../generation/generateColombia";
import { generateYear2Claims } from "../generation/generateYear2Claims";
import { runSimulation } from "./runSimulation";
import { runSimulationYear2 } from "./runSimulationYear2";
import type { TeamInfo } from "./runSimulation";

const N = 2000;

function flatTariff(n: number, premium: number): Float32Array {
  return new Float32Array(n).fill(premium);
}

function unlimited(teams: TeamInfo[]): Map<number, number> {
  return new Map(teams.map((t) => [t.id, Infinity]));
}

describe("runSimulationYear2", () => {
  const universe = generateColombia(42, N);
  const year2Claims = generateYear2Claims(universe, 42);
  const teams: TeamInfo[] = [
    { id: 1, fallbackPremium: 900_000 },
    { id: 2, fallbackPremium: 1_000_000 },
    { id: 3, fallbackPremium: 1_100_000 },
  ];
  const tariffs = new Map<number, Float32Array>([
    [1, flatTariff(N, 900_000)],
    [2, flatTariff(N, 1_000_000)],
    [3, flatTariff(N, 1_100_000)],
  ]);

  const year1 = runSimulation(universe, tariffs, teams, {
    seed: 42,
    beta: 1.5,
    marcaScale: 0.3,
    cuotaPct: 0.5,
    capacityByTeamId: unlimited(teams),
  });

  it("assigns every exposure and tallies insuredCount consistently", () => {
    const result = runSimulationYear2(universe, year2Claims, year1.assignment, tariffs, teams, {
      seed: 42,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.5,
      capacityByTeamId: unlimited(teams),
      retentionFactor: 1,
    });
    expect(result.assignment.length).toBe(N);
    let total = 0;
    for (const agg of result.aggregates.values()) total += agg.insuredCount;
    expect(total).toBe(N);
    for (const agg of result.aggregates.values()) {
      expect(agg.retainedCount + agg.newCount).toBe(agg.insuredCount);
    }
  });

  it("higher retentionFactor keeps more Year-1 customers with their original team", () => {
    const withoutRetention = runSimulationYear2(universe, year2Claims, year1.assignment, tariffs, teams, {
      seed: 7,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.9, // high cap so capacity limits don't mask the retention effect
      capacityByTeamId: unlimited(teams),
      retentionFactor: 0,
    });
    const withRetention = runSimulationYear2(universe, year2Claims, year1.assignment, tariffs, teams, {
      seed: 7,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.9,
      capacityByTeamId: unlimited(teams),
      retentionFactor: 5,
    });

    let retainedWithout = 0;
    let retainedWith = 0;
    for (let k = 0; k < N; k++) {
      if (year1.assignment[k] === withoutRetention.assignment[k]) retainedWithout++;
      if (year1.assignment[k] === withRetention.assignment[k]) retainedWith++;
    }
    expect(retainedWith).toBeGreaterThan(retainedWithout);
  });

  it("a team's own capacityByTeamId binds even when it's below the cuotaPct ceiling", () => {
    const capacity = new Map<number, number>([
      [1, 50],
      [2, Infinity],
      [3, Infinity],
    ]);
    const result = runSimulationYear2(universe, year2Claims, year1.assignment, tariffs, teams, {
      seed: 42,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.9,
      capacityByTeamId: capacity,
      retentionFactor: 1,
    });
    expect(result.aggregates.get(1)!.insuredCount).toBeLessThanOrEqual(50);
    expect(result.aggregates.get(1)!.capacityLimit).toBe(50);
  });

  it("leaves exposures uninsured (assignment -1) rather than exceeding any team's capacityLimit when total capacity is short", () => {
    const capacity = new Map<number, number>([
      [1, 100],
      [2, 100],
      [3, 100],
    ]);
    const result = runSimulationYear2(universe, year2Claims, year1.assignment, tariffs, teams, {
      seed: 42,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.9,
      capacityByTeamId: capacity,
      retentionFactor: 1,
    });
    for (const agg of result.aggregates.values()) {
      expect(agg.insuredCount).toBeLessThanOrEqual(agg.capacityLimit);
    }
    let uninsured = 0;
    let totalInsured = 0;
    for (let k = 0; k < N; k++) if (result.assignment[k] === -1) uninsured++;
    for (const agg of result.aggregates.values()) totalInsured += agg.insuredCount;
    expect(uninsured).toBeGreaterThan(0);
    expect(totalInsured + uninsured).toBe(N);
  });

  it("the min-policies floor tops a deficient team up to MIN_POLICIES_PER_TEAM even past its own capacityLimit, drawing on uninsured exposures", () => {
    const bigN = 20_000;
    const bigUniverse = generateColombia(42, bigN);
    const bigYear2Claims = generateYear2Claims(bigUniverse, 42);
    const bigTeams: TeamInfo[] = [
      { id: 1, fallbackPremium: 1_000_000 },
      { id: 2, fallbackPremium: 1_000_000 },
      // Priced 50x its competitors, same as minPoliciesFloor.test.ts's fixture — organically
      // wins ~nothing, so it needs the floor's top-up regardless of its own capacity.
      { id: 3, fallbackPremium: 50_000_000 },
    ];
    const bigTariffs = new Map<number, Float32Array>([
      [1, flatTariff(bigN, 1_000_000)],
      [2, flatTariff(bigN, 1_000_000)],
      [3, flatTariff(bigN, 50_000_000)],
    ]);
    const bigYear1 = runSimulation(bigUniverse, bigTariffs, bigTeams, {
      seed: 42,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.9,
      capacityByTeamId: unlimited(bigTeams),
    });
    // A tight cuotaPct ceiling (unlike the "unlimited" capacityByTeamId) keeps every team's
    // Phase 2/3 limit well under bigN, so Phase 3 genuinely leaves exposures uninsured (-1)
    // for team 3's floor top-up to draw on, instead of teams 1/2 absorbing everything.
    const capacity = new Map<number, number>([
      [1, Infinity],
      [2, Infinity],
      [3, 1000], // team 3's own solvency-derived capacityLimit — below MIN_POLICIES_PER_TEAM (5000)
    ]);
    const result = runSimulationYear2(bigUniverse, bigYear2Claims, bigYear1.assignment, bigTariffs, bigTeams, {
      seed: 42,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.3, // ceiling of 6000/team; combined with team 3's cap, total capacity (13000) < bigN
      capacityByTeamId: capacity,
      retentionFactor: 1,
    });
    // The floor overrides team 3's capacityLimit on purpose (staying in the game outranks
    // the solvency cap here — see minPoliciesFloor.ts's doc comment).
    expect(result.aggregates.get(3)!.insuredCount).toBe(5000);
    expect(result.aggregates.get(3)!.insuredCount).toBeGreaterThan(result.aggregates.get(3)!.capacityLimit);
  });

  it("is deterministic for a given seed", () => {
    const params = {
      seed: 5,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.5,
      capacityByTeamId: unlimited(teams),
      retentionFactor: 2,
    };
    const a = runSimulationYear2(universe, year2Claims, year1.assignment, tariffs, teams, params);
    const b = runSimulationYear2(universe, year2Claims, year1.assignment, tariffs, teams, params);
    expect(Array.from(a.assignment)).toEqual(Array.from(b.assignment));
  });
});
