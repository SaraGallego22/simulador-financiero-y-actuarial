import { prisma } from "./prisma";
import { getTeamBookForDay, computeReservesForTeams, getYear2ClaimsByTeamId, computeDevelopmentForTeams } from "./teamBook";
import type { ColombiaUniverse } from "@/domain/generation/generateColombia";
import type { Year2Claims } from "@/domain/generation/generateYear2Claims";
import { almSimRealYear, computeMarketRiskAtAño2End } from "@/domain/finance/alm";
import type { AlmRealYearResult, MarketRiskAtYearEnd } from "@/domain/finance/alm";
import { BUILD_MONTHS } from "@/domain/reserving/constants";
import { isPortfolioDecisionV4 } from "@/domain/finance/instruments";
import type { PortfolioDecisionV4 } from "@/domain/finance/instruments";
import { finBench } from "@/domain/finance/finBench";
import { projectYear3 } from "@/domain/finance/projectYear3";
import { OUTSOURCED_CONSULTING_FEE_PCT } from "@/domain/pricing/outsourced";
import type { FinBenchResult, AlmYearBenchInput } from "@/domain/finance/finBench";

export interface TeamFinBenchBundle {
  bench: FinBenchResult;
  /** The real ALM's own Año 1/Año 2 results (rows, capitalSocialRestante, etc.) — the exact same runs that fed bench.p1/p2/bal1/bal2 above, exposed so admin/day/[n] can show the real ALM ladder/breakdown without recomputing anything separately (see almSimRealYear()'s doc comment on why that used to drift out of sync with what actually got graded). null when the team has no Día 1/2 portfolio decision to run. */
  realAlmYear1: AlmRealYearResult | null;
  realAlmYear2: AlmRealYearResult | null;
  /** Año 3's continuation of the same real ALM, funded by the *projected* prima3 and paying the projected Año 3 claims schedule (see projectYear3.ts) — what feeds bench.p3's Resultado de inversiones and bench.bal3's asset side. null until Año 2's real ALM and the Año 3 projection both exist. */
  realAlmYear3: AlmRealYearResult | null;
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
 * LiabilitySchedule computed from year2ClaimsByTeamId), and Año 3 as the
 * same continuation one year further out — the only one whose funding and
 * claims are *projected* (projectYear3.ts) rather than observed, since there
 * is no third market and no third accident year. There is no reason to
 * simulate past month 12 of any of them — the real ALM only exists to feed
 * that one year's real P&G/Balance, unlike the fictitious ALM (an
 * independent 60-month run per year, unchanged — see almSim()).
 *
 * Año 2's schedule is Día 2's own (`alloc1`) by default, but a team can
 * optionally resubmit on Día 3 ("Portafolio 2028", `PortfolioAllocation`
 * day=3) once Año 2's real premium is known instead of the guess Día 2's
 * schedule had to make ahead of time — see year2Decision below. Only the
 * schedule changes; open positions/capital comprometido still carry over
 * unchanged from Año 1's real close (realAlmYear1.finalState).
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
    // Año 1's real ALM schedule lives on Día 2 (not Día 1 — Día 1 is the
    // minimum-variance exercise, a flat weight map, no checkpoints) — it
    // always drives Año 1's real ALM, and Año 2's too unless overridden below.
    prisma.portfolioAllocation.findMany({ where: { day: 2, team: { cohortId } } }),
    // Optional Día 3 "Portafolio 2028" resubmission — a team that wants to
    // restructure its Año 2 strategy now that its real 2028 premium is known
    // (rather than the guess it had to make on Día 2, before Año 1 even
    // closed) can submit a fresh schedule here. When present, it fully
    // replaces alloc1 for Año 2's real ALM (own month-0 baseline, same as
    // Año 1's) — see year2Decision below. capitalSocialAllocation on this
    // submission is structurally required (PortfolioForm/isPortfolioDecisionV4)
    // but never read for year===2 (almSimRealYear only funds Capital Social
    // at Año 1's month 0).
    prisma.portfolioAllocation.findMany({ where: { day: 3, team: { cohortId } } }),
  ]);

  // Which teams used "Tercerizar tarifas", per year — the consultancy's fee
  // is a real expense on that year's P&G (PnL.gConsultoria) and real cash out
  // of that year's real ALM, so both need to know. Día 1's tariff prices Año
  // 1, Día 2's prices Año 2.
  const outsourcedSubmissions = await prisma.tariffSubmission.findMany({
    where: { day: { in: [1, 2] }, outsourced: true, team: { cohortId } },
    select: { teamId: true, day: true },
  });
  const outsourcedYear1 = new Set(outsourcedSubmissions.filter((s) => s.day === 1).map((s) => s.teamId));
  const outsourcedYear2 = new Set(outsourcedSubmissions.filter((s) => s.day === 2).map((s) => s.teamId));

  // Built with a first-wins loop, not `new Map(array.map(...))` — a team can
  // have several DONE runs for the same day (re-simulations while testing),
  // and results are ordered newest-first; `new Map` from an array of pairs
  // keeps the *last* occurrence of a duplicate key, which would silently
  // pick each team's OLDEST run instead of its most recent one.
  const year1ByTeamId = new Map<string, (typeof year1Results)[number]>();
  for (const r of year1Results) if (!year1ByTeamId.has(r.teamId)) year1ByTeamId.set(r.teamId, r);
  const year2ByTeamId = new Map<string, (typeof year2Results)[number]>();
  for (const r of year2Results) if (!year2ByTeamId.has(r.teamId)) year2ByTeamId.set(r.teamId, r);
  const toDecision = (allocation: unknown): PortfolioDecisionV4 | null => (isPortfolioDecisionV4(allocation) ? allocation : null);
  // Submitted Día 2 — drives Año 1's real ALM always, and Año 2's too unless
  // alloc2ByTeamId below has this team's optional Día 3 override.
  const alloc1ByTeamId = new Map(allocations1.map((a) => [a.teamId, toDecision(a.allocation)]));
  // Optional Día 3 override for Año 2's real ALM only — see the query above.
  const alloc2ByTeamId = new Map(allocations2.map((a) => [a.teamId, toDecision(a.allocation)]));

  for (const [teamId, year1] of year1ByTeamId) {
    const liabilityYear1 = reserves1.get(teamId);
    if (!liabilityYear1) continue;

    const alloc1 = alloc1ByTeamId.get(teamId);
    const feePct1 = outsourcedYear1.has(teamId) ? OUTSOURCED_CONSULTING_FEE_PCT : 0;
    const feePct2 = outsourcedYear2.has(teamId) ? OUTSOURCED_CONSULTING_FEE_PCT : 0;
    const realAlmYear1 = alloc1
      ? almSimRealYear(1, liabilityYear1.payY1, alloc1, year1.totalPremium / BUILD_MONTHS, undefined, undefined, feePct1)
      : null;
    const almYear1: AlmYearBenchInput | null = realAlmYear1
      ? {
          portYield: realAlmYear1.portYield,
          income: realAlmYear1.income,
          capitalComprometido: realAlmYear1.capitalComprometidoAcumulado,
          cajaFinalAnio: realAlmYear1.cajaFinalAnio,
          portfolioBookValue: realAlmYear1.portfolioBookValue,
        }
      : null;

    const year2 = year2ByTeamId.get(teamId);
    // Año 2's real ALM continues with the same Día 2 schedule, UNLESS this
    // team submitted an optional Día 3 "Portafolio 2028" — when present, it
    // fully replaces alloc1 for this call (own month-0 baseline, exactly like
    // Año 1's schedule does — see stepMonth()'s scheduleMonth=i doc comment
    // in alm.ts), not a splice into alloc1's own schedule array.
    const year2Decision = alloc2ByTeamId.get(teamId) ?? alloc1;
    let realAlmYear2: AlmRealYearResult | null = null;
    let almYear2: AlmYearBenchInput | undefined;
    if (year2Decision && year2 && realAlmYear1) {
      const desarrolloAnio1 = liabilityYear1.L.slice(0, 12);
      const siniestrosPropiosAnio2 = year2LiabilityByTeamId?.get(teamId)?.L.slice(0, 12) ?? new Array(12).fill(0);
      const claimsYear2 = desarrolloAnio1.map((v, i) => (v || 0) + (siniestrosPropiosAnio2[i] || 0));
      realAlmYear2 = almSimRealYear(
        2,
        claimsYear2,
        year2Decision,
        year2.totalPremium / BUILD_MONTHS,
        realAlmYear1.finalState,
        year1.totalPremium,
        feePct2
      );
      if (realAlmYear2) {
        almYear2 = {
          portYield: realAlmYear2.portYield,
          income: realAlmYear2.income,
          capitalComprometido: realAlmYear2.capitalComprometidoAcumulado,
          effectiveYield: realAlmYear2.effectiveYield,
          cajaFinalAnio: realAlmYear2.cajaFinalAnio,
          portfolioBookValue: realAlmYear2.portfolioBookValue,
        };
      }
    }

    // Retained/new policy counts for Año 3's prima projection — same
    // `{retainedCount, newCount}` shape already read in admin/day/[n]/page.tsx.
    const year2Extra = year2?.extra as { retainedCount?: number; newCount?: number } | null;
    const year2Retention =
      year2Extra?.retainedCount != null && year2Extra?.newCount != null
        ? { retainedCount: year2Extra.retainedCount, newCount: year2Extra.newCount }
        : undefined;

    // Día 4 riesgo de tasa/inflación/acciones — valued off the real Año-2-end
    // positions and the real liability cashflows still owed past that point
    // (Año 1's own tail + Año 2's own claims, both already anchored so index
    // 12 = calendar month 24 — see computeMarketRiskAtAño2End's doc comment).
    // null/0 when there's no real Año 2 ALM to draw from, same
    // graceful-degradation every other almYear2-derived figure above follows.
    let marketRisk: MarketRiskAtYearEnd | null = null;
    let accBookValue2 = 0;
    if (realAlmYear2) {
      const l1PostAño2 = liabilityYear1.L.slice(12);
      const l2PostAño2 = year2LiabilityByTeamId?.get(teamId)?.L.slice(12) ?? [];
      const liabilityPostAño2 = l1PostAño2.map((v, i) => (v || 0) + (l2PostAño2[i] || 0));
      marketRisk = computeMarketRiskAtAño2End(realAlmYear2.finalState.positions, liabilityPostAño2);
      accBookValue2 = realAlmYear2.finalState.positions
        .filter((p) => p.instrumentId === "ACC")
        .reduce((s, p) => s + p.book, 0);
    }

    // Año 3 continues the same real ALM 12 months further out — the one year
    // whose funding and claims are projected rather than observed (there is
    // no third market and no third accident year). It runs on the positions
    // the team genuinely holds at Año 2's close, so its income and year-end
    // book value describe the team's actual portfolio, not a closed-form
    // proxy on a different base. The schedule is Año 2's own (a team submits
    // no calendar for Año 3), read again from its own relative month 0, the
    // same way Año 2 re-reads Año 1's — see almSimRealYear()'s doc comment.
    // No consulting fee is ever carried here: Año 3 assumes a book the team
    // prices itself (see FinBenchInput.outsourcedYear2's doc comment).
    let realAlmYear3: AlmRealYearResult | null = null;
    let almYear3: AlmYearBenchInput | undefined;
    const development = developmentByTeamId?.get(teamId);
    if (realAlmYear2 && year2Decision && year2 && year2Retention && development) {
      const proj3 = projectYear3({
        year1InsuredCount: year1.insuredCount,
        year2InsuredCount: year2.insuredCount,
        year2PrimaEmitida: year2.totalPremium,
        year2Retention,
        claimCountY2: development.claimCountY2,
        ultY2: development.ultY2,
        osY1endY3: development.osY1endY3,
        osY2endY3: development.osY2endY3,
      });
      if (proj3) {
        // Cash leaving the portfolio during calendar Año 3: Año 1's and Año
        // 2's real remaining tails (indices 12..23 of each schedule — index 0
        // is calendar Año 2, see the Año 2 call above) plus Año 3's own
        // projected claims settling within their own year. The tails are real
        // money paid even though they're no longer a P&G cost — they were
        // already expensed in their own accident year (see projectYear3.ts).
        const tailAnio1 = liabilityYear1.L.slice(12, 24);
        const tailAnio2 = year2LiabilityByTeamId?.get(teamId)?.L.slice(12, 24) ?? [];
        const claimsYear3 = proj3.ownClaimsSchedule12.map((own, i) => own + (tailAnio1[i] || 0) + (tailAnio2[i] || 0));
        realAlmYear3 = almSimRealYear(3, claimsYear3, year2Decision, proj3.prima3 / BUILD_MONTHS, realAlmYear2.finalState, year2.totalPremium, 0);
        if (realAlmYear3) {
          almYear3 = {
            portYield: realAlmYear3.portYield,
            income: realAlmYear3.income,
            capitalComprometido: realAlmYear3.capitalComprometidoAcumulado,
            effectiveYield: realAlmYear3.effectiveYield,
            cajaFinalAnio: realAlmYear3.cajaFinalAnio,
            portfolioBookValue: realAlmYear3.portfolioBookValue,
          };
        }
      }
    }

    const bench = finBench({
      year1: { totalPremium: year1.totalPremium, claimsAmount: year1.claimsAmount, insuredCount: year1.insuredCount },
      year2: year2 ? { totalPremium: year2.totalPremium, claimsAmount: year2.claimsAmount, insuredCount: year2.insuredCount } : undefined,
      liabilityYear1,
      development,
      almYear1,
      almYear2,
      almYear3,
      year2Retention,
      marketRisk,
      accBookValue2,
      outsourcedYear1: outsourcedYear1.has(teamId),
      outsourcedYear2: outsourcedYear2.has(teamId),
    });
    results.set(teamId, { bench, realAlmYear1, realAlmYear2, realAlmYear3 });
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
