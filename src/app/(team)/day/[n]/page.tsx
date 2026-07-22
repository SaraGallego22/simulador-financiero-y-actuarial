import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TariffUpload } from "@/components/team/TariffUpload";
import { PortfolioForm } from "@/components/team/PortfolioForm";
import { MinVarianceForm } from "@/components/team/MinVarianceForm";
import { InstrumentsPanel } from "@/components/team/InstrumentsPanel";
import { DeliverablesForm } from "@/components/team/DeliverablesForm";
import { AnalyticsForm } from "@/components/team/AnalyticsForm";
import { DayTabBar } from "@/components/DayTabBar";
import type { DayTabKey } from "@/components/DayTabBar";
import { conceptosDia } from "@/domain/grading/concepts";
import type { Dia } from "@/domain/grading/concepts";
import { isMinVarianceAllocation, isPortfolioDecisionV3 } from "@/domain/finance/instruments";
import { scoreFinanciero, almLadder } from "@/domain/finance/alm";
import { TARGET_RETURN, portfolioExpectedReturn, portfolioVariance, scoreMinVariance, solveLongOnlyMinVariance } from "@/domain/finance/markowitz";
import { getTeamBookForDay, computeReservesForTeams } from "@/lib/teamBook";
import { AlmScoreTiles, AlmLadderTable, AlmPortfolioTable } from "@/components/AlmLadderTable";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { computeConsolidado, computeMarketLossRatio } from "@/lib/consolidado";
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

