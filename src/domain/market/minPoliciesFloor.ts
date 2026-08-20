import type { TeamInfo } from "./runSimulation";

/** No team can be shut out of the market — every team keeps at least this many policies after market clearing, regardless of how uncompetitive its price was. */
export const MIN_POLICIES_PER_TEAM = 5000;

function getPremium(tariff: Float32Array | undefined, exposureIndex: number, fallback: number): number {
  if (!tariff) return fallback;
  const v = tariff[exposureIndex];
  return v || fallback;
}

/**
 * Phase 4, shared by runSimulation()/runSimulationYear2(): tops up any team
 * below MIN_POLICIES_PER_TEAM by reassigning exposures away from teams with
 * a surplus above that floor — each donor's *cheapest* (to itself) policies
 * first, so a donor gives up its least profitable business, not its best.
 * Mutates `assignment` in place; called after Phase 3 (every exposure
 * already has a real team, no -1s left) and before aggregates are tallied,
 * so the floor is reflected everywhere downstream (insuredCount,
 * totalPremium, claims, etc.) without a second bookkeeping pass.
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
  for (let k = 0; k < n; k++) countByTeamId.set(assignment[k], (countByTeamId.get(assignment[k]) ?? 0) + 1);

  const deficientTeams = teams.filter((t) => (countByTeamId.get(t.id) ?? 0) < MIN_POLICIES_PER_TEAM);
  if (deficientTeams.length === 0) return;

  const indicesByTeamId = new Map<number, number[]>();
  for (const team of teams) indicesByTeamId.set(team.id, []);
  for (let k = 0; k < n; k++) indicesByTeamId.get(assignment[k])!.push(k);

  const donationPool: number[] = [];
  for (const team of teams) {
    const surplus = (countByTeamId.get(team.id) ?? 0) - MIN_POLICIES_PER_TEAM;
    if (surplus <= 0) continue;
    const indices = indicesByTeamId.get(team.id)!;
    indices.sort((a, b) => getPremium(tariffsByTeam.get(team.id), a, team.fallbackPremium) - getPremium(tariffsByTeam.get(team.id), b, team.fallbackPremium));
    for (let i = 0; i < surplus; i++) donationPool.push(indices[i]);
  }

  let poolIdx = 0;
  for (const team of deficientTeams) {
    let deficit = MIN_POLICIES_PER_TEAM - (countByTeamId.get(team.id) ?? 0);
    while (deficit > 0 && poolIdx < donationPool.length) {
      assignment[donationPool[poolIdx]] = team.id;
      poolIdx++;
      deficit--;
    }
  }
}
