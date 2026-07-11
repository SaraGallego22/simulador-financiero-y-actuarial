import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { publishAllAction, togglePublishedAction, toggleMemberScoresPublishedForTeamAction } from "@/lib/adminActions";
import { getTeamBookForDay, computeReservesForTeams, getSectorStatsForSeed, getActiveColombiaUniverse } from "@/lib/teamBook";
import { computeFinBenchBundlesForCohort } from "@/lib/finBenchHelper";
import { scoreFinanciero, almLadder } from "@/domain/finance/alm";
import { INSTRUMENTS, isMinVarianceAllocation, isPortfolioDecisionV3 } from "@/domain/finance/instruments";
import { TARGET_RETURN, portfolioExpectedReturn, portfolioVariance, scoreMinVariance, solveLongOnlyMinVariance } from "@/domain/finance/markowitz";
import { AlmScoreTiles, AlmLadderTable, AlmPortfolioTable, AlmPnlBreakdown, PortfolioTreeView } from "@/components/AlmLadderTable";
import { conceptosDia, scoreConcepto } from "@/domain/grading/concepts";
import type { Dia } from "@/domain/grading/concepts";
import {
  rankForCrecer,
  rankForDisminuir,
  groupSectorPicksByTeam,
  scoreSectorRecommendation,
  sectorKey,
  sectorLabel,
  SECTOR_MIN_COUNT,
} from "@/domain/grading/sectors";
import { notaTarifacionAbsoluta, notaTarifacionAnio, notaPerfilDia, computeRt } from "@/domain/grading/composite";
import { computeConsolidado } from "@/lib/consolidado";
import { SimulationTrigger } from "./SimulationTrigger";
import { ScoreForm } from "./ScoreForm";
import { DayTabBar } from "@/components/DayTabBar";
import type { DayTabKey } from "@/components/DayTabBar";
import { DAY_TITLES, DAY_DESCRIPTIONS } from "@/lib/days";

// Never statically prerender — see admin/standings/page.tsx.
export const dynamic = "force-dynamic";

