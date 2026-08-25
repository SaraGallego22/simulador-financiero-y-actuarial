import { seedRand } from "../generation/rng";
import type { ColombiaUniverse } from "../generation/generateColombia";
import type { Year2Claims } from "../generation/generateYear2Claims";
import type { TeamInfo, RunSimulationParams } from "./runSimulation";
import { enforceMinPoliciesFloor } from "./minPoliciesFloor";

export interface RunSimulationYear2Params extends RunSimulationParams {
  /** Scales an extra Gumbel bonus applied when an exposure's Year-1 team is still an option — the higher this is, the harder it is for a team to lose a customer to switching. */
  retentionFactor: number;
}

export interface Year2TeamAggregate {
  insuredCount: number;
  totalPremium: number;
  claimsCount: number;
  claimsAmount: number;
  rejectedCount: number;
  sumLambda: number;
  retainedCount: number;
  newCount: number;
  /** The actual Phase 2/3 policy-count limit enforced for this team this run — min(rawCapacityLimit, floor(n*cuotaPct)). */
  capacityLimit: number;
  /** This team's capital-derived limit *before* the cuotaPct ceiling clamp. */
  rawCapacityLimit: number;
}

export interface SimulationYear2Result {
  /** Per-exposure assigned team id, or -1 for an exposure no team had capacity left to insure. */
  assignment: Int32Array;
  aggregates: Map<number, Year2TeamAggregate>;
}

function getPremium(tariff: Float32Array | undefined, exposureIndex: number, fallback: number): number {
  if (!tariff) return fallback;
  const v = tariff[exposureIndex];
  return v || fallback;
}

/** Same eligibility gate as runSimulation.ts's isPriced() — see its doc comment. */
function isPriced(tariff: Float32Array | undefined, exposureIndex: number): boolean {
  return !tariff || !Number.isNaN(tariff[exposureIndex]);
}

/**
 * Year-2 market clearing with retention inertia: same 3-phase discrete-choice
 * structure as runSimulation(), but each exposure gets an extra utility bonus
 * toward whichever team insured it in Year 1 (scaled by `retentionFactor`),
 * and results are tallied against Year-2 claims (generateYear2Claims), not
 * Year 1's. Ported from correrSim2() in the legacy prototype, line ~3380.
 *
 * Unlike Year 1, `capacityByTeamId`/`cuotaPct` are a hard ceiling in Phase 3
 * (see capacity.ts): a team is never forced to take on more than its
 * solvency-derived limit allows there. If total capacity across all teams
 * can't cover the whole universe, the leftover exposures come back in
 * `assignment` as -1 (uninsured) instead. The one exception is Phase 4's
 * MIN_POLICIES_PER_TEAM floor, which can still push a team above its own
 * capacityLimit — see enforceMinPoliciesFloor()'s doc comment for why.
 */
