import { prisma } from "./prisma";
import { getTeamBookForDay, computeReservesForTeams, getYear2ClaimsByTeamId, computeDevelopmentForTeams } from "./teamBook";
import type { ColombiaUniverse } from "@/domain/generation/generateColombia";
import type { Year2Claims } from "@/domain/generation/generateYear2Claims";
import { almSimRealYear } from "@/domain/finance/alm";
import type { AlmRealYearResult } from "@/domain/finance/alm";
import { BUILD_MONTHS } from "@/domain/reserving/constants";
import { isPortfolioDecisionV3 } from "@/domain/finance/instruments";
import type { PortfolioDecisionV3 } from "@/domain/finance/instruments";
import { finBench } from "@/domain/finance/finBench";
import type { FinBenchResult, AlmYearBenchInput } from "@/domain/finance/finBench";

export interface TeamFinBenchBundle {
  bench: FinBenchResult;
  /** The real ALM's own Año 1/Año 2 results (rows, capitalSocialRestante, etc.) — the exact same runs that fed bench.p1/p2/bal1/bal2 above, exposed so admin/day/[n] can show the real ALM ladder/breakdown without recomputing anything separately (see almSimRealYear()'s doc comment on why that used to drift out of sync with what actually got graded). null when the team has no Día 1/2 portfolio decision to run. */
  realAlmYear1: AlmRealYearResult | null;
  realAlmYear2: AlmRealYearResult | null;
}

/**
 * Assembles finBench()'s input from what's actually stored for a cohort at a
 * given day, and returns each team's P&L/balance/solvency benchmark plus the
 * real ALM runs behind it. Year 1 data (simulation day=1) is always
 * required; Year 2 data (day=2) is folded in once it exists — including the
 * real Year1->Year2 development schedule (computeDevelopmentForTeams), not
 * finBench's simplified ratio fallback for whenever that isn't available.
 * See CLAUDE.md's domain glossary — finBench itself is pure and
 * framework-agnostic, this is the app-specific plumbing.
 *
 * almYear1/almYear2 are computed with each team's *real* premium
 * (year1.totalPremium/BUILD_MONTHS, not the fictitious reserva/12 notional
 * almSim() otherwise assumes) — finBench()'s job is to benchmark the *real*
 * P&G/Balance/Solvencia deliverables (see README §5.3), so its inputs have
 * to be the real ALM, not the fictitious one the team's Día 2 nota is
 * graded on.
 *
 * The real ALM only ever runs 12 months per year — Año 1 fresh (funded by
 * Año 1's real premium against Año 1's own within-year claims,
 * liabilityYear1.payY1), Año 2 as a genuine *continuation* of Año 1's real
 * ALM (same open positions, same accumulated capital comprometido — see
 * almSimRealYear()'s doc comment), funded by Año 2's real premium against
 * Año 1's development landing in Año 2 (liabilityYear1.L's first 12
 * entries) *plus* Año 2's own new claims' own first-year payments (a fresh
 * LiabilitySchedule computed from year2ClaimsByTeamId). There is no reason
 * to simulate past month 12 of either year — the real ALM only exists to
 * feed that one year's real P&G/Balance, unlike the fictitious ALM (an
 * independent 60-month run per year, unchanged — see almSim()).
 */
/**
 * `universeOverride`/`year2ClaimsOverride` let a caller that already has
 * the Colombia universe/Year-2 claims this request (e.g.
 * /api/simulation/route.ts, via capacityHelper.ts) pass them through
 * instead of triggering their own regeneration inside getTeamBookForDay()/
 * getYear2ClaimsByTeamId() — see those functions' doc comments; this was
 * the root cause of a production OOM on the Día 2 simulation trigger
 * (three separate 1M-row universe regenerations in a single request).
 */