export default async function TeamDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ n: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { n } = await params;
  const day = Number(n);
  const includeSim = day <= 2;
  // Día 1 hosts the minimum-variance exercise (a flat weight map, not a
  // tree); the real ALM tree is submitted once, on Día 2 — decoupled from
  // includeSim, which stays about the tariff/simulation tab only. See
  // README's market-clearing section.
  const hasMinVariance = day === 1;
  const hasPortfolioTree = day === 2;
  const { tab } = await searchParams;
  // "subj" isn't a team-facing tab (see DayTabBar's includeSubj) — never
  // rendered below, but guard the fallback so a hand-typed ?tab=subj doesn't
  // just land on a blank pane.
  const requestedTab = tab as DayTabKey | undefined;
  const activeTab = requestedTab && requestedTab !== "subj" ? requestedTab : includeSim ? "sim" : "entreg";
  const session = await auth();
  const teamId = session?.user.teamId ?? null;

  // Only the serializable fields — Concepto.get is a function and can't
  // cross the Server->Client Component boundary (see DeliverablesForm).
  const reportConcepts = conceptosDia(`d${day}` as Dia)
    .filter((c) => c.tipo === "reporte")
    .map((c) => ({ id: c.id, label: c.label, unit: c.unit, group: c.group }));
  const hasAnalitica = conceptosDia(`d${day}` as Dia).some((c) => c.tipo === "auto_analitica");

  // Also needed on "obj" (not just "top") to show this team's own rank
  // alongside its published objective results — see the "obj" section below.
  const topRows =
    activeTab === "top" || activeTab === "obj" ? await computeConsolidado((await getOrCreateActiveCohort()).id, true) : null;
  // Real market-wide loss ratio for the closed 2027 market — reference for a
  // team's own Expected Loss Ratio estimate (Día 2's guide §2), not any
  // individual team's figures. See computeMarketLossRatio's doc comment.
  const marketLossRatio = day === 2 ? await computeMarketLossRatio((await getOrCreateActiveCohort()).id, 1) : null;

  const [submission, publishedResult, allocation, deliverables, analyticsRecs] = await Promise.all([
    teamId
      ? prisma.tariffSubmission.findUnique({ where: { teamId_day: { teamId, day } }, select: { meanPremium: true, outsourced: true } })
      : null,
    teamId
      ? prisma.teamSimResult.findFirst({
          where: { teamId, published: true, simulationRun: { day } },
          orderBy: { simulationRun: { createdAt: "desc" } },
        })
      : null,
    teamId ? prisma.portfolioAllocation.findUnique({ where: { teamId_day: { teamId, day } } }) : null,
    teamId && reportConcepts.length > 0 ? prisma.deliverable.findMany({ where: { teamId, day } }) : [],
    teamId && hasAnalitica ? prisma.analyticsRecommendation.findMany({ where: { teamId, day } }) : [],
  ]);

  // This team's own rank by objective score for this day — ranked
  // separately from the "top" tab's combined nota (subjective grading
  // often isn't published yet when objective results first are).
  let myObjectiveRank: number | null = null;
  let objectiveRankedCount = 0;
  if (topRows) {
    const ranked = topRows
      .filter((r) => r.perDay[day - 1]?.objective != null)
      .sort((a, b) => (b.perDay[day - 1]!.objective ?? 0) - (a.perDay[day - 1]!.objective ?? 0));
    objectiveRankedCount = ranked.length;
    const idx = ranked.findIndex((r) => r.teamId === teamId);
    myObjectiveRank = idx >= 0 ? idx + 1 : null;
  }

  // Día 4 retrospective: both years' capital-derived market-share limits
  // side by side, so a team whose growth was capped can connect it to the
  // solvency figures it's reporting this same day (see README's market
  // section) — the team's own view never sees finBench's raw bench figures
  // (only admin does, see admin/day/[n]/page.tsx), so this reuses what's
  // already published on TeamSimResult from Día 1/2 instead of computing a
  // fresh finBench() here.
  const capacityHistory =
    day === 4 && teamId
      ? await prisma.teamSimResult.findMany({
          where: { teamId, published: true, simulationRun: { day: { in: [1, 2] } } },
          orderBy: { simulationRun: { day: "asc" } },
          select: { rejectedCount: true, extra: true, simulationRun: { select: { day: true } } },
        })
      : [];

  const deliverableValues = Object.fromEntries(deliverables.map((d) => [d.conceptId, d.value]));
  const analyticsPicksByKey = Object.fromEntries(
    analyticsRecs.map((r) => [
      `${r.list}-${r.rank}`,
      { dimA: r.dimA, valA: r.valA, dimB: r.dimB, valB: r.valB, multiplier: r.estimatedMultiplier != null ? String(r.estimatedMultiplier) : "" },
    ])
  );

  // ALM detail (team-scoped): Día 2's tree is graded against Año 1's real
  // reserves (bookYear=1, same as consolidado.ts) — doesn't depend on a
  // simulation existing *for this day*, unlike the underwriting card above.
  // Teams only ever see the fictitious ALM (what's graded) — the
  // real-premium companion run exists for evaluators only, on the admin day
  // page, so teams work out their own real P&G figure instead of reading it
  // off an auto-computed number (see README §5.3).
  let almScore: ReturnType<typeof scoreFinanciero> = null;
  let almLadderRows: ReturnType<typeof almLadder> = null;
  const bookYear = day === 2 ? 1 : null;
  if (activeTab === "obj" && hasPortfolioTree && teamId && bookYear) {
    const decision = isPortfolioDecisionV3(allocation?.allocation) ? allocation.allocation : null;
    if (decision) {
      const cohort = await getOrCreateActiveCohort();
      const book = await getTeamBookForDay(cohort.id, bookYear);
      const reserves = book ? computeReservesForTeams(book.claimsByTeamId).get(teamId) : null;
      if (reserves) {
        almScore = scoreFinanciero(reserves, decision);
        almLadderRows = almLadder(reserves, decision);
      }
    }
  }

  // Día 1's minimum-variance exercise: team-scoped result (achieved vs. true
  // variance, expected return, score) — never per-team ground truth, see
  // markowitz.ts. trueVariance is the minimum achievable at TARGET_RETURN —
  // the same fixed benchmark scoreMinVariance() grades against, so the two
  // numbers stay consistent.
  let minVarResult: { weights: Record<string, number>; achievedVariance: number; trueVariance: number; achievedReturn: number; score: number } | null = null;
  if (activeTab === "obj" && hasMinVariance && teamId && isMinVarianceAllocation(allocation?.allocation)) {
    const weights = allocation!.allocation as Record<string, number>;
    const trueSolution = solveLongOnlyMinVariance(TARGET_RETURN);
    minVarResult = {
      weights,
      achievedVariance: portfolioVariance(weights),
      trueVariance: portfolioVariance(trueSolution),
      achievedReturn: portfolioExpectedReturn(weights),
      score: scoreMinVariance(weights),
    };
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
            Día {day} — {DAY_TITLES[day]}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">{DAY_DESCRIPTIONS[day]}</p>
        </div>
        <Link
          href={`/day/${day}/guia`}
          className="shrink-0 rounded-md border border-[var(--color-brand-blue-accent)] px-3 py-2 font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)] transition-colors hover:bg-[var(--color-brand-blue-light)]"
        >
          📄 Guía del pasante
        </Link>
      </div>

      <DayTabBar basePath="/day" day={day} activeTab={activeTab} includeSim={includeSim} includeSubj={false} />

      {activeTab === "sim" && includeSim && (
        <div className="flex flex-col gap-4">
          {TAB_NOTES[day]?.sim && <TabNote>{TAB_NOTES[day].sim}</TabNote>}
          <a
            href="/api/universe/public-csv"
            className="w-fit rounded border border-[var(--color-brand-blue-accent)] px-4 py-2 text-sm font-medium text-[var(--color-brand-blue-accent)] hover:bg-[var(--color-brand-blue-light)]"
          >
            Descargar CSV público del universo
          </a>
          <p className="text-xs text-[var(--color-brand-text-secondary)]">
            Como en cualquier dataset real, revisa la calidad de los datos antes de usarlos — no asumas que todas las columnas llegan limpias.
          </p>
          {day === 1 && (
            <>
              <a
                href="/api/universe/chile-csv"
                className="w-fit rounded border border-[var(--color-brand-blue-accent)] px-4 py-2 text-sm font-medium text-[var(--color-brand-blue-accent)] hover:bg-[var(--color-brand-blue-light)]"
              >
                Descargar dataset Chile (referencia)
              </a>
              <p className="text-xs text-[var(--color-brand-text-secondary)]">
                100,000 pólizas chilenas con 3 años de exposición (2021-2023) y sus siniestros — el universo público de Colombia no trae siniestros ni
                severidad, así que este es el único dato con el que puedes calibrar frecuencia y severidad antes de tarificar. Ver la guía del pasante
                para los retos de transferibilidad entre ambos datasets.
              </p>
            </>
          )}
          <TariffUpload
            key={`${submission?.meanPremium ?? "none"}-${submission?.outsourced ?? false}-${!!publishedResult}`}
            day={day}
            initialComplete={submission?.meanPremium != null}
            // An outsourced tariff's premium is withheld from the team until
            // this day's results are published — see hasPublishedResults()'s
            // doc comment in lib/tariffAccess.ts. A self-priced tariff has
            // no such restriction, it's the team's own number.
            initialMeanPremium={submission?.outsourced && !publishedResult ? null : (submission?.meanPremium ?? null)}
            initialOutsourced={submission?.outsourced ?? false}
            resultsPublished={!!publishedResult}
          />
        </div>
      )}

      {activeTab === "entreg" && (
        <div className="flex flex-col gap-4">
          {(hasMinVariance || hasPortfolioTree) && <InstrumentsPanel showCovariance={hasMinVariance || hasPortfolioTree} />}
          {hasMinVariance && (
            <>
              {TAB_NOTES[day]?.portfolio && <TabNote>{TAB_NOTES[day].portfolio}</TabNote>}
              <MinVarianceForm initialWeights={isMinVarianceAllocation(allocation?.allocation) ? allocation.allocation : null} />
            </>
          )}
          {hasPortfolioTree && (
            <>
              {TAB_NOTES[day]?.portfolio && <TabNote>{TAB_NOTES[day].portfolio}</TabNote>}
              <PortfolioForm day={day} initialDecision={isPortfolioDecisionV3(allocation?.allocation) ? allocation.allocation : null} />
            </>
          )}
          {reportConcepts.length > 0 && (
            <>
              {TAB_NOTES[day]?.deliverables && <TabNote>{TAB_NOTES[day].deliverables}</TabNote>}
              {marketLossRatio && (
                <div className="rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2 text-xs text-[var(--color-brand-text-secondary)]">
                  <span className="font-semibold text-[var(--color-brand-blue-accent)]">Referencia — </span>
                  Loss ratio real de todo el mercado del 2027 (siniestros reales ÷ prima real, sumados entre los {marketLossRatio.teamCount} equipos
                  con resultado publicado, nunca desglosado por equipo): <strong>{(marketLossRatio.lossRatio * 100).toFixed(1)}%</strong>. Úsalo para
                  contrastar tu propio Loss Ratio Esperado (ver la guía de este día, sección 2).
                </div>
              )}
              <DeliverablesForm day={day} concepts={reportConcepts} initialValues={deliverableValues} />
            </>
          )}
          {hasAnalitica && (
            <>
              {TAB_NOTES[day]?.analytics && <TabNote>{TAB_NOTES[day].analytics}</TabNote>}
              <AnalyticsForm day={day} initialPicks={analyticsPicksByKey} />
            </>
          )}
          {!hasMinVariance && !hasPortfolioTree && reportConcepts.length === 0 && !hasAnalitica && (
            <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5 text-sm text-[var(--color-brand-text-secondary)]">
              No hay entregables para este día.
            </div>
          )}
        </div>
      )}

      {activeTab === "obj" && (
        <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-cyan)] bg-[var(--color-brand-surface)] p-5">
          <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
            Resultados objetivos — Día {day}
          </h3>
          {publishedResult ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Asegurados</p>
                <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
                  {publishedResult.insuredCount.toLocaleString("es-CO")}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Siniestros</p>
                <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
                  {publishedResult.claimsCount.toLocaleString("es-CO")}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Pólizas rechazadas</p>
                <p
                  className={`font-[family-name:var(--font-condensed)] text-xl font-bold ${publishedResult.rejectedCount > 0 ? "text-[var(--color-brand-red)]" : "text-[var(--color-brand-blue-accent)]"}`}
                >
                  {publishedResult.rejectedCount.toLocaleString("es-CO")}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Posición en el top</p>
                <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
                  {myObjectiveRank != null ? `${myObjectiveRank} / ${objectiveRankedCount}` : "—"}
                </p>
              </div>
              {(() => {
                const extra = publishedResult.extra as { capacityLimit?: number; rawCapacityLimit?: number } | null;
                if (extra?.capacityLimit == null || extra.rawCapacityLimit == null) return null;
                // capacityLimit = min(rawCapacityLimit, techo del admin) — si
                // son iguales, tu propio capital fue lo que te limitó; si el
                // límite aplicado es menor que tu capacidad por capital, fue
                // el techo del admin el que te limitó primero.
                const cappedByCapital = extra.rawCapacityLimit <= extra.capacityLimit;
                return (
                  <div className="col-span-2 sm:col-span-4">
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
              {includeSim && (
                <div className="col-span-2 sm:col-span-4 flex flex-col gap-1">
                  <a
                    href={`/api/teams/report?day=${day}`}
                    className="inline-block w-fit rounded border border-[var(--color-brand-blue-accent)] px-4 py-2 text-sm font-medium text-[var(--color-brand-blue-accent)] hover:bg-[var(--color-brand-blue-light)]"
                  >
                    Descargar reporte de tu cartera (CSV)
                  </a>
                  <p className="text-xs text-[var(--color-brand-text-secondary)]">
                    Como en cualquier dataset real, revisa la calidad de los datos antes de usarlos — no asumas que todas las columnas llegan limpias.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-brand-text-secondary)]">El evaluador aún no ha publicado los resultados de este día.</p>
          )}
        </div>

        {day === 4 && capacityHistory.length > 0 && (
          <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue-accent)] bg-[var(--color-brand-surface)] p-5">
            <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              Tu límite de cuota, 2027 vs. 2028
            </h3>
            <p className="mb-3 text-xs text-[var(--color-brand-text-secondary)]">
              Este es el mismo límite de capacidad que viste en los resultados objetivos de cada año — puesto lado a lado para que veas si tu capital se
              ajustó entre años, y si eso coincide con el Requerimiento de Capital y el Margen de solvencia que estás reportando este día.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {capacityHistory.map((r) => {
                const extra = r.extra as { capacityLimit?: number; rawCapacityLimit?: number } | null;
                return (
                  <div key={r.simulationRun.day} className="rounded border border-[var(--color-brand-gray-light)] p-3">
                    <p className="text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">{SIMULATED_YEAR_LABEL[r.simulationRun.day]}</p>
                    <p className="mt-1 text-sm">
                      Límite de capital: <strong>{extra?.rawCapacityLimit?.toLocaleString("es-CO") ?? "—"}</strong> pólizas
                    </p>
                    <p className="text-sm">
                      Límite aplicado: <strong>{extra?.capacityLimit?.toLocaleString("es-CO") ?? "—"}</strong> pólizas
                    </p>
                    <p className="text-sm">
                      Pólizas rechazadas: <strong className={r.rejectedCount > 0 ? "text-[var(--color-brand-red)]" : ""}>{r.rejectedCount.toLocaleString("es-CO")}</strong>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {hasMinVariance && (
          <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue-accent)] bg-[var(--color-brand-surface)] p-5">
            <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              Mínima varianza — tu portafolio vs. el óptimo real
            </h3>
            {minVarResult ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Retorno esperado</p>
                  <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
                    {(minVarResult.achievedReturn * 100).toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Varianza lograda</p>
                  <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
                    {minVarResult.achievedVariance.toFixed(6)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Varianza mínima real</p>
                  <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
                    {minVarResult.trueVariance.toFixed(6)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Nota</p>
                  <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
                    {minVarResult.score.toFixed(0)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-brand-text-secondary)]">Aún no tienes un portafolio de mínima varianza guardado.</p>
            )}
          </div>
        )}

        {hasPortfolioTree && (
          <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue-accent)] bg-[var(--color-brand-surface)] p-5">
            <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              ALM — tu portafolio vs. tus reservas de {SIMULATED_YEAR_LABEL[bookYear ?? 1]}
            </h3>
            {almScore ? (
              <div className="flex flex-col gap-3">
                <AlmScoreTiles score={almScore} />
                {almLadderRows && <AlmLadderTable rows={almLadderRows.rows} />}
                {almLadderRows && <AlmPortfolioTable rows={almLadderRows.rows} />}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-brand-text-secondary)]">
                Aún no tienes un portafolio guardado para este día, o las reservas correspondientes todavía no están disponibles.
              </p>
            )}
          </div>
        )}
        </div>
      )}

      {activeTab === "top" && (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)]">
          {!topRows || topRows.every((r) => r.perDay[day - 1]?.nota == null) ? (
            <p className="p-5 text-sm text-[var(--color-brand-text-secondary)]">El evaluador aún no ha publicado resultados de este día.</p>
          ) : (
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
                {topRows
                  .filter((r) => r.perDay[day - 1]?.nota != null)
                  .sort((a, b) => (b.perDay[day - 1]!.nota ?? 0) - (a.perDay[day - 1]!.nota ?? 0))
                  .map((r, i) => (
                    <tr
                      key={r.teamId}
                      className={`border-t border-[var(--color-brand-gray-light)] ${r.teamId === teamId ? "bg-[var(--color-brand-blue-light)] font-semibold" : ""}`}
                    >
                      <td className="px-4 py-2">{i + 1}</td>
                      <td className="px-4 py-2">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                        {r.teamName}
                      </td>
                      <td className="px-4 py-2">{r.perDay[day - 1]?.objective != null ? r.perDay[day - 1]!.objective!.toFixed(1) : "—"}</td>
                      <td className="px-4 py-2">{r.perDay[day - 1]?.subjective != null ? r.perDay[day - 1]!.subjective!.toFixed(1) : "—"}</td>
                      <td className="px-4 py-2 font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue-accent)]">
                        {r.perDay[day - 1]!.nota!.toFixed(1)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </main>
  );
}
