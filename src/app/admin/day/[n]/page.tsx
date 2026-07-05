import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { publishAllAction, togglePublishedAction, toggleMemberScoresPublishedForTeamAction } from "@/lib/adminActions";
import { getTeamBookForDay, computeReservesForTeams, getSegmentDataForTeams } from "@/lib/teamBook";
import { computeFinBenchForCohort } from "@/lib/finBenchHelper";
import { scoreFinanciero, almLadder } from "@/domain/finance/alm";
import { isPortfolioDecision } from "@/domain/finance/instruments";
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
  const almScoreByTeamId = new Map<string, ReturnType<typeof scoreFinanciero>>();
  const almLadderByTeamId = new Map<string, ReturnType<typeof almLadder>>();
  if (latestRun?.status === "DONE") {
    const book = await getTeamBookForDay(cohort.id, day);
    if (book) {
      const reservesByTeamId = computeReservesForTeams(book.claimsByTeamId);
      for (const team of teams) {
        const rawAllocation = team.portfolioAllocations[0]?.allocation;
        const reserves = reservesByTeamId.get(team.id);
        if (reserves && isPortfolioDecision(rawAllocation)) {
          almScoreByTeamId.set(team.id, scoreFinanciero(reserves, rawAllocation.initial, rawAllocation.reinvest));
          if (activeTab === "obj") almLadderByTeamId.set(team.id, almLadder(reserves, rawAllocation.initial, rawAllocation.reinvest));
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
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          Día {day} — {DAY_TITLES[day]}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">{DAY_DESCRIPTIONS[day]}</p>
        <p className="mt-1 text-sm text-gray-600">
          {submittedCount} de {teams.length} equipos han subido su tarifa completa.
        </p>
      </div>

      <DayTabBar basePath="/admin/day" day={day} activeTab={activeTab} includeSim={includeSim} />

      {activeTab === "sim" && includeSim && (
        <div className="flex flex-col gap-4">
          <SimulationTrigger day={day} defaultCuotaPercent={defaultCuotaPercent} />

          <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-white">
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
                        {submitted ? <span className="text-green-700">Completa</span> : <span className="text-gray-400">Pendiente</span>}
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
                                result.published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
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
                className="rounded border border-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-[var(--color-brand-blue)] hover:bg-[var(--color-brand-blue-light)]"
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
            <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-white p-5">
              <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
                Portafolios de inversión — Día {day}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
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
                            <span className="text-green-700">Cargado</span>
                          ) : (
                            <span className="text-gray-400">Pendiente</span>
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
            <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-white">
              <div className="p-4 pb-0">
                <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
                  Reportes numéricos — Día {day}
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
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
            <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-white">
              <div className="p-4 pb-0">
                <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
                  Analítica sectorial — Día {day}
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
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
          <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-white p-4">
            <h3 className="mb-3 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
              ALM — calce del portafolio vs. reservas
            </h3>
            <div className="flex flex-col gap-3">
              {teams.map((team) => {
                const almScore = almScoreByTeamId.get(team.id);
                const ladder = almLadderByTeamId.get(team.id);
                const rawAllocation = team.portfolioAllocations[0]?.allocation;
                const decision = isPortfolioDecision(rawAllocation) ? rawAllocation : undefined;
                return (
                  <details key={team.id} className="rounded border border-[var(--color-brand-gray-light)]">
                    <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm">
                      <span>
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                        {team.name}
                      </span>
                      <span className="font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue)]">
                        {almScore ? `Nota ALM: ${almScore.nota.toFixed(1)}` : "Sin portafolio o sin reservas aún"}
                      </span>
                    </summary>
                    {almScore && (
                      <div className="border-t border-[var(--color-brand-gray-light)] p-3">
                        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                          <div>
                            <p className="text-xs text-gray-500">Calce (45%)</p>
                            <p className="font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-blue)]">
                              {almScore.calce.toFixed(1)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Rendimiento (45%)</p>
                            <p className="font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-blue)]">
                              {almScore.rendimiento.toFixed(1)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Liquidez (10%)</p>
                            <p className="font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-blue)]">
                              {almScore.liquidez.toFixed(1)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Reserva</p>
                            <p className="text-sm font-semibold">${Math.round(almScore.reserva).toLocaleString("es-CO")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Brecha máxima (peor mes)</p>
                            <p className="text-sm font-semibold">
                              ${Math.round(almScore.peakGap).toLocaleString("es-CO")} ({(almScore.peakShortfallRatio * 100).toFixed(1)}% de la reserva)
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Brecha promedio (todo el horizonte)</p>
                            <p className="text-sm font-semibold">
                              {(almScore.avgShortfallRatio * 100).toFixed(1)}% de la reserva acumulada en déficit
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Rendimiento portafolio (nominal, ponderado)</p>
                            <p className="text-sm font-semibold">{(almScore.portYield * 100).toFixed(2)}%</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Rendimiento efectivo simulado</p>
                            <p className="text-sm font-semibold">{(almScore.effYield * 100).toFixed(2)}%</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Cobertura liquidez (6 meses)</p>
                            <p className="text-sm font-semibold">
                              ${Math.round(almScore.liq6).toLocaleString("es-CO")} / ${Math.round(almScore.liab6).toLocaleString("es-CO")} ({(almScore.cobertura * 100).toFixed(0)}%)
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Ingreso total simulado</p>
                            <p className="text-sm font-semibold">${Math.round(almScore.totIncome).toLocaleString("es-CO")}</p>
                          </div>
                        </div>

                        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase text-gray-500">
                              Asignación inicial (fondeo Año 1)
                            </p>
                            <p className="text-xs text-gray-600">
                              {decision?.initial
                                ? Object.entries(decision.initial)
                                    .map(([id, w]) => `${id}: ${Number(w).toFixed(1)}`)
                                    .join(" · ")
                                : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="mb-1 text-xs font-semibold uppercase text-gray-500">
                              Política de reinversión (post Año 1)
                            </p>
                            <p className="text-xs text-gray-600">
                              {decision?.reinvest
                                ? Object.entries(decision.reinvest)
                                    .map(([id, w]) => `${id}: ${Number(w).toFixed(1)}`)
                                    .join(" · ")
                                : "—"}
                            </p>
                          </div>
                        </div>

                        {ladder && ladder.rows.length > 0 && (
                          <>
                            <p className="mb-1 text-xs font-semibold uppercase text-gray-500">
                              Flujo esperado (pasivo) vs. lo que aportó el portafolio, mes a mes
                            </p>
                            <div className="max-h-64 overflow-y-auto overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-white">
                                  <tr className="text-left uppercase tracking-wide text-gray-500">
                                    <th className="px-2 py-1">Mes</th>
                                    <th className="px-2 py-1">Política</th>
                                    <th className="px-2 py-1">Pago requerido</th>
                                    <th className="px-2 py-1">Aporte</th>
                                    <th className="px-2 py-1">Ingresos (aporte+venc.+rend.)</th>
                                    <th className="px-2 py-1">Saldo caja</th>
                                    <th className="px-2 py-1">Brecha (déficit)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ladder.rows.map((r, i) => (
                                    <tr key={i} className={`border-t border-[var(--color-brand-gray-light)] ${r.brecha > 0 ? "bg-red-50" : ""}`}>
                                      <td className="px-2 py-1">{r.mes}</td>
                                      <td className="px-2 py-1">{r.fase === "a1" ? "Inicial" : "Reinversión"}</td>
                                      <td className="px-2 py-1">${Math.round(r.pago).toLocaleString("es-CO")}</td>
                                      <td className="px-2 py-1">${Math.round(r.aporte).toLocaleString("es-CO")}</td>
                                      <td className="px-2 py-1">${Math.round(r.ingresos).toLocaleString("es-CO")}</td>
                                      <td className="px-2 py-1">${Math.round(r.saldo).toLocaleString("es-CO")}</td>
                                      <td className="px-2 py-1">{r.brecha > 0 ? `$${Math.round(r.brecha).toLocaleString("es-CO")}` : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </details>
                );
              })}
            </div>
          </div>

          {day >= 2 && finBenchByTeamId.size > 0 && (
            <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-cyan)] bg-white">
              <div className="p-4 pb-0">
                <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
                  Financiero (finBench) — Año 1 / Año 2
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2">Equipo</th>
                    <th className="px-4 py-2">Reservas A1</th>
                    <th className="px-4 py-2">Utilidad neta A1</th>
                    <th className="px-4 py-2">Utilidad neta A2</th>
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
            <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-cyan)] bg-white">
              <div className="p-4 pb-0">
                <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
                  Balance y proyección Año 3
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
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
            <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-white p-5 text-sm text-gray-500">
              No hay habilidades configuradas en la rúbrica —{" "}
              <a href="/admin/config" className="text-[var(--color-brand-blue)] underline">
                configúralas aquí
              </a>
              .
            </div>
          ) : (
            teams.map((team) => {
              const published = teamPublishedByTeamId.get(team.id) ?? false;
              return (
                <div key={team.id} className="rounded-lg border border-[var(--color-brand-gray-light)] bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                      {team.name}
                    </h3>
                    {team.members.length > 0 && (
                      <form action={toggleMemberScoresPublishedForTeamAction.bind(null, team.id, day)}>
                        <button
                          type="submit"
                          className={`rounded px-3 py-1 text-xs font-semibold ${
                            published ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {published ? "Publicado" : "Publicar"}
                        </button>
                      </form>
                    )}
                  </div>

                  {team.members.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      Este equipo no tiene integrantes cargados. La calificación subjetiva es por integrante — sube el{" "}
                      <a href="/admin/config" className="text-[var(--color-brand-blue)] underline">
                        roster
                      </a>{" "}
                      primero.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {team.members.map((member) => (
                        <div key={member.id}>
                          <p className="mb-1 text-xs font-semibold text-gray-600">{member.name}</p>
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
        <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-white">
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
                      <td className="px-4 py-2 font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue)]">
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
