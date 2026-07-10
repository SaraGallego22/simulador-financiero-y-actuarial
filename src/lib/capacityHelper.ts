import { prisma } from "./prisma";
import { CAPITAL_SOCIAL } from "@/domain/finance/constants";
import { maxPoliciesForCapital, nominalPortfolioVolRatio, volRatioFromWeights } from "@/domain/finance/capacity";
import { isPortfolioDecisionV3, isMinVarianceAllocation } from "@/domain/finance/instruments";
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
 * price level and portfolio volatility. That volatility comes from the
 * team's own Día 1 minimum-variance submission (PortfolioAllocation.day=1,
 * a flat {instrumentId: weight} map — see instruments.ts's
 * isMinVarianceAllocation) — its *actual* volatility, not the true optimal
 * solution's, and not the Día 2 tree (which doesn't exist yet at this
 * point in the game): a deliberate one-time "regulatory filing at moment
 * 0" that only Año 1's capacity ever looks at. See README's market-clearing
 * section for the full narrative and why Año 2 doesn't reuse it.
 *
 * day===2: available capital is bal1.patrimonio, from
 * computeFinBenchForCohort() — which already uses each team's *real* Año 1
 * ALM (real premium, not the fictitious funding hypothesis, see
 * finBenchHelper.ts) — so a team that drew heavily on Capital Social to
 * cover a cash shortfall in Año 1 enters Año 2 with materially less room
 * to grow, before it even prices a single policy. Volatility comes from
 * the real portfolio tree the team submits in Día 2 (PortfolioAllocation.
 * day=2) — already required and already submitted by the time Año 2's
 * market clears, so no fallback is needed here (unlike the old day=2 falling
 * back to day=1 — Día 1 no longer stores a tree at all).
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

  let patrimonioByTeamId: Map<string, number> | null = null;
  if (day === 2) {
    const benchByTeamId = await computeFinBenchForCohort(cohortId, universe, year2Claims);
    patrimonioByTeamId = new Map([...benchByTeamId].map(([teamId, bench]) => [teamId, bench.bal1.patrimonio]));
  }

  const result = new Map<string, number>();
  for (const team of teams) {
    const availableCapital = patrimonioByTeamId?.get(team.id) ?? CAPITAL_SOCIAL;
    const rawAlloc = allocByTeamId.get(team.id) ?? null;
    const volRatio =
      day === 1
        ? volRatioFromWeights(isMinVarianceAllocation(rawAlloc) ? rawAlloc : null)
        : nominalPortfolioVolRatio(isPortfolioDecisionV3(rawAlloc) ? rawAlloc.tranches : null);
    result.set(team.id, maxPoliciesForCapital(availableCapital, volRatio, team.avgOwnPremium));
  }
  return result;
}
