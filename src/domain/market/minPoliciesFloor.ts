import type { TeamInfo } from "./runSimulation";

/** No team can be shut out of the market — every team keeps at least this many policies after market clearing, regardless of how uncompetitive its price was. */
export const MIN_POLICIES_PER_TEAM = 5000;

function getPremium(tariff: Float32Array | undefined, exposureIndex: number, fallback: number): number {
  if (!tariff) return fallback;
  const v = tariff[exposureIndex];
  return v || fallback;
}

/** Same eligibility gate as runSimulation.ts's isPriced() — see its doc comment. */
function isPriced(tariff: Float32Array | undefined, exposureIndex: number): boolean {
  return !tariff || tariff[exposureIndex] > 0;
}

/**
 * Phase 4, shared by runSimulation()/runSimulationYear2(): tops up any team
 * below MIN_POLICIES_PER_TEAM by reassigning exposures until it reaches the
 * floor. The floor is unconditional — it overrides a team's own
 * solvency-derived capacityLimit on purpose: staying in the game takes
 * priority over the capital constraint in this one guaranteed-minimum case
 * (see README's Año 2 solvency section). Mutates `assignment` in place;
 * called after Phase 3 and before aggregates are tallied, so the floor is
 * reflected everywhere downstream (insuredCount, totalPremium, claims, etc.)
 * without a second bookkeeping pass.
 *
 * Exposure -1 (uninsured — only possible in Year 2, see
 * runSimulationYear2.ts's Phase 3) is preferred first to fill a deficient
 * team's gap, since claiming one doesn't take business away from another
 * team. Only once the uninsured pool runs out does the top-up fall back to
 * each surplus team's *cheapest* (to itself) policies, so a donor gives up
 * its least profitable business, not its best. A deficient team can only
 * receive a pool exposure it actually priced (isPriced()) — the floor can't
 * hand a team business it never quoted, so a team whose deficit outstrips
 * what it priced among the available pool can land short of
 * MIN_POLICIES_PER_TEAM despite this pass.
 *
 * No-ops if the universe can't even mathematically support the floor for
 * every team (teams.length * MIN_POLICIES_PER_TEAM > n) — never happens at
 * this app's real team counts (~12) against a 1,000,000-row universe, but
 * defensive rather than assuming it.
 */
export function enforceMinPoliciesFloor(n: number, assignment: Int32Array, tariffsByTeam: Map<number, Float32Array>, teams: TeamInfo[]): void {
  if (teams.length * MIN_POLICIES_PER_TEAM > n) return;

  const countByTeamId = new Map<number, number>();
  for (const team of teams) countByTeamId.set(team.id, 0);
  for (let k = 0; k < n; k++) {
    if (assignment[k] === -1) continue;
    countByTeamId.set(assignment[k], (countByTeamId.get(assignment[k]) ?? 0) + 1);
  }

  const deficientTeams = teams.filter((t) => (countByTeamId.get(t.id) ?? 0) < MIN_POLICIES_PER_TEAM);
  if (deficientTeams.length === 0) return;

  const indicesByTeamId = new Map<number, number[]>();
  for (const team of teams) indicesByTeamId.set(team.id, []);
  for (let k = 0; k < n; k++) {
    if (assignment[k] === -1) continue;
    indicesByTeamId.get(assignment[k])!.push(k);
  }

  const donationPool: number[] = [];
  for (let k = 0; k < n; k++) {
    if (assignment[k] === -1) donationPool.push(k);
  }
  for (const team of teams) {
    const surplus = (countByTeamId.get(team.id) ?? 0) - MIN_POLICIES_PER_TEAM;
    if (surplus <= 0) continue;
    const indices = indicesByTeamId.get(team.id)!;
    indices.sort((a, b) => getPremium(tariffsByTeam.get(team.id), a, team.fallbackPremium) - getPremium(tariffsByTeam.get(team.id), b, team.fallbackPremium));
    for (let i = 0; i < surplus; i++) donationPool.push(indices[i]);
  }

  // Walked per-team rather than with one shared cursor (unlike a simpler
  // "advance a single pointer" scheme) because a pool entry a team can't use
  // (it never priced that exposure) must stay available for the *next*
  // deficient team, not just get skipped past for everyone.
  const consumed = new Uint8Array(donationPool.length);
  for (const team of deficientTeams) {
    let deficit = MIN_POLICIES_PER_TEAM - (countByTeamId.get(team.id) ?? 0);
    const tariff = tariffsByTeam.get(team.id);
    for (let i = 0; i < donationPool.length && deficit > 0; i++) {
      if (consumed[i]) continue;
      const exposureIndex = donationPool[i];
      if (!isPriced(tariff, exposureIndex)) continue;
      assignment[exposureIndex] = team.id;
      consumed[i] = 1;
      deficit--;
    }
  }
}
