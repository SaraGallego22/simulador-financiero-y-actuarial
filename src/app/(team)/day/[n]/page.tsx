import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TariffUpload } from "@/components/team/TariffUpload";
import { PortfolioForm } from "@/components/team/PortfolioForm";
import { MinVarianceForm } from "@/components/team/MinVarianceForm";
import { DeliverablesForm } from "@/components/team/DeliverablesForm";
import { DeliverablesReadOnly } from "@/components/team/DeliverablesReadOnly";
import { AnalyticsForm } from "@/components/team/AnalyticsForm";
import { PillTabBar } from "@/components/PillTabBar";
import { LockIcon } from "@/components/ui/icons";
import { conceptosDia } from "@/domain/grading/concepts";
import type { Dia } from "@/domain/grading/concepts";
import { isMinVarianceAllocation, isPortfolioDecisionV4 } from "@/domain/finance/instruments";
import { scoreFinanciero, almLadder } from "@/domain/finance/alm";
import { TARGET_RETURN, portfolioExpectedReturn, portfolioVariance, scoreMinVariance, solveLongOnlyMinVariance } from "@/domain/finance/markowitz";
import { getTeamBookForDay, computeReservesForTeams } from "@/lib/teamBook";
import { AlmScoreTiles, AlmLadderTable, AlmPortfolioTable } from "@/components/AlmLadderTable";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { computeMarketLossRatio } from "@/lib/consolidado";
import { DAY_TITLES, DAY_DESCRIPTIONS, TAB_NOTES, SIMULATED_YEAR_LABEL } from "@/lib/days";

// Never statically prerender — see admin/standings/page.tsx.
export const dynamic = "force-dynamic";

function TabNote({ children }: { children: string }) {
  return (
    <p className="rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2 text-xs text-[var(--color-brand-text-secondary)]">
      <span className="font-semibold text-[var(--color-brand-blue-accent)]">Indicación — </span>
      {children}
    </p>
  );
}

type MinVarResult = { weights: Record<string, number>; achievedVariance: number; trueVariance: number; achievedReturn: number; score: number };

/**
 * A past year's simulation outcome (asegurados/siniestros/rechazadas, tope de
 * cuota, reporte descargable) — always shown on the *following* day's page,
 * never the day the market actually closed: teams submit each year's tariff
 * blind, and only see how it played out once they're working on the next
 * year's numbers (Día 2 shows 2027, Día 3 shows 2028). There's no per-team
 * ranking shown anywhere on the team view anymore — the standalone
 * "Resultados objetivos" (current day's own results) and "Top del día"
 * (cross-team ranking) sections were dropped when the team view collapsed
 * into a single panel per day.
 */
function ObjectiveResultsCard({
  yearLabel,
  result,
  reportDay,
}: {
  yearLabel: string;
  result: { insuredCount: number; claimsCount: number; rejectedCount: number; extra: unknown } | null;
  /** Day whose CSV report to link. */
  reportDay: number;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-cyan)] bg-[var(--color-brand-surface)] p-5">
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Resultados objetivos — {yearLabel}
      </h3>
      {result ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Asegurados</p>
            <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
              {result.insuredCount.toLocaleString("es-CO")}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Siniestros</p>
            <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
              {result.claimsCount.toLocaleString("es-CO")}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Pólizas rechazadas</p>
            <p
              className={`font-[family-name:var(--font-condensed)] text-xl font-bold ${result.rejectedCount > 0 ? "text-[var(--color-brand-red)]" : "text-[var(--color-brand-blue-accent)]"}`}
            >
              {result.rejectedCount.toLocaleString("es-CO")}
            </p>
          </div>
          {(() => {
            const extra = result.extra as { capacityLimit?: number; rawCapacityLimit?: number } | null;
            if (extra?.capacityLimit == null || extra.rawCapacityLimit == null) return null;
            // capacityLimit = min(rawCapacityLimit, techo del admin) — si
            // son iguales, tu propio capital fue lo que te limitó; si el
            // límite aplicado es menor que tu capacidad por capital, fue
            // el techo del admin el que te limitó primero.
            const cappedByCapital = extra.rawCapacityLimit <= extra.capacityLimit;
            return (
              <div className="col-span-2 sm:col-span-3">
                <p className="rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2 text-xs text-[var(--color-brand-text-secondary)]">
                  <span className="font-semibold text-[var(--color-brand-blue-accent)]">Tu límite de cuota este año — </span>
                  tu capital disponible y el riesgo de tu portafolio permitían asegurar hasta {extra.rawCapacityLimit.toLocaleString("es-CO")} pólizas
                  manteniendo un margen de solvencia de al menos 1.0x. El límite que realmente se aplicó fue{" "}
                  {extra.capacityLimit.toLocaleString("es-CO")} — {cappedByCapital ? "tu propio capital fue lo que te limitó primero" : "el techo máximo que fijó el admin te limitó antes de llegar a tu propia capacidad"}.
                  En el Día 4 puedes ver la conexión completa con tu solvencia real.
                </p>
              </div>
            );
          })()}
          <div className="col-span-2 sm:col-span-3 flex flex-col gap-1">
            <a
              href={`/api/teams/report?day=${reportDay}`}
              className="inline-block w-fit rounded-full px-4 py-2 text-sm font-medium text-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-accent)]/12 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 active:translate-y-0 hover:bg-[var(--color-brand-blue-accent)]/20 hover:shadow-[var(--shadow-md)]"
            >
              Descargar reporte de tu cartera (CSV)
            </a>
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              Como en cualquier dataset real, revisa la calidad de los datos antes de usarlos — no asumas que todas las columnas llegan limpias.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-brand-text-secondary)]">Los resultados objetivos de {yearLabel} todavía no están disponibles.</p>
      )}
    </div>
  );
}

