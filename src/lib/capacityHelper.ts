import { prisma } from "./prisma";
import { CAPITAL_SOCIAL } from "@/domain/finance/constants";
import { maxPoliciesForCapital, nominalPortfolioVolRatio } from "@/domain/finance/capacity";
import { isPortfolioDecisionV3 } from "@/domain/finance/instruments";
import { computeFinBenchForCohort } from "./finBenchHelper";
import type { ColombiaUniverse } from "@/domain/generation/generateColombia";
import type { Year2Claims } from "@/domain/generation/generateYear2Claims";

export interface TeamForCapacity {
  id: string;
  /** That day's TariffSubmission.meanPremium — known before the market clears, since it's the team's own CSV. */
  avgOwnPremium: number;
}

/**
 * Each eligible team's solvency-derived, capital-implied maximum policy
 * count for the market about to clear on `day` — the *raw*, pre-ceiling
 * number runSimulation()/runSimulationYear2() then clamp against cuotaPct
 * (see capacityByTeamId on RunSimulationParams). This is what replaces the
 * old uniform market-share cap with something that actually connects to
 * Día 4's solvency model — see README's market-clearing section for the
 * full design and the two-year feedback loop.
 *
 * day===1: every team starts from the same fresh CAPITAL_SOCIAL — nobody
 * has eroded anything yet, so capacity only differs by each team's own
 * price level and portfolio volatility.
 *
 * day===2: available capital is bal1.patrimonio, from
 * computeFinBenchForCohort() — which already uses each team's *real* Año 1
 * ALM (real premium, not the fictitious funding hypothesis, see
 * finBenchHelper.ts) — so a team that drew heavily on Capital Social to
 * cover a cash shortfall in Año 1 enters Año 2 with materially less room
 * to grow, before it even prices a single policy.
 *
 * `universe`/`year2Claims` should be whatever the caller already generated
 * this request (the simulation route always has both in scope, since it
 * needs them to run the market itself) — passed through to
 * computeFinBenchForCohort() so its internal reserving pipeline doesn't
 * regenerate its own copies. Skipping this was a production OOM: three
 * separate 1,000,000-row universe regenerations in a single Día 2
 * simulation-trigger request.
 */
export async function computeCapacityByTeamId(
  cohortId: string,
  day: number,
  teams: TeamForCapacity[],
  universe?: ColombiaUniverse,
  year2Claims?: Year2Claims
): Promise<Map<string, number>> {
  const allocations = await prisma.portfolioAllocation.findMany({ where: { day, team: { cohortId } } });
  const allocByTeamId = new Map(allocations.map((a) => [a.teamId, a.allocation]));

  // A team's own decision for the year being cleared takes priority; a
  // team that hasn't updated its portfolio for Año 2 yet still has Año 1's
  // (see TAB_NOTES[2].portfolio — the Año 2 portfolio is optional).
  const fallbackAllocations = day > 1 ? await prisma.portfolioAllocation.findMany({ where: { day: day - 1, team: { cohortId } } }) : [];
  const fallbackAllocByTeamId = new Map(fallbackAllocations.map((a) => [a.teamId, a.allocation]));

  let patrimonioByTeamId: Map<string, number> | null = null;
  if (day === 2) {
    const benchByTeamId = await computeFinBenchForCohort(cohortId, universe, year2Claims);
    patrimonioByTeamId = new Map([...benchByTeamId].map(([teamId, bench]) => [teamId, bench.bal1.patrimonio]));
  }

  const result = new Map<string, number>();
  for (const team of teams) {
    const availableCapital = patrimonioByTeamId?.get(team.id) ?? CAPITAL_SOCIAL;
    const rawAlloc = allocByTeamId.get(team.id) ?? fallbackAllocByTeamId.get(team.id) ?? null;
    const decision = isPortfolioDecisionV3(rawAlloc) ? rawAlloc : null;
    const volRatio = nominalPortfolioVolRatio(decision?.tranches ?? null);
    result.set(team.id, maxPoliciesForCapital(availableCapital, volRatio, team.avgOwnPremium));
  }
  return result;
}
