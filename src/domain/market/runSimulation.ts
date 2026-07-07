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
  /** Absolute ceiling on market-share fraction per team, in (0, 1] — nobody can exceed this regardless of capital. See capacityByTeamId for what actually binds first for most teams. */
  cuotaPct: number;
  /**
   * Per-team, capital-derived maximum policy count (see
   * maxPoliciesForCapital() in domain/finance/capacity.ts) — computed by
   * the caller from each team's available capital, portfolio volatility,
   * and own average premium, *before* the ceiling clamp. Each team's
   * actual Phase 2 limit is min(this, floor(n*cuotaPct)) — a team with
   * ample capital still can't exceed the admin's ceiling, but a
   * capital-constrained team gets capped well below it. Required for
   * every team passed in `teams`.
   */
  capacityByTeamId: Map<number, number>;
}

export interface TeamSimAggregate {
  teamId: number;
  insuredCount: number;
  totalPremium: number;
  claimsCount: number;
  claimsAmount: number;
  sumLambda: number;
  rejectedCount: number;
  /** The actual Phase 2/3 policy-count limit enforced for this team this run — min(rawCapacityLimit, floor(n*cuotaPct)). */
  capacityLimit: number;
  /** This team's capital-derived limit *before* the cuotaPct ceiling clamp — lets Día 4 distinguish "capital was your binding constraint" from "the admin ceiling was". */
  rawCapacityLimit: number;
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
 *    exposures it prices highest). The cap is per-team now — see
 *    capacityByTeamId on RunSimulationParams — not a single number shared
 *    by everyone.
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
  const ceiling = Math.floor(n * params.cuotaPct);
  const rawCapacityByTeam = new Map<number, number>();
  const limitByTeam = new Map<number, number>();
  for (const team of teams) {
    const raw = params.capacityByTeamId.get(team.id);
    if (raw == null) throw new Error(`runSimulation: missing capacityByTeamId entry for team ${team.id}`);
    rawCapacityByTeam.set(team.id, raw);
    limitByTeam.set(team.id, Math.min(raw, ceiling));
  }
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

  // Phase 2: ration by market-share cap, keeping each team's highest-premium
  // policies. Built entirely from typed arrays — no per-exposure JS object
  // ({index, premium}) allocation. With n=1,000,000 that used to mean a
  // million small heap objects (tens of MB of V8 object overhead on top of
  // their actual data), which compounded with everything else in a Día 2
  // simulation-trigger request badly enough to cause a production OOM.
  const countByTeam = new Map<number, number>();
  for (const team of teams) countByTeam.set(team.id, 0);
  for (let k = 0; k < n; k++) countByTeam.set(prefTeam[k], (countByTeam.get(prefTeam[k]) ?? 0) + 1);

  const indicesByTeam = new Map<number, Int32Array>();
  const fillPos = new Map<number, number>();
  for (const team of teams) {
    indicesByTeam.set(team.id, new Int32Array(countByTeam.get(team.id) ?? 0));
    fillPos.set(team.id, 0);
  }
  for (let k = 0; k < n; k++) {
    const id = prefTeam[k];
    const indices = indicesByTeam.get(id)!;
    const pos = fillPos.get(id)!;
    indices[pos] = k;
    fillPos.set(id, pos + 1);
  }

  const assignment = new Int32Array(n).fill(-1);
  const rejectedByTeam = new Map<number, number>();
  const remainingCapacity = new Map<number, number>();
  for (const team of teams) {
    const limit = limitByTeam.get(team.id)!;
    const indices = indicesByTeam.get(team.id)!;
    indices.sort((a, b) => prefPremium[b] - prefPremium[a]);
    for (let idx = 0; idx < Math.min(indices.length, limit); idx++) {
      assignment[indices[idx]] = team.id;
    }
    rejectedByTeam.set(team.id, Math.max(0, indices.length - limit));
    remainingCapacity.set(team.id, limit - Math.min(indices.length, limit));
  }

  // Phase 3: redistribute rejected exposures among teams with remaining capacity
  for (let k = 0; k < n; k++) {
    if (assignment[k] !== -1) continue;

    const available = teams.filter((t) => (remainingCapacity.get(t.id) ?? 0) > 0);
    if (!available.length) {
      // Sum of every team's (capacity-derived, ceiling-clamped) limit <
      // 100% of the universe — no team has room. Fall back to whichever
      // team has the most remaining (least negative) capacity, mirroring
      // the legacy's behavior in this edge case.
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
      capacityLimit: limitByTeam.get(team.id)!,
      rawCapacityLimit: rawCapacityByTeam.get(team.id)!,
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
