import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { publishAllAction, togglePublishedAction, toggleMemberScoresPublishedForTeamAction } from "@/lib/adminActions";
import { getTeamBookForDay, computeReservesForTeams, getSegmentDataForTeams } from "@/lib/teamBook";
import { computeFinBenchForCohort } from "@/lib/finBenchHelper";
import { scoreFinanciero, almLadder } from "@/domain/finance/alm";
import { BUILD_MONTHS } from "@/domain/reserving/constants";
import { isPortfolioDecisionV3 } from "@/domain/finance/instruments";
import { AlmScoreTiles, AlmLadderTable, AlmPortfolioTable, AlmPnlBreakdown, PortfolioTreeView } from "@/components/AlmLadderTable";
import { conceptosDia, scoreConcepto } from "@/domain/grading/concepts";
import type { Dia } from "@/domain/grading/concepts";
import { scoreAnalitica } from "@/domain/grading/analytics";
import type { Recommendation } from "@/domain/grading/analytics";
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
  const { tab } = await searchParams;
  const activeTab = (tab as DayTabKey) ?? (includeSim ? "sim" : "entreg");
  const cohort = await getOrCreateActiveCohort();

  const teams = await prisma.team.findMany({
    where: { cohortId: cohort.id },
    include: {
      tariffSubmissions: { where: { day }, select: { meanPremium: true } },
      portfolioAllocations: { where: { day }, select: { allocation: true } },
      members: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const [skills, memberScores] = await Promise.all([
    prisma.skill.findMany({ where: { rubricConfig: { cohortId: cohort.id } }, orderBy: { name: "asc" } }),
    prisma.memberScore.findMany({
      where: { day, teamMember: { team: { cohortId: cohort.id } } },
      include: { teamMember: { select: { teamId: true } } },
    }),
  ]);
  const memberScoresByMemberId = new Map<string, Record<string, number | null>>();
  const teamPublishedByTeamId = new Map<string, boolean>();
  for (const s of memberScores) {
    if (!memberScoresByMemberId.has(s.teamMemberId)) memberScoresByMemberId.set(s.teamMemberId, {});
    memberScoresByMemberId.get(s.teamMemberId)![s.skillId] = s.value;
    if (!teamPublishedByTeamId.has(s.teamMember.teamId)) teamPublishedByTeamId.set(s.teamMember.teamId, s.published);
  }

  const latestRun = await prisma.simulationRun.findFirst({
    where: { cohortId: cohort.id, day },
    orderBy: { createdAt: "desc" },
    include: { teamResults: true },
  });

  const resultByTeamId = new Map((latestRun?.teamResults ?? []).map((r) => [r.teamId, r]));
  const submittedCount = teams.filter((t) => t.tariffSubmissions[0]?.meanPremium != null).length;
  const defaultCuotaPercent = Math.min(100, Math.max(30, Math.ceil(100 / Math.max(submittedCount, 1))));

  const consolidadoRows = activeTab === "top" ? await computeConsolidado(cohort.id) : null;

  // ALM score per team: needs each team's book of claims (from the completed
  // simulation) to compute reserves, plus whatever portfolio they uploaded.
  // Alongside the fictitious ALM (what's graded), also run the exact same
  // decision tree funded by the team's real premium for this day/year
  // (resultByTeamId, already day-scoped) — informational, so evaluators can
  // see where a team's real P&G investment-result figure should come from
  // (see AlmPnlBreakdown and README §5.3).
  const almScoreByTeamId = new Map<string, ReturnType<typeof scoreFinanciero>>();
  const almLadderByTeamId = new Map<string, ReturnType<typeof almLadder>>();
  const almScoreRealByTeamId = new Map<string, ReturnType<typeof scoreFinanciero>>();
  const almLadderRealByTeamId = new Map<string, ReturnType<typeof almLadder>>();
  if (latestRun?.status === "DONE") {
    const book = await getTeamBookForDay(cohort.id, day);
    if (book) {
      const reservesByTeamId = computeReservesForTeams(book.claimsByTeamId);
      for (const team of teams) {
        const rawAllocation = team.portfolioAllocations[0]?.allocation;
        const reserves = reservesByTeamId.get(team.id);
        if (reserves && isPortfolioDecisionV3(rawAllocation)) {
          almScoreByTeamId.set(team.id, scoreFinanciero(reserves, rawAllocation));
          if (activeTab === "obj") {
            almLadderByTeamId.set(team.id, almLadder(reserves, rawAllocation));
            const realPremium = resultByTeamId.get(team.id)?.totalPremium;
            if (realPremium != null) {
              const aporteMensualReal = realPremium / BUILD_MONTHS;
              almScoreRealByTeamId.set(team.id, scoreFinanciero(reserves, rawAllocation, aporteMensualReal));
              almLadderRealByTeamId.set(team.id, almLadder(reserves, rawAllocation, aporteMensualReal));
            }
          }
        }
      }
    }
  }

  // finBench (P&L/balance/solvency) only needs Year 1's simulation to be
  // DONE — p1 (Year-1 RT/gastos) is meaningful from Day 1 itself, even
  // before any portfolio/Year-2 data exists (it falls back to a default
  // reinvestment yield when almYear1 is null).
  const finBenchByTeamId = day >= 1 ? await computeFinBenchForCohort(cohort.id) : new Map();

  // Deliverables: teams self-report numeric concepts, graded against
  // finBench's computed benchmark within a tolerance band.
  const reportConcepts = conceptosDia(`d${day}` as Dia).filter((c) => c.tipo === "reporte");
  const hasAnalitica = conceptosDia(`d${day}` as Dia).some((c) => c.tipo === "auto_analitica");
  const [deliverables, rubric, segmentDataByTeamId, analyticsRecs] = await Promise.all([
    reportConcepts.length > 0 ? prisma.deliverable.findMany({ where: { day, team: { cohortId: cohort.id } } }) : [],
    prisma.rubricConfig.findUnique({ where: { cohortId: cohort.id } }),
    hasAnalitica ? getSegmentDataForTeams(cohort.id) : null,
    hasAnalitica ? prisma.analyticsRecommendation.findMany({ where: { day, team: { cohortId: cohort.id } } }) : [],
  ]);
  const tolerance = {
    tolerancePerfect: rubric?.tolerancePerfect ?? 0.05,
    toleranceZero: rubric?.toleranceZero ?? 0.4,
  };
  const deliverablesByTeamId = new Map<string, Record<string, number>>();
  for (const d of deliverables) {
    if (!deliverablesByTeamId.has(d.teamId)) deliverablesByTeamId.set(d.teamId, {});
    deliverablesByTeamId.get(d.teamId)![d.conceptId] = d.value;
  }
  const analyticsRecByTeamId = new Map<string, Record<string, Recommendation>>();
  for (const r of analyticsRecs) {
    if (!analyticsRecByTeamId.has(r.teamId)) analyticsRecByTeamId.set(r.teamId, {});
    analyticsRecByTeamId.get(r.teamId)![r.segmentKey] = r.recommendation as Recommendation;
  }
  const analiticaScoreByTeamId = new Map<string, number | null>();
  if (hasAnalitica && segmentDataByTeamId) {
    for (const [teamId, segData] of segmentDataByTeamId) {
      const recs = analyticsRecByTeamId.get(teamId) ?? {};
      analiticaScoreByTeamId.set(teamId, scoreAnalitica(recs, segData));
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
                  return (
                    <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                      <td className="px-4 py-2">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                        {team.name}
                      </td>
                      <td className="px-4 py-2">
                        {submitted ? <span className="text-[var(--color-brand-green)]">Completa</span> : <span className="text-[var(--color-brand-text-secondary)]">Pendiente</span>}
                      </td>
                      <td className="px-4 py-2">{result ? result.insuredCount.toLocaleString("es-CO") : "—"}</td>
                      <td className="px-4 py-2">{result ? `$${Math.round(result.totalPremium).toLocaleString("es-CO")}` : "—"}</td>
                      <td className="px-4 py-2">{result ? result.claimsCount.toLocaleString("es-CO") : "—"}</td>
                      <td className="px-4 py-2">{result ? `$${Math.round(result.claimsAmount).toLocaleString("es-CO")}` : "—"}</td>
                      <td className="px-4 py-2">{lossRatio != null ? `${(lossRatio * 100).toFixed(1)}%` : "—"}</td>
                      <td className="px-4 py-2">{gastos != null ? `$${Math.round(gastos).toLocaleString("es-CO")}` : "—"}</td>
                      <td className="px-4 py-2">{bench ? `$${Math.round(bench.p1.rt).toLocaleString("es-CO")}` : "—"}</td>
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
          {includeSim && (
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
            <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)]">
              <div className="p-4 pb-0">
                <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                  Reportes numéricos — Día {day}
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                    <th className="px-4 py-2">Equipo</th>
                    <th className="px-4 py-2">Concepto</th>
                    <th className="px-4 py-2">Reportado</th>
                    <th className="px-4 py-2">Motor</th>
                    <th className="px-4 py-2">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.flatMap((team) => {
                    const values = deliverablesByTeamId.get(team.id) ?? {};
                    const bench = finBenchByTeamId.get(team.id) ?? null;
                    return reportConcepts.map((c) => {
                      const result = scoreConcepto(c.id, values[c.id] ?? null, bench, tolerance);
                      const fmt = (v: number | null) =>
                        v == null ? "—" : c.unit === "COP" ? `$${Math.round(v).toLocaleString("es-CO")}` : c.unit === "x" ? `${v.toFixed(2)}×` : v.toFixed(1);
                      return (
                        <tr key={`${team.id}-${c.id}`} className="border-t border-[var(--color-brand-gray-light)]">
                          <td className="px-4 py-2">
                            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                            {team.name}
                          </td>
                          <td className="px-4 py-2">{c.label}</td>
                          <td className="px-4 py-2">{fmt(result?.val ?? null)}</td>
                          <td className="px-4 py-2">{fmt(result?.bench ?? null)}</td>
                          <td className="px-4 py-2">{result?.score != null ? result.score.toFixed(0) : "—"}</td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          )}

          {hasAnalitica && (
            <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)]">
              <div className="p-4 pb-0">
                <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                  Analítica sectorial — Día {day}
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                    <th className="px-4 py-2">Equipo</th>
                    <th className="px-4 py-2">Nota analítica</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => {
                    const score = analiticaScoreByTeamId.get(team.id);
                    return (
                      <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                        <td className="px-4 py-2">
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                          {team.name}
                        </td>
                        <td className="px-4 py-2">{score != null ? score.toFixed(0) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "obj" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-4">
            <h3 className="mb-3 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              ALM — calce del portafolio vs. reservas
            </h3>
            <div className="flex flex-col gap-3">
              {teams.map((team) => {
                const almScore = almScoreByTeamId.get(team.id);
                const ladder = almLadderByTeamId.get(team.id);
                const almScoreReal = almScoreRealByTeamId.get(team.id);
                const ladderReal = almLadderRealByTeamId.get(team.id);
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

                        {almScoreReal && (
                          <div className="mt-4 border-t border-[var(--color-brand-gray-light)] pt-3">
                            <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">
                              ALM real — con la prima real de este equipo (informativo, no se califica)
                            </p>
                            <div className="flex flex-col gap-3">
                              <AlmPnlBreakdown scoreFicticio={almScore} scoreReal={almScoreReal} year={day === 1 ? 1 : 2} />
                              {ladderReal && <AlmLadderTable rows={ladderReal.rows} />}
                              {ladderReal && <AlmPortfolioTable rows={ladderReal.rows} />}
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
                        <td className="px-4 py-2">${Math.round(bench.resTotal).toLocaleString("es-CO")}</td>
                        <td className="px-4 py-2">${Math.round(bench.p1.uneta).toLocaleString("es-CO")}</td>
                        <td className="px-4 py-2">{bench.p2 ? `$${Math.round(bench.p2.uneta).toLocaleString("es-CO")}` : "—"}</td>
                        <td className="px-4 py-2">
                          ${Math.round(bench.solRFin).toLocaleString("es-CO")} ({bench.solVolRatio.toFixed(2)}× el promedio del menú)
                        </td>
                        <td className="px-4 py-2">${Math.round(bench.solRk).toLocaleString("es-CO")}</td>
                        <td className="px-4 py-2">{bench.solMargen.toFixed(2)}×</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
