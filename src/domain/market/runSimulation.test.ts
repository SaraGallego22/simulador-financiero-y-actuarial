import { describe, expect, it } from "vitest";
import { generateColombia } from "../generation/generateColombia";
import { runSimulation } from "./runSimulation";
import type { TeamInfo } from "./runSimulation";

const N = 2000;

function flatTariff(n: number, premium: number): Float32Array {
  return new Float32Array(n).fill(premium);
}

function unlimited(teams: TeamInfo[]): Map<number, number> {
  return new Map(teams.map((t) => [t.id, Infinity]));
}

describe("runSimulation", () => {
  const universe = generateColombia(42, N);
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

  it("assigns every exposure to some active team", () => {
    const { assignment } = runSimulation(universe, tariffs, teams, {
      seed: 42,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.5,
      capacityByTeamId: unlimited(teams),
    });
    expect(assignment.length).toBe(N);
    for (let k = 0; k < N; k++) {
      expect([1, 2, 3]).toContain(assignment[k]);
    }
  });

  it("respects the cuotaPct ceiling per team when capacity is unlimited (up to the redistribution fallback)", () => {
    const cuotaPct = 0.4;
    const { assignment } = runSimulation(universe, tariffs, teams, {
      seed: 42,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct,
      capacityByTeamId: unlimited(teams),
    });
    const limit = Math.floor(N * cuotaPct);
    const counts = new Map<number, number>();
    for (let k = 0; k < N; k++) counts.set(assignment[k], (counts.get(assignment[k]) ?? 0) + 1);
    // With 3 teams x 40% cap = 120% total capacity > 100%, so every team should
    // fit under its cap without needing the "no capacity left" fallback.
    for (const team of teams) {
      expect(counts.get(team.id) ?? 0).toBeLessThanOrEqual(limit);
    }
  });

  it("a team's own capacityByTeamId binds even when it's below the cuotaPct ceiling", () => {
    const capacity = new Map<number, number>([
      [1, 50],
      [2, Infinity],
      [3, Infinity],
    ]);
    const { assignment, aggregates } = runSimulation(universe, tariffs, teams, {
      seed: 42,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.9, // generous ceiling — team 1's own 50-policy cap is what should bind
      capacityByTeamId: capacity,
    });
    let team1Count = 0;
    for (let k = 0; k < N; k++) if (assignment[k] === 1) team1Count++;
    expect(team1Count).toBeLessThanOrEqual(50);
    expect(aggregates.get(1)!.capacityLimit).toBe(50);
    expect(aggregates.get(1)!.rawCapacityLimit).toBe(50);
  });

  it("clamps a team's capacity to the cuotaPct ceiling even when its own capacityByTeamId is higher", () => {
    const cuotaPct = 0.1;
    const capacity = new Map<number, number>([
      [1, N], // this team's capital could support the whole universe...
      [2, N],
      [3, N],
    ]);
    const { aggregates } = runSimulation(universe, tariffs, teams, {
      seed: 42,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct, // ...but the admin ceiling is much tighter
      capacityByTeamId: capacity,
    });
    const ceiling = Math.floor(N * cuotaPct);
    for (const team of teams) {
      expect(aggregates.get(team.id)!.capacityLimit).toBe(ceiling);
      expect(aggregates.get(team.id)!.rawCapacityLimit).toBe(N);
    }
  });

  it("throws when a team is missing from capacityByTeamId", () => {
    expect(() =>
      runSimulation(universe, tariffs, teams, {
        seed: 42,
        beta: 1.5,
        marcaScale: 0.3,
        cuotaPct: 0.5,
        capacityByTeamId: new Map([[1, 100]]), // teams 2 and 3 missing
      })
    ).toThrow();
  });

  it("aggregates sum to the total exposure count and are internally consistent", () => {
    const { assignment, aggregates } = runSimulation(universe, tariffs, teams, {
      seed: 42,
      beta: 1.5,
      marcaScale: 0.3,
      cuotaPct: 0.5,
      capacityByTeamId: unlimited(teams),
    });
    let totalInsured = 0;
    for (const agg of aggregates.values()) totalInsured += agg.insuredCount;
    expect(totalInsured).toBe(N);

    for (const team of teams) {
      const agg = aggregates.get(team.id)!;
      let expectedCount = 0;
      for (let k = 0; k < N; k++) if (assignment[k] === team.id) expectedCount++;
      expect(agg.insuredCount).toBe(expectedCount);
      expect(agg.claimsCount).toBeLessThanOrEqual(agg.insuredCount);
    }
  });

  it("is deterministic for a given seed", () => {
    const params = { seed: 7, beta: 1.5, marcaScale: 0.3, cuotaPct: 0.5, capacityByTeamId: unlimited(teams) };
    const runA = runSimulation(universe, tariffs, teams, params);
    const runB = runSimulation(universe, tariffs, teams, params);
    expect(Array.from(runA.assignment)).toEqual(Array.from(runB.assignment));
  });

  it("throws with fewer than 2 teams", () => {
    expect(() =>
      runSimulation(universe, tariffs, [teams[0]], {
        seed: 1,
        beta: 1,
        marcaScale: 0.3,
        cuotaPct: 0.5,
        capacityByTeamId: unlimited(teams),
      })
    ).toThrow();
  });
});
