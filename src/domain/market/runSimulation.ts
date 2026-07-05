import { seedRand } from "../generation/rng";
import type { ColombiaUniverse } from "../generation/generateColombia";

export interface TeamInfo {
  id: number;
  /** Fallback premium used when a team's tariff array doesn't cover an exposure. */
  fallbackPremium: number;
}

export interface RunSimulationParams {
  seed: number;
  /** Price sensitivity in the logit utility. */
  beta: number;
  /** Scale of the Gumbel brand-inertia noise term. */
  marcaScale: number;
  /** Max market-share fraction per team, in (0, 1]. */
  cuotaPct: number;
}

export interface TeamSimAggregate {
  teamId: number;
  insuredCount: number;
  totalPremium: number;
  claimsCount: number;
  claimsAmount: number;
  sumLambda: number;
  rejectedCount: number;
}

export interface SimulationResult {
  /** Per-exposure assigned team id (index = exposure index, 0-based). */
  assignment: Int32Array;
  aggregates: Map<number, TeamSimAggregate>;
}

function getPremium(tariff: Float32Array | undefined, exposureIndex: number, fallback: number): number {
  if (!tariff) return fallback;
  const v = tariff[exposureIndex];
  return v || fallback;
}

/**
 * 3-phase discrete-choice market-clearing simulation, ported from correrSim()
 * in the legacy prototype, line ~3013:
 *
 * 1. Each exposure picks its utility-maximizing team (logit: price + Gumbel
 *    brand-inertia noise).
 * 2. Each team rejects excess demand above its market-share cap, keeping the
 *    highest-premium policies it was offered (a team would rather retain the
 *    exposures it prices highest).
 * 3. Exposures rejected in phase 2 are redistributed among teams with
 *    remaining capacity, using a second independent Gumbel draw.
 *
 * Rewritten with typed arrays and no artificial yields (see CLAUDE.md §4.1) —
 * on the server there's no render thread to protect, so this runs in one pass
 * instead of the legacy's chunked `await sleep()` loop.
 */
export function runSimulation(
  universe: ColombiaUniverse,
  tariffsByTeam: Map<number, Float32Array>,
  teams: TeamInfo[],
  params: RunSimulationParams
): SimulationResult {
  if (teams.length < 2) {
    throw new Error("runSimulation requires at least 2 teams");
  }

  const n = universe.n;
  const limit = Math.floor(n * params.cuotaPct);
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  const r1 = seedRand(params.seed + 7777);
  const r2 = seedRand(params.seed + 3333);
  const gumbel1 = () => -Math.log(-Math.log(r1() + 1e-10));
  const gumbel2 = () => -Math.log(-Math.log(r2() + 1e-10));

  // Phase 1: logit-utility preference assignment
  const prefTeam = new Int32Array(n);
  const prefPremium = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let bestU = -Infinity;
    let bestTeam = teams[0];
    let bestPremium = 0;
    for (const team of teams) {
      const premium = getPremium(tariffsByTeam.get(team.id), k, team.fallbackPremium);
      const u = -params.beta * Math.log(premium / 1_000_000) + gumbel1() * params.marcaScale;
      if (u > bestU) {
        bestU = u;
        bestTeam = team;
        bestPremium = premium;
      }
    }
    prefTeam[k] = bestTeam.id;
    prefPremium[k] = bestPremium;
  }

  // Phase 2: ration by market-share cap, keeping each team's highest-premium policies
  const queuesByTeam = new Map<number, { index: number; premium: number }[]>();
  for (const team of teams) queuesByTeam.set(team.id, []);
  for (let k = 0; k < n; k++) {
    queuesByTeam.get(prefTeam[k])!.push({ index: k, premium: prefPremium[k] });
  }

  const assignment = new Int32Array(n).fill(-1);
  const rejectedByTeam = new Map<number, number>();
  const remainingCapacity = new Map<number, number>();
  for (const team of teams) {
    const queue = queuesByTeam.get(team.id)!;
    queue.sort((a, b) => b.premium - a.premium);
    for (let idx = 0; idx < Math.min(queue.length, limit); idx++) {
      assignment[queue[idx].index] = team.id;
    }
    rejectedByTeam.set(team.id, Math.max(0, queue.length - limit));
    remainingCapacity.set(team.id, limit - Math.min(queue.length, limit));
  }

  // Phase 3: redistribute rejected exposures among teams with remaining capacity
  for (let k = 0; k < n; k++) {
    if (assignment[k] !== -1) continue;

    const available = teams.filter((t) => (remainingCapacity.get(t.id) ?? 0) > 0);
    if (!available.length) {
      // cuotaPct * teams.length < 100% — no team has room. Fall back to
      // whichever team has the most remaining (least negative) capacity,
      // mirroring the legacy's behavior in this edge case.
      let fallback = teams[0];
      for (const t of teams) {
        if ((remainingCapacity.get(t.id) ?? 0) > (remainingCapacity.get(fallback.id) ?? 0)) fallback = t;
      }
      assignment[k] = fallback.id;
      remainingCapacity.set(fallback.id, (remainingCapacity.get(fallback.id) ?? 0) - 1);
      continue;
    }

    let bestU = -Infinity;
    let bestTeam = available[0];
    for (const team of available) {
      const premium = getPremium(tariffsByTeam.get(team.id), k, team.fallbackPremium);
      const u = -params.beta * Math.log(premium / 1_000_000) + gumbel2() * params.marcaScale;
      if (u > bestU) {
        bestU = u;
        bestTeam = team;
      }
    }
    assignment[k] = bestTeam.id;
    remainingCapacity.set(bestTeam.id, (remainingCapacity.get(bestTeam.id) ?? 0) - 1);
  }

  // Aggregate results per team
  const aggregates = new Map<number, TeamSimAggregate>();
  for (const team of teams) {
    aggregates.set(team.id, {
      teamId: team.id,
      insuredCount: 0,
      totalPremium: 0,
      claimsCount: 0,
      claimsAmount: 0,
      sumLambda: 0,
      rejectedCount: rejectedByTeam.get(team.id) ?? 0,
    });
  }
  for (let k = 0; k < n; k++) {
    const teamId = assignment[k];
    const agg = aggregates.get(teamId);
    if (!agg) continue;
    const team = teamsById.get(teamId);
    const premium = getPremium(tariffsByTeam.get(teamId), k, team?.fallbackPremium ?? 0);
    agg.insuredCount++;
    agg.totalPremium += premium;
    agg.sumLambda += universe.lam[k];
    if (universe.siniestro[k]) {
      agg.claimsCount++;
      agg.claimsAmount += universe.sev[k];
    }
  }

  return { assignment, aggregates };
}
