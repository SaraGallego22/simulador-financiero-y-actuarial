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