export default async function AdminDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ n: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { n } = await params;
  const day = Number(n);
  const includeSim = day <= 2;
  // Día 1 hosts the minimum-variance exercise; the real ALM tree lives on
  // Día 2 (Año 1, graded against bookYear=1's reserves) and Día 3 (Año 2's
  // optional rebalance, bookYear=2) — see README's market-clearing section.
  const hasMinVariance = day === 1;
  const hasPortfolioTree = day === 2 || day === 3;
  const bookYear = day === 2 ? 1 : day === 3 ? 2 : null;
  const { tab } = await searchParams;
  const activeTab = (tab as DayTabKey) ?? (includeSim ? "sim" : "entreg");
  const cohort = await getOrCreateActiveCohort();

  const reportConcepts = conceptosDia(`d${day}` as Dia).filter((c) => c.tipo === "reporte");
  const hasAnalitica = conceptosDia(`d${day}` as Dia).some((c) => c.tipo === "auto_analitica");

  // Everything below is independent of everything else in this batch (none
  // of these read each other's results) — fired together instead of one
  // round trip at a time, since each Neon round trip has its own baseline
  // latency that otherwise just adds up sequentially for no reason.
  const [
    teams,
    skills,
    memberScores,
    latestRun,
    consolidadoRows,
    universe,
    capacityRuns,
    deliverables,
    rubric,
    universeRunForSectors,
    analyticsRecs,
  ] = await Promise.all([
    prisma.team.findMany({
      where: { cohortId: cohort.id },
      include: {
        tariffSubmissions: { where: { day }, select: { meanPremium: true, outsourced: true } },
        portfolioAllocations: { where: { day }, select: { allocation: true } },
        members: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.skill.findMany({ where: { rubricConfig: { cohortId: cohort.id } }, orderBy: { name: "asc" } }),
    prisma.memberScore.findMany({
      where: { day, teamMember: { team: { cohortId: cohort.id } } },
      include: { teamMember: { select: { teamId: true } } },
    }),
    prisma.simulationRun.findFirst({
      where: { cohortId: cohort.id, day },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, teamResults: true },
    }),
    activeTab === "top" || activeTab === "obj" ? computeConsolidado(cohort.id) : Promise.resolve(null),
    // Generated once and reused below for every call that would otherwise
    // regenerate its own copy this same request (getTeamBookForDay,
    // computeFinBenchBundlesForCohort's internal Día 1/Año 2 lookups) — see
    // getActiveColombiaUniverse()'s doc comment; this exact redundancy
    // (three separate 1,000,000-row regenerations) caused a production OOM
    // on the Día 2 *simulation trigger* (/api/simulation), and made this
    // page slow to load for the same reason.
    day >= 1 ? getActiveColombiaUniverse(cohort.id) : Promise.resolve(null),
    // Each team's Año 1/Año 2 capital-derived market-share limit (see
    // capacityHelper.ts) — shown next to finBench's solvency figures below
    // so an evaluator can point a capped team straight at the same numbers.
    day >= 2
      ? prisma.simulationRun.findMany({
          where: { cohortId: cohort.id, day: { in: [1, 2] }, status: "DONE" },
          orderBy: { createdAt: "desc" },
          select: { day: true, teamResults: { select: { teamId: true, rejectedCount: true, extra: true } } },
        })
      : Promise.resolve([]),
    // Deliverables: teams self-report numeric concepts, graded against
    // finBench's computed benchmark within a tolerance band.
    reportConcepts.length > 0 ? prisma.deliverable.findMany({ where: { day, team: { cohortId: cohort.id } } }) : Promise.resolve([]),
    prisma.rubricConfig.findUnique({ where: { cohortId: cohort.id } }),
    // Just the seed — the universe-wide sector "true answer" (see
    // sectors.ts) is computed below, after `universe` (already being
    // resolved above) is available; Promise.all entries can't depend on
    // each other's results.
    hasAnalitica
      ? prisma.universeRun.findFirst({ where: { cohortId: cohort.id, kind: "colombia", status: "DONE" }, orderBy: { createdAt: "desc" }, select: { seed: true } })
      : Promise.resolve(null),
    hasAnalitica
      ? prisma.analyticsRecommendation.findMany({ where: { day, team: { cohortId: cohort.id } } })
      : Promise.resolve([]),
  ]);

  const memberScoresByMemberId = new Map<string, Record<string, number | null>>();
  const teamPublishedByTeamId = new Map<string, boolean>();
  for (const s of memberScores) {
    if (!memberScoresByMemberId.has(s.teamMemberId)) memberScoresByMemberId.set(s.teamMemberId, {});
    memberScoresByMemberId.get(s.teamMemberId)![s.skillId] = s.value;
    if (!teamPublishedByTeamId.has(s.teamMember.teamId)) teamPublishedByTeamId.set(s.teamMember.teamId, s.published);
  }

  const resultByTeamId = new Map((latestRun?.teamResults ?? []).map((r) => [r.teamId, r]));
  const submittedCount = teams.filter((t) => t.tariffSubmissions[0]?.meanPremium != null).length;
  const defaultCuotaPercent = Math.min(100, Math.max(30, Math.ceil(100 / Math.max(submittedCount, 1))));

  // Actuarial (tarifación) score per team for this day's results — same
  // functions computeConsolidado() uses for the final grade, so what the
  // admin sees here always matches what actually gets graded. Día 1 is
  // model-anchored (notaTarifacionAbsoluta); Día 2 stays cohort-relative,
  // per the rubric's configurable objectiveMode.
  const actuarialScoreByTeamId = new Map<string, number>();
  if (includeSim && latestRun?.teamResults.length) {
    const numericIdByTeamId = new Map(latestRun.teamResults.map((r, i) => [r.teamId, i + 1]));
    const rows = latestRun.teamResults.map((r) => ({
      teamId: numericIdByTeamId.get(r.teamId)!,
      totalPremium: r.totalPremium,
      claimsAmount: r.claimsAmount,
    }));
    const scoreByNumericId =
      day === 1 ? notaTarifacionAbsoluta(rows) : notaTarifacionAnio(rows, (rubric?.objectiveMode as "relative" | "ranking") ?? "relative");
    for (const [teamId, numericId] of numericIdByTeamId) {
      const score = scoreByNumericId.get(numericId);
      if (score != null) actuarialScoreByTeamId.set(teamId, score);
    }
  }

  // Día 4 sector exercise: the one true global ranking (never per-team —
  // see sectors.ts's doc comment on why a team's own book is a biased
  // sample), and each team's score against it.
  const sectorStats = hasAnalitica && universe && universeRunForSectors ? getSectorStatsForSeed(universeRunForSectors.seed, universe) : [];
  const trueCrecer = rankForCrecer(sectorStats);
  const trueDisminuir = rankForDisminuir(sectorStats);

  const picksByTeamId = groupSectorPicksByTeam(analyticsRecs);
  const analiticaScoreByTeamId = new Map<string, number>();
  for (const [teamId, picks] of picksByTeamId) {
    const score = scoreSectorRecommendation(picks, trueCrecer, trueDisminuir);
    if (score != null) analiticaScoreByTeamId.set(teamId, score);
  }

  // This day's final "nota objetiva" per team, read straight off
  // computeConsolidado() rather than re-derived here — Día 2's real blend
  // also folds in report-concept scores (reservas, gastos, utilidad neta A1;
  // see concepts.ts's "d2" entries), not just the tariff/ALM scores shown
  // alongside it below, so recomputing it by hand here would drift from
  // what's actually graded.
  const objectiveByTeamId = new Map<string, number>();
  for (const row of consolidadoRows ?? []) {
    const objective = row.perDay[day - 1]?.objective;
    if (objective != null) objectiveByTeamId.set(row.teamId, objective);
  }

  // ALM score per team: needs each team's book of claims (from the completed
  // simulation for bookYear, not necessarily this page's own `day` — Día 3
  // has no simulation of its own, it grades against bookYear=2's) to compute
  // reserves, plus whatever tree they uploaded. This is the *fictitious* ALM
  // only (what's graded for the Día 2/3 ALM nota) — the real ALM (below, via
  // finBenchBundlesByTeamId) is a completely separate, 12-months-at-a-time
  // computation, not a variant of this one (see README §5.3).
  // These two both only depend on `universe` (already resolved above), not
  // on each other, so they run together instead of one after the other.
  const [book, finBenchBundlesByTeamId] = await Promise.all([
    bookYear != null ? getTeamBookForDay(cohort.id, bookYear, universe ?? undefined) : Promise.resolve(null),
    // finBench (P&L/balance/solvency) only needs Year 1's simulation to be
    // DONE — p1 (Year-1 RT/gastos) is meaningful from Day 1 itself, even
    // before any portfolio/Year-2 data exists (it falls back to a default
    // reinvestment yield when almYear1 is null). finBenchBundlesByTeamId
    // additionally exposes the exact real-ALM runs (realAlmYear1/2) that
    // fed bench.p1/p2/bal1/bal2 — used below to show the real ALM ladder
    // without a second, separately-computed "real" run that could drift
    // out of sync with what's actually graded (see finBenchHelper.ts's
    // doc comment).
    day >= 1 ? computeFinBenchBundlesForCohort(cohort.id, universe ?? undefined) : Promise.resolve(new Map()),
  ]);

  const almScoreByTeamId = new Map<string, ReturnType<typeof scoreFinanciero>>();
  const almLadderByTeamId = new Map<string, ReturnType<typeof almLadder>>();
  if (book && hasPortfolioTree) {
    const reservesByTeamId = computeReservesForTeams(book.claimsByTeamId);
    for (const team of teams) {
      const rawAllocation = team.portfolioAllocations[0]?.allocation;
      const reserves = reservesByTeamId.get(team.id);
      if (reserves && isPortfolioDecisionV3(rawAllocation)) {
        almScoreByTeamId.set(team.id, scoreFinanciero(reserves, rawAllocation));
        if (activeTab === "obj") almLadderByTeamId.set(team.id, almLadder(reserves, rawAllocation));
      }
    }
  }
  const finBenchByTeamId = new Map([...finBenchBundlesByTeamId].map(([teamId, b]) => [teamId, b.bench]));

  const capacityByTeamIdByYear = new Map<1 | 2, Map<string, { rejectedCount: number; extra: unknown }>>();
  for (const yr of [1, 2] as const) {
    const run = capacityRuns.find((r) => r.day === yr);
    capacityByTeamIdByYear.set(yr, new Map((run?.teamResults ?? []).map((r) => [r.teamId, { rejectedCount: r.rejectedCount, extra: r.extra }])));
  }

  const tolerance = {
    tolerancePerfect: rubric?.tolerancePerfect ?? 0.05,
    toleranceZero: rubric?.toleranceZero ?? 0.4,
  };

  // Día 1's minimum-variance exercise, per team — scored against the true
  // optimal portfolio at the team's own achieved return, never per-team
  // (see markowitz.ts).
  const minVarScoreByTeamId = new Map<string, number>();
  const minVarWeightsByTeamId = new Map<string, Record<string, number>>();
  if (hasMinVariance) {
    for (const team of teams) {
      const rawAllocation = team.portfolioAllocations[0]?.allocation;
      if (isMinVarianceAllocation(rawAllocation)) {
        minVarWeightsByTeamId.set(team.id, rawAllocation);
        minVarScoreByTeamId.set(team.id, scoreMinVariance(rawAllocation));
      }
    }
  }
  const minVarReferenceWeights = solveLongOnlyMinVariance(TARGET_RETURN);
  const minVarReferenceReturn = portfolioExpectedReturn(minVarReferenceWeights);
  const minVarReferenceVariance = portfolioVariance(minVarReferenceWeights);

  const deliverablesByTeamId = new Map<string, Record<string, number>>();
  for (const d of deliverables) {
    if (!deliverablesByTeamId.has(d.teamId)) deliverablesByTeamId.set(d.teamId, {});
    deliverablesByTeamId.get(d.teamId)![d.conceptId] = d.value;
  }

  // Día 2's finAvg component of the objective grade — averages the
  // financial-profile ("fin") report concepts (gastos, resultado de
  // inversiones, utilidad neta A1; see concepts.ts's "d2" entries), the same
  // way computeConsolidado() does. Día 1 has no "reporte" concepts at all —
  // its financial component is the ALM score alone, shown separately below.
  const finReportScoreByTeamId = new Map<string, number>();
  if (day === 2) {
    const finConcepts = reportConcepts.filter((c) => c.perfil === "fin");
    for (const team of teams) {
      const values = deliverablesByTeamId.get(team.id) ?? {};
      const bench = finBenchByTeamId.get(team.id) ?? null;
      const finScores = finConcepts
        .map((c) => scoreConcepto(c.id, values[c.id] ?? null, bench, tolerance)?.score)
        .filter((s): s is number => s != null);
      const avg = notaPerfilDia(finScores);
      if (avg != null) finReportScoreByTeamId.set(team.id, avg);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Día {day} — {DAY_TITLES[day]}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">{DAY_DESCRIPTIONS[day]}</p>
        <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">
          {submittedCount} de {teams.length} equipos han subido su tarifa completa.
        </p>
      </div>

      <DayTabBar basePath="/admin/day" day={day} activeTab={activeTab} includeSim={includeSim} />

      {activeTab === "sim" && includeSim && (
        <div className="flex flex-col gap-4">
          <SimulationTrigger day={day} defaultCuotaPercent={defaultCuotaPercent} />

          <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-brand-blue)] text-left text-white">
                  <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
                  <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Tarifa</th>
                  <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Asegurados</th>
                  <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Prima total</th>
                  <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Siniestros</th>
                  <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Monto siniestros</th>
                  <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Loss ratio</th>
                  <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Gastos (adq+com+adm)</th>
                  <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">RT</th>
                  <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Cuota máxima (pólizas)</th>
                  {day === 2 && (
                    <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Retenidos/Nuevos</th>
                  )}
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {teams.map((team) => {
                  const submitted = team.tariffSubmissions[0]?.meanPremium != null;
                  const result = resultByTeamId.get(team.id);
                  const lossRatio = result && result.totalPremium > 0 ? result.claimsAmount / result.totalPremium : null;
                  const bench = finBenchByTeamId.get(team.id);
                  const gastos = bench ? bench.p1.gadq + bench.p1.gcom + bench.p1.gadm : null;
                  const capExtra = result?.extra as { capacityLimit?: number; rawCapacityLimit?: number } | null;
                  const cappedByCapital =
                    capExtra?.capacityLimit != null && capExtra?.rawCapacityLimit != null ? capExtra.rawCapacityLimit <= capExtra.capacityLimit : null;
                  return (
                    <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                      <td className="px-4 py-2">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                        {team.name}
                      </td>
                      <td className="px-4 py-2">
                        {submitted ? (
                          team.tariffSubmissions[0]?.outsourced ? (
                            <span className="text-[var(--color-brand-red)]" title="Consultora chilena — opción de emergencia">
                              Tercerizada
                            </span>
                          ) : (
                            <span className="text-[var(--color-brand-green)]">Completa</span>
                          )
                        ) : (
                          <span className="text-[var(--color-brand-text-secondary)]">Pendiente</span>
                        )}
                      </td>
                      <td className="px-4 py-2">{result ? result.insuredCount.toLocaleString("es-CO") : "—"}</td>
                      <td className="px-4 py-2">{result ? `$${Math.round(result.totalPremium).toLocaleString("es-CO")}` : "—"}</td>
                      <td className="px-4 py-2">{result ? result.claimsCount.toLocaleString("es-CO") : "—"}</td>
                      <td className="px-4 py-2">{result ? `$${Math.round(result.claimsAmount).toLocaleString("es-CO")}` : "—"}</td>
                      <td className="px-4 py-2">{lossRatio != null ? `${(lossRatio * 100).toFixed(1)}%` : "—"}</td>
                      <td className="px-4 py-2">{gastos != null ? `$${Math.round(gastos).toLocaleString("es-CO")}` : "—"}</td>
                      <td className="px-4 py-2">{bench ? `$${Math.round(bench.p1.rt).toLocaleString("es-CO")}` : "—"}</td>
                      <td className="px-4 py-2">
                        {capExtra?.capacityLimit != null ? (
                          <>
                            {capExtra.capacityLimit.toLocaleString("es-CO")}
                            <span className={`ml-1 text-[11px] ${cappedByCapital ? "text-[var(--color-brand-blue-accent)]" : "text-[var(--color-brand-text-secondary)]"}`}>
                              ({cappedByCapital ? "solvencia" : "techo fijo"})
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      {day === 2 && (
                        <td className="px-4 py-2">
                          {result?.extra && typeof result.extra === "object" && "retainedCount" in result.extra
                            ? `${(result.extra as { retainedCount: number }).retainedCount.toLocaleString("es-CO")} / ${(result.extra as { newCount: number }).newCount.toLocaleString("es-CO")}`
                            : "—"}
                        </td>
                      )}
                      <td className="px-4 py-2 text-right">
                        {result && (
                          <form action={togglePublishedAction.bind(null, result.id, day)}>
                            <button
                              type="submit"
                              className={`rounded px-3 py-1 text-xs font-semibold ${
                                result.published ? "bg-[var(--color-brand-green)]/15 text-[var(--color-brand-green)]" : "bg-[var(--color-brand-gray-light)] text-[var(--color-brand-text-secondary)]"
                              }`}
                            >
                              {result.published ? "Publicado" : "Publicar"}
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {latestRun && latestRun.status === "DONE" && (
            <form action={publishAllAction.bind(null, latestRun.id, day)}>
              <button
                type="submit"
                className="rounded border border-[var(--color-brand-blue-accent)] px-4 py-2 text-sm font-medium text-[var(--color-brand-blue-accent)] hover:bg-[var(--color-brand-blue-light)]"
              >
                Publicar todos los resultados de este día
              </button>
            </form>
          )}
        </div>
      )}

      {activeTab === "entreg" && (
        <div className="flex flex-col gap-4">
          {hasMinVariance && (
            <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
              <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                Portafolio de mínima varianza — Día {day}
              </h3>
              <div className="mb-4 rounded border border-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-light)] p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">
                  Portafolio correcto (referencia, a {(TARGET_RETURN * 100).toFixed(0)}% de retorno)
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  {INSTRUMENTS.map((ins) => (
                    <span key={ins.id}>
                      <strong>{ins.id}:</strong> {(minVarReferenceWeights[ins.id] * 100).toFixed(1)}%
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-sm">
                  Retorno: {(minVarReferenceReturn * 100).toFixed(2)}% · Varianza: {minVarReferenceVariance.toFixed(6)} · Volatilidad:{" "}
                  {(Math.sqrt(minVarReferenceVariance) * 100).toFixed(2)}%
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                      <th className="py-1 pr-4">Equipo</th>
                      <th className="py-1 pr-4">Estado</th>
                      <th className="py-1 pr-4">Retorno logrado</th>
                      <th className="py-1 pr-4">Varianza lograda</th>
                      <th className="py-1 pr-4">Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((team) => {
                      const weights = minVarWeightsByTeamId.get(team.id);
                      const score = minVarScoreByTeamId.get(team.id);
                      return (
                        <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                          <td className="py-1 pr-4">
                            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                            {team.name}
                          </td>
                          <td className="py-1 pr-4">
                            {weights ? (
                              <span className="text-[var(--color-brand-green)]">Cargado</span>
                            ) : (
                              <span className="text-[var(--color-brand-text-secondary)]">Pendiente</span>
                            )}
                          </td>
                          <td className="py-1 pr-4">{weights ? `${(portfolioExpectedReturn(weights) * 100).toFixed(2)}%` : "—"}</td>
                          <td className="py-1 pr-4">{weights ? portfolioVariance(weights).toFixed(6) : "—"}</td>
                          <td className="py-1 pr-4">{score != null ? score.toFixed(0) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {teams.map((team) => {
                  const weights = minVarWeightsByTeamId.get(team.id);
                  if (!weights) return null;
                  return (
                    <details key={team.id} className="rounded border border-[var(--color-brand-gray-light)]">
                      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                        {team.name} — ver pesos
                      </summary>
                      <div className="flex flex-wrap gap-4 border-t border-[var(--color-brand-gray-light)] p-3 text-sm">
                        {INSTRUMENTS.map((ins) => (
                          <span key={ins.id}>
                            <strong>{ins.id}:</strong> {(weights[ins.id] ?? 0).toFixed(1)}%
                          </span>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] italic text-[var(--color-brand-text-secondary)]">
                Este portafolio también alimenta el tope de cuota de mercado del Año 1 — ver pestaña Simulación.
              </p>
            </div>
          )}

          {hasPortfolioTree && (
            <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
              <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                Portafolios de inversión — Día {day}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                      <th className="py-1 pr-4">Equipo</th>
                      <th className="py-1 pr-4">Portafolio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((team) => (
                      <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                        <td className="py-1 pr-4">
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                          {team.name}
                        </td>
                        <td className="py-1 pr-4">
                          {team.portfolioAllocations[0] ? (
                            <span className="text-[var(--color-brand-green)]">Cargado</span>
                          ) : (
                            <span className="text-[var(--color-brand-text-secondary)]">Pendiente</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {reportConcepts.length > 0 && (
            <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-4">
              <h3 className="mb-3 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                Reportes numéricos — Día {day}
              </h3>
              <div className="flex flex-col gap-3">
                {teams.map((team) => {
                  const values = deliverablesByTeamId.get(team.id) ?? {};
                  const bench = finBenchByTeamId.get(team.id) ?? null;
                  const rows = reportConcepts.map((c) => ({ c, result: scoreConcepto(c.id, values[c.id] ?? null, bench, tolerance) }));
                  const scored = rows.filter((r) => r.result?.score != null);
                  const avgScore = scored.length > 0 ? scored.reduce((s, r) => s + r.result!.score!, 0) / scored.length : null;
                  const fmt = (v: number | null, unit: string) =>
                    v == null ? "—" : unit === "COP" ? `$${Math.round(v).toLocaleString("es-CO")}` : unit === "x" ? `${v.toFixed(2)}×` : v.toFixed(1);
                  return (
                    <details key={team.id} className="rounded border border-[var(--color-brand-gray-light)]">
                      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm">
                        <span>
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                          {team.name}
                        </span>
                        <span className="font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue-accent)]">
                          {avgScore != null ? `Nota promedio: ${avgScore.toFixed(0)}` : "Sin reportes calificables aún"}
                        </span>
                      </summary>
                      <table className="w-full border-t border-[var(--color-brand-gray-light)] text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                            <th className="px-4 py-2">Concepto</th>
                            <th className="px-4 py-2">Reportado</th>
                            <th className="px-4 py-2">Motor</th>
                            <th className="px-4 py-2">Nota</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(({ c, result }) => (
                            <tr key={c.id} className="border-t border-[var(--color-brand-gray-light)]">
                              <td className="px-4 py-2">{c.label}</td>
                              <td className="px-4 py-2">{fmt(result?.val ?? null, c.unit)}</td>
                              <td className="px-4 py-2">{fmt(result?.bench ?? null, c.unit)}</td>
                              <td className="px-4 py-2">{result?.score != null ? result.score.toFixed(0) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  );
                })}
              </div>
            </div>
          )}

          {hasAnalitica && (
            <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)]">
              <div className="p-4 pb-0">
                <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                  Sectores reales — Día {day}
                </h3>
                <p className="mt-1 text-[11px] italic text-[var(--color-brand-text-secondary)]">
                  Multiplicador = pérdida agregada del sector ÷ pérdida agregada de <strong>todo el universo</strong> (base = 1.0×; por encima es más
                  riesgoso que el promedio del mercado, por debajo menos). Pérdida agregada combina frecuencia y severidad: es la mediana de severidad
                  de los siniestros del sector, ponderada por qué fracción de sus expuestos efectivamente reclamó. Se usa la <strong>mediana</strong>{" "}
                  (no el promedio) porque el universo incluye siniestros atípicamente altos (outliers) que distorsionarían un promedio simple —
                  detalle completo en el README, deliberadamente no explicado a los equipos. Solo se listan sectores con al menos{" "}
                  {SECTOR_MIN_COUNT.toLocaleString("es-CO")} expuestos en el universo completo — es la misma verdad global contra la que se califica a
                  todos los equipos, no la cartera propia de ninguno.
                </p>
                <p className="mt-1 text-[11px] italic text-[var(--color-brand-text-secondary)]">
                  <strong>Nota solo para administradores</strong> (no mencionar a los equipos): los cruces que involucran &quot;historial de
                  siniestros&quot; (hist) se excluyen deliberadamente de estos rankings reales. Es una variable trampa: sigue disponible para que un
                  equipo la elija en su recomendación, pero un conteo de siniestros pasados por póliza no define un sector de mercado, así que
                  cualquier equipo que la priorice debería perder puntos frente a quienes reconocieron que no aporta y buscaron cruces entre las
                  demás variables.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                    Top 10 para crecer (menor riesgo relativo)
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                        <th className="py-1 pr-2">#</th>
                        <th className="py-1 pr-2">Sector</th>
                        <th className="py-1 pr-2">Multiplicador</th>
                        <th className="py-1">Expuestos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trueCrecer.slice(0, 10).map((s, i) => (
                        <tr key={sectorKey(s)} className="border-t border-[var(--color-brand-gray-light)]">
                          <td className="py-1 pr-2">{i + 1}</td>
                          <td className="py-1 pr-2">{sectorLabel(s)}</td>
                          <td className="py-1 pr-2">{s.multiplier.toFixed(2)}×</td>
                          <td className="py-1">{s.count.toLocaleString("es-CO")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                    Top 10 para disminuir (mayor riesgo relativo)
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                        <th className="py-1 pr-2">#</th>
                        <th className="py-1 pr-2">Sector</th>
                        <th className="py-1 pr-2">Multiplicador</th>
                        <th className="py-1">Expuestos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trueDisminuir.slice(0, 10).map((s, i) => (
                        <tr key={sectorKey(s)} className="border-t border-[var(--color-brand-gray-light)]">
                          <td className="py-1 pr-2">{i + 1}</td>
                          <td className="py-1 pr-2">{sectorLabel(s)}</td>
                          <td className="py-1 pr-2">{s.multiplier.toFixed(2)}×</td>
                          <td className="py-1">{s.count.toLocaleString("es-CO")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {hasAnalitica && (
            <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-4">
              <h3 className="mb-3 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                Recomendación sectorial por equipo — Día {day}
              </h3>
              <div className="flex flex-col gap-2">
                {teams.map((team) => {
                  const score = analiticaScoreByTeamId.get(team.id);
                  const picks = picksByTeamId.get(team.id);
                  return (
                    <details key={team.id} className="rounded border border-[var(--color-brand-gray-light)]">
                      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm">
                        <span>
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                          {team.name}
                        </span>
                        <span className="font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue-accent)]">
                          {score != null ? `Nota: ${score.toFixed(0)}` : "Sin recomendación aún"}
                        </span>
                      </summary>
                      <div className="grid grid-cols-1 gap-4 border-t border-[var(--color-brand-gray-light)] p-3 sm:grid-cols-2">
                        {(["crecer", "disminuir"] as const).map((listKey) => {
                          const trueRanking = listKey === "crecer" ? trueCrecer : trueDisminuir;
                          const listPicks = picks?.[listKey] ?? [null, null, null];
                          return (
                            <div key={listKey}>
                              <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">{listKey}</p>
                              <table className="w-full text-sm">
                                <tbody>
                                  {listPicks.map((pick, i) => {
                                    if (!pick) {
                                      return (
                                        <tr key={i} className="border-t border-[var(--color-brand-gray-light)]">
                                          <td className="py-1 pr-2 text-[var(--color-brand-text-secondary)]">{i + 1}º</td>
                                          <td className="py-1 text-[var(--color-brand-text-secondary)]">—</td>
                                        </tr>
                                      );
                                    }
                                    const trueIdx = trueRanking.findIndex((s) => sectorKey(s) === sectorKey(pick));
                                    return (
                                      <tr key={i} className="border-t border-[var(--color-brand-gray-light)]">
                                        <td className="py-1 pr-2">{i + 1}º</td>
                                        <td className="py-1">
                                          {sectorLabel(pick)}
                                          <span className="ml-1 text-[var(--color-brand-text-secondary)]">
                                            —{" "}
                                            {trueIdx === -1
                                              ? "no está en el ranking real"
                                              : `real: #${trueIdx + 1} (${trueRanking[trueIdx].multiplier.toFixed(2)}×)`}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "obj" && (
        <div className="flex flex-col gap-4">
          {includeSim && (
            <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)]">
              <div className="p-4 pb-0">
                <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                  Componentes de la nota objetiva — Día {day}
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                    <th className="px-4 py-2">Equipo</th>
                    <th className="px-4 py-2">RT</th>
                    <th className="px-4 py-2">Tarifas</th>
                    <th className="px-4 py-2">{day === 1 ? "Nota mín. varianza" : "Nota financiera"}</th>
                    <th className="px-4 py-2">Nota objetiva</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => {
                    const result = resultByTeamId.get(team.id);
                    const rt = result ? computeRt(result) : null;
                    const actuarialScore = actuarialScoreByTeamId.get(team.id);
                    const finScore = day === 1 ? minVarScoreByTeamId.get(team.id) : finReportScoreByTeamId.get(team.id);
                    const objective = objectiveByTeamId.get(team.id);
                    return (
                      <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                        <td className="px-4 py-2">
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                          {team.name}
                        </td>
                        <td className="px-4 py-2">{rt != null ? `$${Math.round(rt).toLocaleString("es-CO")}` : "—"}</td>
                        <td className="px-4 py-2">{actuarialScore != null ? actuarialScore.toFixed(1) : "—"}</td>
                        <td className="px-4 py-2">{finScore != null ? finScore.toFixed(1) : "—"}</td>
                        <td className="px-4 py-2 font-semibold text-[var(--color-brand-blue-accent)]">{objective != null ? objective.toFixed(1) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {day === 1 && (
                <p className="p-4 pt-2 text-[11px] italic text-[var(--color-brand-text-secondary)]">
                  &ldquo;Nota mín. varianza&rdquo; es la nota del ejercicio de mínima varianza (ver pestaña Entregables para el detalle por equipo) — es el
                  único componente financiero de la nota objetiva de este día, ya que Día 1 no tiene reportes financieros propios.
                </p>
              )}
              {day === 2 && (
                <p className="p-4 pt-2 text-[11px] italic text-[var(--color-brand-text-secondary)]">
                  &ldquo;Nota financiera&rdquo; es el promedio de gastos/resultado de inversiones/utilidad neta A1 reportados (pestaña Entregables) —{" "}
                  <strong>pero no es el componente financiero completo de la nota objetiva</strong>: ese promedia esta columna junto con la Nota ALM
                  (ver la sección &ldquo;ALM — calce del portafolio vs. reservas&rdquo; más abajo), que ya no cabe en esta tabla desde que el árbol de
                  portafolio se movió a este día. La columna &ldquo;Tarifas&rdquo; sí es solo la tarifa: la parte actuarial real también promedia las
                  reservas reportadas (RSA/IBNR) ese mismo día.
                </p>
              )}
            </div>
          )}

          {hasPortfolioTree && bookYear && (
            <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-4">
              <h3 className="mb-3 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                ALM — calce del portafolio vs. reservas de Año {bookYear}
              </h3>
              <div className="flex flex-col gap-3">
                {teams.map((team) => {
                  const almScore = almScoreByTeamId.get(team.id);
                  const ladder = almLadderByTeamId.get(team.id);
                  const bundle = finBenchBundlesByTeamId.get(team.id);
                  const realAlmYear = bookYear === 1 ? bundle?.realAlmYear1 : bundle?.realAlmYear2;
                  const rawAllocation = team.portfolioAllocations[0]?.allocation;
                  const decision = isPortfolioDecisionV3(rawAllocation) ? rawAllocation : undefined;
                  return (
                    <details key={team.id} className="rounded border border-[var(--color-brand-gray-light)]">
                      <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm">
                        <span>
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                          {team.name}
                        </span>
                        <span className="font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue-accent)]">
                          {almScore ? `Nota ALM: ${almScore.nota.toFixed(1)}` : "Sin portafolio o sin reservas aún"}
                        </span>
                      </summary>
                      {almScore && (
                        <div className="border-t border-[var(--color-brand-gray-light)] p-3">
                          <div className="mb-3">
                            <AlmScoreTiles score={almScore} />
                          </div>

                          <div className="mb-3">
                            <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">
                              Árbol de decisión de inversión
                            </p>
                            {decision ? (
                              <PortfolioTreeView tranches={decision.tranches} />
                            ) : (
                              <p className="text-xs text-[var(--color-brand-text-secondary)]">—</p>
                            )}
                          </div>

                          {ladder && <AlmLadderTable rows={ladder.rows} />}
                          {ladder && (
                            <div className="mt-3">
                              <AlmPortfolioTable rows={ladder.rows} />
                            </div>
                          )}

                          {realAlmYear && (
                            <div className="mt-4 border-t border-[var(--color-brand-gray-light)] pt-3">
                              <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">
                                ALM real — con la prima real de este equipo, solo los 12 meses de Año {bookYear} (esto es lo que finBench usa para
                                el Resultado de Inversiones/Balance/Solvencia reales; el ALM ficticio de arriba solo califica la nota de ALM de este día)
                              </p>
                              <div className="flex flex-col gap-3">
                                <AlmPnlBreakdown scoreFicticio={almScore} realYear={realAlmYear} year={bookYear} />
                                <AlmLadderTable rows={realAlmYear.rows} />
                                <AlmPortfolioTable rows={realAlmYear.rows} />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </details>
                  );
                })}
              </div>
            </div>
          )}

          {day >= 2 && finBenchByTeamId.size > 0 && (
            <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-cyan)] bg-[var(--color-brand-surface)]">
              <div className="p-4 pb-0">
                <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                  Financiero (finBench) — Año 1 / Año 2
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                    <th className="px-4 py-2">Equipo</th>
                    <th className="px-4 py-2">Reservas A1</th>
                    <th className="px-4 py-2">Utilidad neta A1</th>
                    <th className="px-4 py-2">Utilidad neta A2</th>
                    <th className="px-4 py-2">Riesgo Fin. (volatilidad)</th>
                    <th className="px-4 py-2">Capital (RK)</th>
                    <th className="px-4 py-2">Margen solvencia</th>
                    <th className="px-4 py-2">Límite de cuota A1</th>
                    <th className="px-4 py-2">Límite de cuota A2</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => {
                    const bench = finBenchByTeamId.get(team.id);
                    if (!bench) return null;
                    const cap1 = capacityByTeamIdByYear.get(1)?.get(team.id);
                    const cap2 = capacityByTeamIdByYear.get(2)?.get(team.id);
                    const cap1Extra = cap1?.extra as { capacityLimit?: number; rawCapacityLimit?: number } | null;
                    const cap2Extra = cap2?.extra as { capacityLimit?: number; rawCapacityLimit?: number } | null;
                    return (
                      <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                        <td className="px-4 py-2">
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                          {team.name}
                        </td>
                        <td className="px-4 py-2">${Math.round(bench.resTotal).toLocaleString("es-CO")}</td>
                        <td className="px-4 py-2">${Math.round(bench.p1.uneta).toLocaleString("es-CO")}</td>
                        <td className="px-4 py-2">{bench.p2 ? `$${Math.round(bench.p2.uneta).toLocaleString("es-CO")}` : "—"}</td>
                        <td className="px-4 py-2">
                          ${Math.round(bench.solRFin).toLocaleString("es-CO")} ({bench.solVolRatio.toFixed(2)}× el promedio del menú)
                        </td>
                        <td className="px-4 py-2">${Math.round(bench.solRk).toLocaleString("es-CO")}</td>
                        <td className="px-4 py-2">{bench.solMargen.toFixed(2)}×</td>
                        <td className="px-4 py-2">
                          {cap1Extra?.capacityLimit != null ? (
                            <>
                              {cap1Extra.capacityLimit.toLocaleString("es-CO")}
                              {cap1 && cap1.rejectedCount > 0 && <span className="text-[var(--color-brand-red)]"> ({cap1.rejectedCount.toLocaleString("es-CO")} rechazadas)</span>}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {cap2Extra?.capacityLimit != null ? (
                            <>
                              {cap2Extra.capacityLimit.toLocaleString("es-CO")}
                              {cap2 && cap2.rejectedCount > 0 && <span className="text-[var(--color-brand-red)]"> ({cap2.rejectedCount.toLocaleString("es-CO")} rechazadas)</span>}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="p-4 pt-2 text-[11px] italic text-[var(--color-brand-text-secondary)]">
                El límite de cuota A2 ya refleja el patrimonio real de esta tabla (bal1.patrimonio) menos lo que el ALM real de ese equipo comprometió en el
                Año 1 — un equipo con Margen de solvencia bajo aquí es, casi siempre, el mismo que tuvo un límite de cuota más ajustado en A2.
              </p>
            </div>
          )}

          {day >= 3 && finBenchByTeamId.size > 0 && (
            <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-cyan)] bg-[var(--color-brand-surface)]">
              <div className="p-4 pb-0">
                <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                  Balance y proyección Año 3
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                    <th className="px-4 py-2">Equipo</th>
                    <th className="px-4 py-2">Activos (fin A1)</th>
                    <th className="px-4 py-2">Activos (fin A2)</th>
                    <th className="px-4 py-2">Patrimonio (fin A2)</th>
                    <th className="px-4 py-2">Utilidad neta A3 (proy.)</th>
                    <th className="px-4 py-2">Margen solvencia</th>
                    <th className="px-4 py-2">Dividendo sugerido</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => {
                    const bench = finBenchByTeamId.get(team.id);
                    if (!bench) return null;
                    return (
                      <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                        <td className="px-4 py-2">
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                          {team.name}
                        </td>
                        <td className="px-4 py-2">${Math.round(bench.bal1.activos).toLocaleString("es-CO")}</td>
                        <td className="px-4 py-2">{bench.bal2 ? `$${Math.round(bench.bal2.activos).toLocaleString("es-CO")}` : "—"}</td>
                        <td className="px-4 py-2">{bench.bal2 ? `$${Math.round(bench.bal2.patrimonio).toLocaleString("es-CO")}` : "—"}</td>
                        <td className="px-4 py-2">{bench.p3 ? `$${Math.round(bench.p3.uneta).toLocaleString("es-CO")}` : "—"}</td>
                        <td className="px-4 py-2">{bench.solMargen.toFixed(2)}×</td>
                        <td className="px-4 py-2">${Math.round(bench.div).toLocaleString("es-CO")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "subj" && (
        <div className="flex flex-col gap-4">
          {skills.length === 0 ? (
            <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5 text-sm text-[var(--color-brand-text-secondary)]">
              No hay habilidades configuradas en la rúbrica —{" "}
              <a href="/admin/config" className="text-[var(--color-brand-blue-accent)] underline">
                configúralas aquí
              </a>
              .
            </div>
          ) : (
            teams.map((team) => {
              const published = teamPublishedByTeamId.get(team.id) ?? false;
              return (
                <div key={team.id} className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                      {team.name}
                    </h3>
                    {team.members.length > 0 && (
                      <form action={toggleMemberScoresPublishedForTeamAction.bind(null, team.id, day)}>
                        <button
                          type="submit"
                          className={`rounded px-3 py-1 text-xs font-semibold ${
                            published ? "bg-[var(--color-brand-green)]/15 text-[var(--color-brand-green)]" : "bg-[var(--color-brand-gray-light)] text-[var(--color-brand-text-secondary)]"
                          }`}
                        >
                          {published ? "Publicado" : "Publicar"}
                        </button>
                      </form>
                    )}
                  </div>

                  {team.members.length === 0 ? (
                    <p className="text-sm text-[var(--color-brand-text-secondary)]">
                      Este equipo no tiene integrantes cargados. La calificación subjetiva es por integrante — sube el{" "}
                      <a href="/admin/config" className="text-[var(--color-brand-blue-accent)] underline">
                        roster
                      </a>{" "}
                      primero.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {team.members.map((member) => (
                        <div key={member.id}>
                          <p className="mb-1 text-xs font-semibold text-[var(--color-brand-text-secondary)]">{member.name}</p>
                          <ScoreForm
                            id={member.id}
                            day={day}
                            skills={skills}
                            initialValues={memberScoresByMemberId.get(member.id) ?? {}}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "top" && (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-brand-blue)] text-left text-white">
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">#</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Objetivo</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Subjetivo</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Nota del día</th>
              </tr>
            </thead>
            <tbody>
              {(consolidadoRows ?? [])
                .map((r) => ({ r, nota: r.perDay[day - 1]?.nota ?? -Infinity }))
                .sort((a, b) => b.nota - a.nota)
                .map(({ r }, i) => {
                  const d = r.perDay[day - 1];
                  return (
                    <tr key={r.teamId} className="border-t border-[var(--color-brand-gray-light)]">
                      <td className="px-4 py-2">{i + 1}</td>
                      <td className="px-4 py-2">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                        {r.teamName}
                      </td>
                      <td className="px-4 py-2">{d?.objective != null ? d.objective.toFixed(1) : "—"}</td>
                      <td className="px-4 py-2">{d?.subjective != null ? d.subjective.toFixed(1) : "—"}</td>
                      <td className="px-4 py-2 font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue-accent)]">
                        {d?.nota != null ? d.nota.toFixed(1) : "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