function MinVarianceResultCard({ result }: { result: MinVarResult | null }) {
  return (
    <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Mínima varianza — tu portafolio vs. el óptimo real
      </h3>
      {result ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Retorno esperado</p>
            <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
              {(result.achievedReturn * 100).toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Varianza lograda</p>
            <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
              {result.achievedVariance.toFixed(6)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Varianza mínima real</p>
            <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
              {result.trueVariance.toFixed(6)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Nota</p>
            <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">{result.score.toFixed(0)}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-brand-text-secondary)]">Aún no tienes un portafolio de mínima varianza guardado.</p>
      )}
    </div>
  );
}

export default async function TeamDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ n: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { n } = await params;
  const { tab } = await searchParams;
  const day = Number(n);
  // Only Día 3 has tabs — "Respuestas Día 2" (default, reference) vs.
  // "Entregables Día 3" (this day's own report form). See PillTabBar usage below.
  const activeTab = tab === "d3" ? "d3" : "d2";
  const cohort = await getOrCreateActiveCohort();
  if (day > cohort.openDay) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-8">
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Día {day} — {DAY_TITLES[day]}
        </h1>
        <p className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5 text-sm text-[var(--color-brand-text-secondary)]">
          <LockIcon className="h-4 w-4 shrink-0" /> Este día todavía no está disponible. El evaluador lo habilita a medida que avanza el reto.
        </p>
      </main>
    );
  }
  const session = await auth();
  const teamId = session?.user.teamId ?? null;

  // Only the serializable fields — Concepto.get is a function and can't
  // cross the Server->Client Component boundary (see DeliverablesForm).
  const reportConcepts = conceptosDia(`d${day}` as Dia)
    .filter((c) => c.tipo === "reporte")
    .map((c) => ({ id: c.id, label: c.label, unit: c.unit, group: c.group }));
  const hasAnalitica = conceptosDia(`d${day}` as Dia).some((c) => c.tipo === "auto_analitica");
  // Día 2's own P&G/Balance lines, shown read-only on Día 3's "Respuestas Día 2" tab.
  const day2ReportConcepts = conceptosDia("d2")
    .filter((c) => c.tipo === "reporte")
    .map((c) => ({ id: c.id, label: c.label, unit: c.unit, group: c.group }));

  // Real market-wide loss ratio for the closed 2027 market — reference for a
  // team's own Expected Loss Ratio estimate (Día 2's guide §2), not any
  // individual team's figures. See computeMarketLossRatio's doc comment.
  const marketLossRatio = day === 2 ? await computeMarketLossRatio(cohort.id, 1) : null;

  const [
    submission,
    dayResult,
    allocation,
    deliverables,
    analyticsRecs,
    day1Result,
    day1Allocation,
    day2Result,
    day2Allocation,
    capacityHistory,
    day2Deliverables,
  ] = await Promise.all([
      teamId && (day === 1 || day === 2)
        ? prisma.tariffSubmission.findUnique({ where: { teamId_day: { teamId, day } }, select: { meanPremium: true, outsourced: true } })
        : null,
      // Gates whether an outsourced tariff's premium is revealed to the team
      // yet — see TariffUpload's resultsRevealed prop and
      // hasDaySimResult()'s doc comment in lib/tariffAccess.ts. Distinct
      // from ObjectiveResultsCard above, which shows the *previous* day's
      // results, not this day's own (never surfaced on the team view).
      teamId && (day === 1 || day === 2)
        ? prisma.teamSimResult.findFirst({ where: { teamId, simulationRun: { day, status: "DONE" } }, orderBy: { simulationRun: { createdAt: "desc" } } })
        : null,
      teamId ? prisma.portfolioAllocation.findUnique({ where: { teamId_day: { teamId, day } } }) : null,
      teamId && reportConcepts.length > 0 ? prisma.deliverable.findMany({ where: { teamId, day } }) : [],
      teamId && hasAnalitica ? prisma.analyticsRecommendation.findMany({ where: { teamId, day } }) : [],
      // Día 2 shows Día 1's ("2027") results — see ObjectiveResultsCard's doc comment.
      day === 2 && teamId
        ? prisma.teamSimResult.findFirst({ where: { teamId, simulationRun: { day: 1, status: "DONE" } }, orderBy: { simulationRun: { createdAt: "desc" } } })
        : null,
      day === 2 && teamId ? prisma.portfolioAllocation.findUnique({ where: { teamId_day: { teamId, day: 1 } } }) : null,
      // Día 3 shows Día 2's ("2028") results.
      day === 3 && teamId
        ? prisma.teamSimResult.findFirst({ where: { teamId, simulationRun: { day: 2, status: "DONE" } }, orderBy: { simulationRun: { createdAt: "desc" } } })
        : null,
      day === 3 && teamId ? prisma.portfolioAllocation.findUnique({ where: { teamId_day: { teamId, day: 2 } } }) : null,
      // Día 4 retrospective: both years' capital-derived market-share limits
      // side by side, so a team whose growth was capped can connect it to the
      // solvency figures it's reporting this same day (see README's market
      // section) — the team's own view never sees finBench's raw bench
      // figures (only admin does, see admin/day/[n]/page.tsx), so this reuses
      // TeamSimResult from Día 1/2 instead of computing a fresh finBench() here.
      day === 4 && teamId
        ? prisma.teamSimResult.findMany({
            where: { teamId, simulationRun: { day: { in: [1, 2] }, status: "DONE" } },
            orderBy: { simulationRun: { day: "asc" } },
            select: { rejectedCount: true, extra: true, simulationRun: { select: { day: true } } },
          })
        : [],
      day === 3 && teamId && day2ReportConcepts.length > 0 ? prisma.deliverable.findMany({ where: { teamId, day: 2 } }) : [],
    ]);

  const deliverableValues = Object.fromEntries(deliverables.map((d) => [d.conceptId, d.value]));
  const day2DeliverableValues = Object.fromEntries(day2Deliverables.map((d) => [d.conceptId, d.value]));
  const analyticsPicksByKey = Object.fromEntries(
    analyticsRecs.map((r) => [
      `${r.list}-${r.rank}`,
      { dimA: r.dimA, valA: r.valA, dimB: r.dimB, valB: r.valB, multiplier: r.estimatedMultiplier != null ? String(r.estimatedMultiplier) : "" },
    ])
  );

  // ALM detail (team-scoped), shown on Día 3: Día 2's calendar is graded
  // against Año 1's real reserves (bookYear=1, same as consolidado.ts) — this
  // doesn't depend on Día 2's own tariff/simulation existing, just the
  // reserves it's benchmarked against. Teams only ever see the fictitious ALM
  // (what's graded) — the real-premium companion run exists for evaluators
  // only, on the admin day page, so teams work out their own real P&G figure
  // instead of reading it off an auto-computed number (see README §5.3).
  let almScore: ReturnType<typeof scoreFinanciero> = null;
  let almLadderRows: ReturnType<typeof almLadder> = null;
  if (day === 3 && teamId) {
    const decision = isPortfolioDecisionV4(day2Allocation?.allocation) ? day2Allocation.allocation : null;
    if (decision) {
      const book = await getTeamBookForDay(cohort.id, 1);
      const reserves = book ? computeReservesForTeams(book.claimsByTeamId).get(teamId) : null;
      if (reserves) {
        almScore = scoreFinanciero(reserves, decision);
        almLadderRows = almLadder(reserves, decision);
      }
    }
  }

  // Día 1's minimum-variance result, shown on Día 2.
  let day1MinVarResult: MinVarResult | null = null;
  if (day === 2 && teamId && isMinVarianceAllocation(day1Allocation?.allocation)) {
    const weights = day1Allocation!.allocation as Record<string, number>;
    const trueSolution = solveLongOnlyMinVariance(TARGET_RETURN);
    day1MinVarResult = {
      weights,
      achievedVariance: portfolioVariance(weights),
      trueVariance: portfolioVariance(trueSolution),
      achievedReturn: portfolioExpectedReturn(weights),
      score: scoreMinVariance(weights),
    };
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
            Día {day} — {DAY_TITLES[day]}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">{DAY_DESCRIPTIONS[day]}</p>
        </div>
        <Link
          href={`/day/${day}/guia`}
          className="shrink-0 rounded-full px-3 py-2 font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-accent)]/12 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 active:translate-y-0 hover:bg-[var(--color-brand-blue-accent)]/20 hover:shadow-[var(--shadow-md)]"
        >
          📄 Guía del pasante
        </Link>
      </div>

      <div className="flex flex-col gap-4">
        {day === 1 && (
          <>
            <a
              href="/api/universe/public-csv"
              className="w-fit rounded-full px-4 py-2 text-sm font-medium text-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-accent)]/12 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 active:translate-y-0 hover:bg-[var(--color-brand-blue-accent)]/20 hover:shadow-[var(--shadow-md)]"
            >
              Descargar CSV público del universo
            </a>
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              Como en cualquier dataset real, revisa la calidad de los datos antes de usarlos — no asumas que todas las columnas llegan limpias.
            </p>
            <a
              href="/api/universe/chile-csv"
              className="w-fit rounded-full px-4 py-2 text-sm font-medium text-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-accent)]/12 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 active:translate-y-0 hover:bg-[var(--color-brand-blue-accent)]/20 hover:shadow-[var(--shadow-md)]"
            >
              Descargar dataset Chile (referencia)
            </a>
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              100,000 pólizas chilenas con 3 años de exposición (2021-2023) y sus siniestros — el universo público de Colombia no trae siniestros ni
              severidad, así que este es el único dato con el que puedes calibrar frecuencia y severidad antes de tarificar. Ver la guía del pasante
              para los retos de transferibilidad entre ambos datasets.
            </p>
            {TAB_NOTES[1]?.sim && <TabNote>{TAB_NOTES[1].sim}</TabNote>}
            <TariffUpload
              key={`${submission?.meanPremium ?? "none"}-${submission?.outsourced ?? false}-${!!dayResult}`}
              day={1}
              initialComplete={submission?.meanPremium != null}
              // An outsourced tariff's premium is withheld from the team
              // until this day's market has cleared — see hasDaySimResult()'s
              // doc comment in lib/tariffAccess.ts. A self-priced tariff has
              // no such restriction, it's the team's own number.
              initialMeanPremium={submission?.outsourced && !dayResult ? null : (submission?.meanPremium ?? null)}
              initialOutsourced={submission?.outsourced ?? false}
              resultsRevealed={!!dayResult}
            />
            {TAB_NOTES[1]?.portfolio && <TabNote>{TAB_NOTES[1].portfolio}</TabNote>}
            <MinVarianceForm initialWeights={isMinVarianceAllocation(allocation?.allocation) ? allocation.allocation : null} />
          </>
        )}

        {day === 2 && (
          <>
            <ObjectiveResultsCard yearLabel={SIMULATED_YEAR_LABEL[1]} result={day1Result} reportDay={1} />
            <MinVarianceResultCard result={day1MinVarResult} />

            {TAB_NOTES[2]?.sim && <TabNote>{TAB_NOTES[2].sim}</TabNote>}
            <a
              href="/api/universe/public-csv"
              className="w-fit rounded-full px-4 py-2 text-sm font-medium text-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-accent)]/12 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 active:translate-y-0 hover:bg-[var(--color-brand-blue-accent)]/20 hover:shadow-[var(--shadow-md)]"
            >
              Descargar CSV público del universo
            </a>
            <p className="text-xs text-[var(--color-brand-text-secondary)]">
              Como en cualquier dataset real, revisa la calidad de los datos antes de usarlos — no asumas que todas las columnas llegan limpias.
            </p>
            <TariffUpload
              key={`${submission?.meanPremium ?? "none"}-${submission?.outsourced ?? false}-${!!dayResult}`}
              day={2}
              initialComplete={submission?.meanPremium != null}
              // An outsourced tariff's premium is withheld from the team
              // until this day's market has cleared — see hasDaySimResult()'s
              // doc comment in lib/tariffAccess.ts. A self-priced tariff has
              // no such restriction, it's the team's own number.
              initialMeanPremium={submission?.outsourced && !dayResult ? null : (submission?.meanPremium ?? null)}
              initialOutsourced={submission?.outsourced ?? false}
              resultsRevealed={!!dayResult}
            />

            {TAB_NOTES[2]?.portfolio && <TabNote>{TAB_NOTES[2].portfolio}</TabNote>}
            <PortfolioForm day={2} initialDecision={isPortfolioDecisionV4(allocation?.allocation) ? allocation.allocation : null} />

            {reportConcepts.length > 0 && (
              <>
                {TAB_NOTES[2]?.deliverables && <TabNote>{TAB_NOTES[2].deliverables}</TabNote>}
                {marketLossRatio && (
                  <div className="rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2 text-xs text-[var(--color-brand-text-secondary)]">
                    <span className="font-semibold text-[var(--color-brand-blue-accent)]">Referencia — </span>
                    Loss ratio real de todo el mercado del 2027 (siniestros reales ÷ prima devengada real, sumados entre los {marketLossRatio.teamCount}{" "}
                    equipos): <strong>{(marketLossRatio.lossRatio * 100).toFixed(1)}%</strong>. Úsalo para contrastar tu propio
                    Loss Ratio Esperado (ver la guía de este día, sección 2).
                  </div>
                )}
                <DeliverablesForm day={2} concepts={reportConcepts} initialValues={deliverableValues} />
              </>
            )}
          </>
        )}

        {day === 3 && (
          <>
            <PillTabBar
              tabs={[
                { key: "d2", label: "Respuestas Día 2", href: `/day/3?tab=d2` },
                { key: "d3", label: "Entregables Día 3", href: `/day/3?tab=d3` },
              ]}
              activeKey={activeTab}
            />

            {activeTab === "d2" && (
              <>
                <ObjectiveResultsCard yearLabel={SIMULATED_YEAR_LABEL[2]} result={day2Result} reportDay={3} />

                <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
                  <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                    ALM — tu portafolio vs. tus reservas de {SIMULATED_YEAR_LABEL[1]}
                  </h3>
                  {almScore ? (
                    <div className="flex flex-col gap-3">
                      <AlmScoreTiles score={almScore} />
                      {almLadderRows && <AlmLadderTable rows={almLadderRows.rows} />}
                      {almLadderRows && <AlmPortfolioTable rows={almLadderRows.rows} />}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--color-brand-text-secondary)]">
                      Aún no tienes un portafolio guardado, o las reservas correspondientes todavía no están disponibles.
                    </p>
                  )}
                </div>

                <DeliverablesReadOnly day={2} concepts={day2ReportConcepts} values={day2DeliverableValues} />
              </>
            )}

            {activeTab === "d3" && reportConcepts.length > 0 && (
              <>
                {TAB_NOTES[3]?.deliverables && <TabNote>{TAB_NOTES[3].deliverables}</TabNote>}
                <DeliverablesForm day={3} concepts={reportConcepts} initialValues={deliverableValues} />
              </>
            )}
          </>
        )}

        {day === 4 && (
          <>
            {capacityHistory.length > 0 && (
              <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
                <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                  Tu límite de cuota, 2027 vs. 2028
                </h3>
                <p className="mb-3 text-xs text-[var(--color-brand-text-secondary)]">
                  Este es el mismo límite de capacidad que viste en los resultados objetivos de cada año — puesto lado a lado para que veas si tu
                  capital se ajustó entre años, y si eso coincide con el Requerimiento de Capital y el Margen de solvencia que estás reportando este
                  día.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {capacityHistory.map((r) => {
                    const extra = r.extra as { capacityLimit?: number; rawCapacityLimit?: number } | null;
                    return (
                      <div key={r.simulationRun.day} className="rounded border border-[var(--color-brand-gray-light)] p-3">
                        <p className="text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">
                          {SIMULATED_YEAR_LABEL[r.simulationRun.day]}
                        </p>
                        <p className="mt-1 text-sm">
                          Límite de capital: <strong>{extra?.rawCapacityLimit?.toLocaleString("es-CO") ?? "—"}</strong> pólizas
                        </p>
                        <p className="text-sm">
                          Límite aplicado: <strong>{extra?.capacityLimit?.toLocaleString("es-CO") ?? "—"}</strong> pólizas
                        </p>
                        <p className="text-sm">
                          Pólizas rechazadas:{" "}
                          <strong className={r.rejectedCount > 0 ? "text-[var(--color-brand-red)]" : ""}>
                            {r.rejectedCount.toLocaleString("es-CO")}
                          </strong>
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {reportConcepts.length > 0 && (
              <>
                {TAB_NOTES[4]?.deliverables && <TabNote>{TAB_NOTES[4].deliverables}</TabNote>}
                <DeliverablesForm day={4} concepts={reportConcepts} initialValues={deliverableValues} />
              </>
            )}

            {hasAnalitica && (
              <>
                {TAB_NOTES[4]?.analytics && <TabNote>{TAB_NOTES[4].analytics}</TabNote>}
                <AnalyticsForm day={4} initialPicks={analyticsPicksByKey} />
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
