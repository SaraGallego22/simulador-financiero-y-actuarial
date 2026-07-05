import { prisma } from "./prisma";
import { getTeamBookForDay, computeReservesForTeams, getYear2ClaimsByTeamId, computeDevelopmentForTeams } from "./teamBook";
import { scoreFinanciero } from "@/domain/finance/alm";
import type { Allocation } from "@/domain/finance/instruments";
import { finBench } from "@/domain/finance/finBench";
import type { FinBenchResult } from "@/domain/finance/finBench";

/**
 * Assembles finBench()'s input from what's actually stored for a cohort at a
 * given day, and returns each team's P&L/balance/solvency benchmark. Year 1
 * data (simulation day=1) is always required; Year 2 data (day=2) is folded
 * in once it exists — including the real Year1->Year2 development schedule
 * (computeDevelopmentForTeams), not finBench's simplified ratio fallback for
 * whenever that isn't available. See CLAUDE.md's domain glossary — finBench
 * itself is pure and framework-agnostic, this is the app-specific plumbing.
 */
export async function computeFinBenchForCohort(cohortId: string): Promise<Map<string, FinBenchResult>> {
  const results = new Map<string, FinBenchResult>();

  const book1 = await getTeamBookForDay(cohortId, 1);
  if (!book1) return results;
  const reserves1 = computeReservesForTeams(book1.claimsByTeamId);

  const year2ClaimsByTeamId = await getYear2ClaimsByTeamId(cohortId);
  const developmentByTeamId = year2ClaimsByTeamId
    ? computeDevelopmentForTeams(book1.claimsByTeamId, year2ClaimsByTeamId)
    : null;

  const [year1Results, year2Results, allocations1, allocations2] = await Promise.all([
    prisma.teamSimResult.findMany({
      where: { simulationRun: { cohortId, day: 1, status: "DONE" } },
      orderBy: { simulationRun: { createdAt: "desc" } },
    }),
    prisma.teamSimResult.findMany({
      where: { simulationRun: { cohortId, day: 2, status: "DONE" } },
      orderBy: { simulationRun: { createdAt: "desc" } },
    }),
    prisma.portfolioAllocation.findMany({ where: { day: 1, team: { cohortId } } }),
    prisma.portfolioAllocation.findMany({ where: { day: 2, team: { cohortId } } }),
  ]);

  const year1ByTeamId = new Map(year1Results.map((r) => [r.teamId, r]));
  const year2ByTeamId = new Map(year2Results.map((r) => [r.teamId, r]));
  const alloc1ByTeamId = new Map(allocations1.map((a) => [a.teamId, a.allocation as Allocation]));
  const alloc2ByTeamId = new Map(allocations2.map((a) => [a.teamId, a.allocation as Allocation]));

  for (const [teamId, year1] of year1ByTeamId) {
    const liabilityYear1 = reserves1.get(teamId);
    if (!liabilityYear1) continue;

    const alloc1 = alloc1ByTeamId.get(teamId);
    const almYear1 = alloc1 ? scoreFinanciero(liabilityYear1, alloc1) : null;

    const year2 = year2ByTeamId.get(teamId);
    const alloc2 = alloc2ByTeamId.get(teamId);
    const almYear2 = alloc2 ? scoreFinanciero(liabilityYear1, alloc2) : undefined;

    const bench = finBench({
      year1: { totalPremium: year1.totalPremium, claimsAmount: year1.claimsAmount },
      year2: year2 ? { totalPremium: year2.totalPremium, claimsAmount: year2.claimsAmount } : undefined,
      liabilityYear1,
      development: developmentByTeamId?.get(teamId),
      almYear1,
      almYear2,
    });
    results.set(teamId, bench);
  }

  return results;
}