export async function computeFinBenchBundlesForCohort(
  cohortId: string,
  universeOverride?: ColombiaUniverse,
  year2ClaimsOverride?: Year2Claims
): Promise<Map<string, TeamFinBenchBundle>> {
  const results = new Map<string, TeamFinBenchBundle>();

  const book1 = await getTeamBookForDay(cohortId, 1, universeOverride);
  if (!book1) return results;
  const reserves1 = computeReservesForTeams(book1.claimsByTeamId);

  const year2ClaimsByTeamId = await getYear2ClaimsByTeamId(cohortId, universeOverride, year2ClaimsOverride);
  const developmentByTeamId = year2ClaimsByTeamId
    ? computeDevelopmentForTeams(book1.claimsByTeamId, year2ClaimsByTeamId)
    : null;
  // Año 2's own claims, in the same shape as liabilityYear1 — only the
  // first 12 months of its own L[] are used (Año 2's own claims paid
  // within Año 2 itself), never its 48-month tail (that's Año 3+, out of
  // scope for a real ALM that only ever runs one year at a time).
  const year2LiabilityByTeamId = year2ClaimsByTeamId ? computeReservesForTeams(year2ClaimsByTeamId) : null;

  const [year1Results, year2Results, allocations1, allocations2] = await Promise.all([
    prisma.teamSimResult.findMany({
      where: { simulationRun: { cohortId, day: 1, status: "DONE" } },
      orderBy: { simulationRun: { createdAt: "desc" } },
    }),
    prisma.teamSimResult.findMany({
      where: { simulationRun: { cohortId, day: 2, status: "DONE" } },
      orderBy: { simulationRun: { createdAt: "desc" } },
    }),
    // Año 1's real ALM tree now lives on Día 2 (not Día 1 — Día 1 is the
    // minimum-variance exercise, a flat weight map, never a tree); Año 2's
    // optional rebalance now lives on Día 3 (not Día 2) — see README's
    // market-clearing section for the day mapping and why.
    prisma.portfolioAllocation.findMany({ where: { day: 2, team: { cohortId } } }),
    prisma.portfolioAllocation.findMany({ where: { day: 3, team: { cohortId } } }),
  ]);

  // Built with a first-wins loop, not `new Map(array.map(...))` — a team can
  // have several DONE runs for the same day (re-simulations while testing),
  // and results are ordered newest-first; `new Map` from an array of pairs
  // keeps the *last* occurrence of a duplicate key, which would silently
  // pick each team's OLDEST run instead of its most recent one.
  const year1ByTeamId = new Map<string, (typeof year1Results)[number]>();
  for (const r of year1Results) if (!year1ByTeamId.has(r.teamId)) year1ByTeamId.set(r.teamId, r);
  const year2ByTeamId = new Map<string, (typeof year2Results)[number]>();
  for (const r of year2Results) if (!year2ByTeamId.has(r.teamId)) year2ByTeamId.set(r.teamId, r);
  const toDecision = (allocation: unknown): PortfolioDecisionV3 | null => (isPortfolioDecisionV3(allocation) ? allocation : null);
  // alloc1 = Año 1's real tree, submitted Día 2; alloc2 = Año 2's optional
  // rebalance, submitted Día 3 (falls back to alloc1 below if never resubmitted).
  const alloc1ByTeamId = new Map(allocations1.map((a) => [a.teamId, toDecision(a.allocation)]));
  const alloc2ByTeamId = new Map(allocations2.map((a) => [a.teamId, toDecision(a.allocation)]));

  for (const [teamId, year1] of year1ByTeamId) {
    const liabilityYear1 = reserves1.get(teamId);
    if (!liabilityYear1) continue;

    const alloc1 = alloc1ByTeamId.get(teamId);
    const realAlmYear1 = alloc1 ? almSimRealYear(1, liabilityYear1.payY1, alloc1, year1.totalPremium / BUILD_MONTHS) : null;
    const almYear1: AlmYearBenchInput | null = realAlmYear1
      ? { portYield: realAlmYear1.portYield, income: realAlmYear1.income, capitalComprometido: realAlmYear1.capitalComprometidoAcumulado, avgVol: realAlmYear1.avgVol }
      : null;

    const year2 = year2ByTeamId.get(teamId);
    // A team's own Día 3 decision takes priority; falls back to Día 2's if
    // they never updated it (the Año 2 rebalance is optional — see TAB_NOTES).
    const alloc2 = alloc2ByTeamId.get(teamId) ?? alloc1;
    let realAlmYear2: AlmRealYearResult | null = null;
    let almYear2: AlmYearBenchInput | undefined;
    if (alloc2 && year2 && realAlmYear1) {
      const desarrolloAnio1 = liabilityYear1.L.slice(0, 12);
      const siniestrosPropiosAnio2 = year2LiabilityByTeamId?.get(teamId)?.L.slice(0, 12) ?? new Array(12).fill(0);
      const claimsYear2 = desarrolloAnio1.map((v, i) => (v || 0) + (siniestrosPropiosAnio2[i] || 0));
      realAlmYear2 = almSimRealYear(2, claimsYear2, alloc2, year2.totalPremium / BUILD_MONTHS, realAlmYear1.finalState);
      if (realAlmYear2) {
        almYear2 = { portYield: realAlmYear2.portYield, income: realAlmYear2.income, capitalComprometido: realAlmYear2.capitalComprometidoAcumulado, avgVol: realAlmYear2.avgVol };
      }
    }

    const bench = finBench({
      year1: { totalPremium: year1.totalPremium, claimsAmount: year1.claimsAmount },
      year2: year2 ? { totalPremium: year2.totalPremium, claimsAmount: year2.claimsAmount } : undefined,
      liabilityYear1,
      development: developmentByTeamId?.get(teamId),
      almYear1,
      almYear2,
    });
    results.set(teamId, { bench, realAlmYear1, realAlmYear2 });
  }

  return results;
}

/** Thin wrapper over computeFinBenchBundlesForCohort() for callers that only need the benchmark itself (consolidado.ts, capacityHelper.ts) — see that function's doc comment for the full derivation, and for what universeOverride/year2ClaimsOverride are for. */
export async function computeFinBenchForCohort(
  cohortId: string,
  universeOverride?: ColombiaUniverse,
  year2ClaimsOverride?: Year2Claims
): Promise<Map<string, FinBenchResult>> {
  const bundles = await computeFinBenchBundlesForCohort(cohortId, universeOverride, year2ClaimsOverride);
  return new Map([...bundles].map(([teamId, b]) => [teamId, b.bench]));
}