export function runSimulationYear2(
  universe: ColombiaUniverse,
  year2Claims: Year2Claims,
  previousAssignment: Int32Array,
  tariffsByTeam: Map<number, Float32Array>,
  teams: TeamInfo[],
  params: RunSimulationYear2Params
): SimulationYear2Result {
  if (teams.length < 2) {
    throw new Error("runSimulationYear2 requires at least 2 teams");
  }

  const n = universe.n;
  const ceiling = Math.floor(n * params.cuotaPct);
  const rawCapacityByTeam = new Map<number, number>();
  const limitByTeam = new Map<number, number>();
  for (const team of teams) {
    const raw = params.capacityByTeamId.get(team.id);
    if (raw == null) throw new Error(`runSimulationYear2: missing capacityByTeamId entry for team ${team.id}`);
    rawCapacityByTeam.set(team.id, raw);
    limitByTeam.set(team.id, Math.min(raw, ceiling));
  }
  const teamsById = new Map(teams.map((t) => [t.id, t]));

  const r1 = seedRand(params.seed + 8888);
  const r2 = seedRand(params.seed + 4444);
  const gumbel1 = () => -Math.log(-Math.log(r1() + 1e-10));
  const gumbel2 = () => -Math.log(-Math.log(r2() + 1e-10));

  // Phase 1: logit-utility preference assignment, with a retention bonus
  // toward each exposure's Year-1 team. A team that didn't reprice this
  // exposure this year isn't a candidate — the retention bonus only
  // applies among teams that actually priced it (see isPriced()); the old
  // Year-1 relationship alone doesn't grandfather a missing Year-2 price in.
  const prefTeam = new Int32Array(n).fill(-1);
  const prefPremium = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const currentTeamId = previousAssignment[k];
    let bestU = -Infinity;
    let bestTeam: TeamInfo | null = null;
    let bestPremium = 0;
    for (const team of teams) {
      const tariff = tariffsByTeam.get(team.id);
      if (!isPriced(tariff, k)) continue;
      const premium = getPremium(tariff, k, team.fallbackPremium);
      let u = -params.beta * Math.log(premium / 1_000_000) + gumbel1() * params.marcaScale;
      if (team.id === currentTeamId) u += params.retentionFactor * gumbel2() * 2.5;
      if (u > bestU) {
        bestU = u;
        bestTeam = team;
        bestPremium = premium;
      }
    }
    if (bestTeam) {
      prefTeam[k] = bestTeam.id;
      prefPremium[k] = bestPremium;
    }
  }

  // Phase 2: ration by market-share cap, keeping each team's highest-premium
  // policies. Built entirely from typed arrays — no per-exposure JS object
  // ({index, premium}) allocation, see runSimulation()'s doc comment on why
  // that used to matter enough to cause a production OOM.
  const countByTeam = new Map<number, number>();
  for (const team of teams) countByTeam.set(team.id, 0);
  for (let k = 0; k < n; k++) {
    if (prefTeam[k] === -1) continue; // no team priced this exposure — never enters a team's own bucket
    countByTeam.set(prefTeam[k], (countByTeam.get(prefTeam[k]) ?? 0) + 1);
  }

  const indicesByTeam = new Map<number, Int32Array>();
  const fillPos = new Map<number, number>();
  for (const team of teams) {
    indicesByTeam.set(team.id, new Int32Array(countByTeam.get(team.id) ?? 0));
    fillPos.set(team.id, 0);
  }
  for (let k = 0; k < n; k++) {
    const id = prefTeam[k];
    if (id === -1) continue;
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

  // Phase 3: redistribute rejected exposures among teams with remaining
  // capacity. Sum of every team's (capacity-derived, ceiling-clamped) limit
  // can be < 100% of the universe — no team has room. Unlike Year 1,
  // capacityLimit is a hard solvency ceiling here: an exposure nobody has
  // room for stays unassigned (-1), i.e. uninsured, rather than being
  // forced onto a team beyond its capital-implied capacity. See README's
  // Año 2 solvency section — a team can legitimately end the year with
  // exposures no one insured, the mirror image of the existing "capacity
  // can go to zero" consequence.
  for (let k = 0; k < n; k++) {
    if (assignment[k] !== -1) continue;

    const available = teams.filter((t) => (remainingCapacity.get(t.id) ?? 0) > 0 && isPriced(tariffsByTeam.get(t.id), k));
    if (!available.length) continue; // uninsured: no team has capacity left, or none priced this exposure

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

  // Phase 4: no team leaves the market empty-handed — see enforceMinPoliciesFloor()'s
  // doc comment. This floor is unconditional: it can push a team's insuredCount past
  // its own capacityLimit (staying in the game outranks the solvency cap here), and
  // it draws on this run's uninsured (-1) exposures first before touching another
  // team's book.
  enforceMinPoliciesFloor(n, assignment, tariffsByTeam, teams);

  // Aggregate results per team, using Year-2 claims and tracking retention.
  const aggregates = new Map<number, Year2TeamAggregate>();
  for (const team of teams) {
    aggregates.set(team.id, {
      insuredCount: 0,
      totalPremium: 0,
      claimsCount: 0,
      claimsAmount: 0,
      rejectedCount: rejectedByTeam.get(team.id) ?? 0,
      sumLambda: 0,
      retainedCount: 0,
      newCount: 0,
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
    agg.sumLambda += year2Claims.lam[k];
    if (year2Claims.siniestro[k]) {
      agg.claimsCount++;
      agg.claimsAmount += year2Claims.sev[k];
    }
    if (previousAssignment[k] === teamId) agg.retainedCount++;
    else agg.newCount++;
  }

  return { assignment, aggregates };
}
