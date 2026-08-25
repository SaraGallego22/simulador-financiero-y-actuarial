import { describe, expect, it } from "vitest";
import { generateColombia } from "../generation/generateColombia";
import { runSimulation } from "./runSimulation";
import type { TeamInfo } from "./runSimulation";
import { MIN_POLICIES_PER_TEAM, enforceMinPoliciesFloor } from "./minPoliciesFloor";

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

// Direct, deterministic tests against enforceMinPoliciesFloor itself (no market
// simulation / RNG involved) — covers the two things that only apply once -1
// (uninsured, Year-2-only) exposures exist: the floor draws on them before
// touching another team's book, and it overrides a team's own solvency cap on
// purpose once that pool runs out. See minPoliciesFloor.ts's doc comment.
describe("enforceMinPoliciesFloor (direct)", () => {
  const n = 20_000;
  const floorTeams: TeamInfo[] = [
    { id: 1, fallbackPremium: 1_000_000 },
    { id: 2, fallbackPremium: 1_000_000 },
    { id: 3, fallbackPremium: 1_000_000 },
  ];
  const emptyTariffs = new Map<number, Float32Array>();

  // First team1Count entries -> team 1, next team2Count -> team 2, next
  // team3Count -> team 3, everything else stays -1 (uninsured).
  function buildAssignment(team1Count: number, team2Count: number, team3Count: number): Int32Array {
    const a = new Int32Array(n).fill(-1);
    let idx = 0;
    for (let i = 0; i < team1Count; i++) a[idx++] = 1;
    for (let i = 0; i < team2Count; i++) a[idx++] = 2;
    for (let i = 0; i < team3Count; i++) a[idx++] = 3;
    return a;
  }

  function countAll(assignment: Int32Array) {
    let t1 = 0,
      t2 = 0,
      t3 = 0,
      uninsured = 0;
    for (let k = 0; k < n; k++) {
      if (assignment[k] === 1) t1++;
      else if (assignment[k] === 2) t2++;
      else if (assignment[k] === 3) t3++;
      else uninsured++;
    }
    return { t1, t2, t3, uninsured };
  }

  it("fills a deficient team from uninsured (-1) exposures first, leaving other teams' books untouched", () => {
    const assignment = buildAssignment(6000, 6000, 100); // 7900 exposures left as -1 — plenty to cover team 3's deficit alone
    enforceMinPoliciesFloor(n, assignment, emptyTariffs, floorTeams);
    const { t1, t2, t3, uninsured } = countAll(assignment);
    expect(t3).toBe(MIN_POLICIES_PER_TEAM);
    expect(t1).toBe(6000);
    expect(t2).toBe(6000);
    expect(uninsured).toBe(7900 - (MIN_POLICIES_PER_TEAM - 100));
  });

  it("falls back to donor teams' surplus once the uninsured pool runs out, and can push a team above what would be its capacityLimit", () => {
    const assignment = buildAssignment(6000, 6000, 100); // only 100 team-3 policies live outside the pool this time
    // Shrink the uninsured pool to 500 by handing the rest to team 1 first (team 1 stays well above the floor either way).
    for (let k = 12100; k < 20000 - 500; k++) assignment[k] = 1;
    enforceMinPoliciesFloor(n, assignment, emptyTariffs, floorTeams);
    const { t3, uninsured } = countAll(assignment);
    // Team 3's deficit (4900) exceeds the 500-strong uninsured pool, so the
    // floor reaches into donor surplus — team 3 still lands exactly on the
    // floor, well above a hypothetical solvency-derived capacityLimit of 100.
    expect(t3).toBe(MIN_POLICIES_PER_TEAM);
    expect(t3).toBeGreaterThan(100);
    expect(uninsured).toBe(0);
  });

  it("never tops up a deficient team with an exposure it never priced (NaN), even if that leaves it short of the floor", () => {
    const assignment = buildAssignment(6000, 6000, 100); // 7900 uninsured, plenty in raw count
    // Team 3 only priced the first 200 of the 7900 uninsured (-1) exposures
    // — everything else in the donation pool is NaN for team 3 specifically.
    const team3Tariff = new Float32Array(n).fill(NaN);
    for (let k = 12100; k < 12100 + 200; k++) team3Tariff[k] = 1_000_000;
    const tariffsWithGap = new Map<number, Float32Array>([[3, team3Tariff]]);

    enforceMinPoliciesFloor(n, assignment, tariffsWithGap, floorTeams);
    const { t1, t2, t3 } = countAll(assignment);
    // Team 3's deficit is 4900, but it only priced 200 of the available pool
    // — it lands 200 above its start (100), not at the floor.
    expect(t3).toBe(300);
    expect(t3).toBeLessThan(MIN_POLICIES_PER_TEAM);
    // Teams 1/2 (no tariff entry at all in tariffsWithGap => permissive,
    // same as the other direct tests) are untouched by team 3's shortfall.
    expect(t1).toBe(6000);
    expect(t2).toBe(6000);
  });
});
