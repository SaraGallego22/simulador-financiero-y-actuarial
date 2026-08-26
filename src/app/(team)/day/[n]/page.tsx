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
import { TARGET_RETURN, portfolioExpectedReturn, portfolioVariance, scoreMinVariance, solveLongOnlyMinVariance } from "@/domain/finance/markowitz";
import { getActiveColombiaUniverse } from "@/lib/teamBook";
import { computeFinBenchBundlesForCohort } from "@/lib/finBenchHelper";
import type { TeamFinBenchBundle } from "@/lib/finBenchHelper";
import { AlmRealYearTiles, AlmLadderTable, AlmPortfolioTable } from "@/components/AlmLadderTable";
import { getCohortForSession, getOrCreateActiveCohort } from "@/lib/cohort";
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
 * year's numbers (Día 2 shows 2027, Día 3 shows 2028). The standalone
 * "Resultados objetivos" (current day's own results) and "Top del día"
 * (cross-team ranking) sections from the legacy multi-tab layout were
 * dropped when the team view collapsed into a single panel per day —
 * cross-team standings live only on /standings, as a top 3 (CLAUDE.md §8).
 */
function ObjectiveResultsCard({
  yearLabel,
  result,
  reportDay,
  medianTariff,
}: {
  yearLabel: string;
  result: { insuredCount: number; rejectedCount: number; extra: unknown } | null;
  /** Day whose CSV report to link. */
  reportDay: number;
  /** This team's own median submitted tariff for `reportDay` (TariffSubmission.medianPremium). */
  medianTariff?: number | null;
}) {
  const extra = result?.extra as {
    medianWonPremium?: number | null;
    tariffRiskCorr?: number | null;
    capacityLimit?: number;
    rawCapacityLimit?: number;
  } | null;
  const medianWonPremium = extra?.medianWonPremium ?? null;
  // Deliberately NOT the claim count: that would hand teams their own
  // siniestralidad, which Día 3 asks them to estimate from their report.
  // This says only how well their pricing ordered risk, not its level.
  const tariffRiskCorr = extra?.tariffRiskCorr ?? null;
  const fmtCop = (v: number | null | undefined) => (v == null ? "—" : `$${Math.round(v).toLocaleString("es-CO")}`);
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
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Correlación tarifa–riesgo</p>
            <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
              {tariffRiskCorr != null ? tariffRiskCorr.toFixed(2) : "—"}
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
          <div>
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Prima mediana</p>
            <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">{fmtCop(medianTariff)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Cobro mediano</p>
            <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">{fmtCop(medianWonPremium)}</p>
          </div>
          {tariffRiskCorr != null && (
            <div className="col-span-2 sm:col-span-3">
              <p className="rounded border border-[var(--color-brand-gray-light)] px-3 py-2 text-xs text-[var(--color-brand-text-secondary)]">
                <span className="font-semibold text-[var(--color-brand-blue-accent)]">Correlación tarifa–riesgo — </span>
                qué tan bien tu tarifa ordenó el riesgo real de las pólizas que ganaste: la correlación, sobre tu propia cartera, entre lo que le
                cobraste a cada expuesto y lo que ese expuesto costaba de verdad en valor esperado. 1.00 es un orden perfecto; 0 es una tarifa que no
                distingue entre un riesgo bueno y uno malo. Mide el <strong>orden</strong>, no el nivel: una tarifa puede ordenar perfectamente el
                riesgo y aun así estar toda cara o toda barata.
              </p>
            </div>
          )}
          {extra?.capacityLimit != null && extra.rawCapacityLimit != null && (
            <div className="col-span-2 sm:col-span-3">
              <p className="rounded border border-[var(--color-brand-cyan-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2 text-xs text-[var(--color-brand-text-secondary)]">
                <span className="font-semibold text-[var(--color-brand-blue-accent)]">Tu límite de cuota este año — </span>
                tu capital disponible y el riesgo de tu portafolio permitían asegurar hasta {extra.rawCapacityLimit.toLocaleString("es-CO")} pólizas
                manteniendo un margen de solvencia de al menos 1.0x. En el Día 4 puedes ver la conexión completa con tu solvencia real.
              </p>
            </div>
          )}
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
  // Only Días 3/4 have tabs — "ref" (default: the PREVIOUS day's true
  // results, read-only) vs. "entreg" (this day's own report form). See
  // PillTabBar usage below.
  const activeTab = tab === "entreg" ? "entreg" : "ref";
  const session = await auth();
  const cohort = session ? await getCohortForSession(session) : await getOrCreateActiveCohort();
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
  const teamId = session?.user.teamId ?? null;
  // Once a later day is open, this day's own submissions are frozen — a
  // team can't go back and revise an earlier day's answers after seeing how
  // it played out on a following day's page.
  const locked = day < cohort.openDay;

  // Only the serializable fields — Concepto.get is a function and can't
  // cross the Server->Client Component boundary (see DeliverablesForm).
  const reportConcepts = conceptosDia(`d${day}` as Dia)
    .filter((c) => c.tipo === "reporte")
    .map((c) => ({ id: c.id, label: c.label, unit: c.unit, group: c.group }));
  const hasAnalitica = conceptosDia(`d${day}` as Dia).some((c) => c.tipo === "auto_analitica");
  // Día 2's P&G/Balance lines, shown read-only on Día 3's "Respuestas Día 2"
  // tab against their TRUE finBench values (not what the team submitted —
  // see day2TrueValues below), unlike reportConcepts/deliverableValues above,
  // which are always the team's own submission for whatever `day` this is.
  const day2ReportConcepts = conceptosDia("d2")
    .filter((c) => c.tipo === "reporte")
    .map((c) => ({ id: c.id, label: c.label, unit: c.unit, group: c.group }));
  // Same idea for Día 3's own lines (Año 2 real + Año 3 proyectado), shown
  // read-only on Día 4's "Respuestas Día 3" tab — see day3TrueValues below.
  const day3ReportConcepts = conceptosDia("d3")
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
    day1TariffMedian,
    day2Result,
    day4Capacity1,
    day4Capacity2,
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
      // This team's own Día 1 tariff, for the "Prima mediana" tile on
      // ObjectiveResultsCard — same medianPremium the admin view shows
      // (admin/day/[n]/page.tsx's "Tarifa mediana" column).
      day === 2 && teamId
        ? prisma.tariffSubmission.findUnique({ where: { teamId_day: { teamId, day: 1 } }, select: { medianPremium: true } })
        : null,
      // Día 3 shows Día 2's ("2028") results.
      day === 3 && teamId
        ? prisma.teamSimResult.findFirst({ where: { teamId, simulationRun: { day: 2, status: "DONE" } }, orderBy: { simulationRun: { createdAt: "desc" } } })
        : null,
      // Día 4 retrospective: both years' capital-derived market-share limits
      // side by side, so a team whose growth was capped can connect it to the
      // solvency figures it's reporting this same day (see README's market
      // section) — the team's own view never sees finBench's raw bench
      // figures (only admin does, see admin/day/[n]/page.tsx), so this reuses
      // TeamSimResult from Día 1/2 instead of computing a fresh finBench() here.
      // Two separate findFirst (not one findMany + `day in [1,2]`) — a
      // findMany returns EVERY DONE SimulationRun for each day, and a
      // cohort re-simulated more than once (e.g. via db:seed-test, or the
      // admin re-running a day) has several; findMany with no per-day
      // recency dedup rendered one duplicate card per stale run instead of
      // just the current one (same "keep only the latest run per day"
      // pattern dayResult/day1Result/day2Result above already follow).
      day === 4 && teamId
        ? prisma.teamSimResult.findFirst({
            where: { teamId, simulationRun: { day: 1, status: "DONE" } },
            orderBy: { simulationRun: { createdAt: "desc" } },
            select: { rejectedCount: true, extra: true, simulationRun: { select: { day: true } } },
          })
        : null,
      day === 4 && teamId
        ? prisma.teamSimResult.findFirst({
            where: { teamId, simulationRun: { day: 2, status: "DONE" } },
            orderBy: { simulationRun: { createdAt: "desc" } },
            select: { rejectedCount: true, extra: true, simulationRun: { select: { day: true } } },
          })
        : null,
    ]);
  const capacityHistory = [day4Capacity1, day4Capacity2].filter((r) => r != null);

  const deliverableValues = Object.fromEntries(deliverables.map((d) => [d.conceptId, d.value]));
  const analyticsPicksByKey = Object.fromEntries(
    analyticsRecs.map((r) => [
      `${r.list}-${r.rank}`,
      { dimA: r.dimA, valA: r.valA, dimB: r.dimB, valB: r.valB, multiplier: r.estimatedMultiplier != null ? String(r.estimatedMultiplier) : "" },
    ])
  );

  // Shared by every block below that needs the Colombia universe this
  // request (day2TrueValues/day3TrueValues's
  // computeFinBenchBundlesForCohort) — regenerating it per call would rerun
  // every team's finBench/ALM computation more than once per request (see
  // admin/day/[n]/page.tsx's fix for the same issue).
  const universe = day >= 2 ? await getActiveColombiaUniverse(cohort.id) : null;

  // Every team's finBench/real-ALM bundle for this request — computed once
  // here and shared by day2TrueValues/day3TrueValues below (each only needs
  // this team's own entry), instead of each independently recomputing it
  // (same duplicate-work fix as admin/day/[n]/page.tsx).
  const finBenchBundlesByTeamId = day >= 2 ? await computeFinBenchBundlesForCohort(cohort.id, universe ?? undefined) : new Map();

  // ALM detail (team-scoped), shown on Día 3: the REAL ALM run, funded by
  // this team's own actual Año 1 premium — the same run finBench() itself
  // benchmarks the true P&G's Resultado de Inversiones against (see
  // realAlmYear1's doc comment in finBenchHelper.ts), not the fictitious
  // 60-month scenario Día 1/2's own ALM nota was graded on.
  let realAlmYear1: TeamFinBenchBundle["realAlmYear1"] = null;
  // Día 2's TRUE P&G/Balance (Año 1), from finBench — shown as reference on
  // Día 3's "Respuestas Día 2" tab instead of the team's own Día 2 report
  // (deliberately the true engine values here, unlike every other day's own
  // DeliverablesForm, which stays graded against the team's own guess).
  const day2TrueValues: Record<string, number> = {};
  if (day === 3 && teamId) {
    const bundle = finBenchBundlesByTeamId.get(teamId);
    if (bundle) {
      realAlmYear1 = bundle.realAlmYear1;
      for (const c of conceptosDia("d2").filter((c) => c.tipo === "reporte")) {
        const v = c.get?.(bundle.bench);
        if (v != null) day2TrueValues[c.id] = v;
      }
    }
  }

  // Same idea as day2TrueValues, one day later: Día 3's TRUE P&G/Balance
  // (Año 2 real + Año 3 proyectado), shown as reference on Día 4's
  // "Respuestas Día 3" tab.
  const day3TrueValues: Record<string, number> = {};
  if (day === 4 && teamId) {
    const bundle = finBenchBundlesByTeamId.get(teamId);
    if (bundle) {
      for (const c of conceptosDia("d3").filter((c) => c.tipo === "reporte")) {
        const v = c.get?.(bundle.bench);
        if (v != null) day3TrueValues[c.id] = v;
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
              locked={locked}
            />
            {TAB_NOTES[1]?.portfolio && <TabNote>{TAB_NOTES[1].portfolio}</TabNote>}
            <MinVarianceForm initialWeights={isMinVarianceAllocation(allocation?.allocation) ? allocation.allocation : null} locked={locked} />
          </>
        )}

        {day === 2 && (
          <>
            <ObjectiveResultsCard yearLabel={SIMULATED_YEAR_LABEL[1]} result={day1Result} reportDay={1} medianTariff={day1TariffMedian?.medianPremium} />
            <MinVarianceResultCard result={day1MinVarResult} />

            {TAB_NOTES[2]?.sim && <TabNote>{TAB_NOTES[2].sim}</TabNote>}
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
              locked={locked}
            />

            {TAB_NOTES[2]?.portfolio && <TabNote>{TAB_NOTES[2].portfolio}</TabNote>}
            <PortfolioForm day={2} initialDecision={isPortfolioDecisionV4(allocation?.allocation) ? allocation.allocation : null} locked={locked} />

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
                <DeliverablesForm day={2} concepts={reportConcepts} initialValues={deliverableValues} locked={locked} />
              </>
            )}
          </>
        )}

        {day === 3 && (
          <>
            <PillTabBar
              tabs={[
                { key: "ref", label: "Respuestas Día 2", href: `/day/3?tab=ref` },
                { key: "entreg", label: "Entregables Día 3", href: `/day/3?tab=entreg` },
              ]}
              activeKey={activeTab}
            />

            {activeTab === "ref" && (
              <>
                <ObjectiveResultsCard yearLabel={SIMULATED_YEAR_LABEL[2]} result={day2Result} reportDay={3} />

                <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
                  <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                    ALM real — tu portafolio con tu prima real de {SIMULATED_YEAR_LABEL[1]}
                  </h3>
                  {realAlmYear1 ? (
                    <div className="flex flex-col gap-3">
                      <AlmRealYearTiles realYear={realAlmYear1} />
                      <AlmLadderTable rows={realAlmYear1.rows} />
                      <AlmPortfolioTable rows={realAlmYear1.rows} />
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--color-brand-text-secondary)]">
                      Aún no tienes un portafolio guardado, o las reservas correspondientes todavía no están disponibles.
                    </p>
                  )}
                </div>

                <DeliverablesReadOnly concepts={day2ReportConcepts} values={day2TrueValues} title="P&G real — Año 1" />
              </>
            )}

            {activeTab === "entreg" && (
              <>
                {TAB_NOTES[3]?.portfolio && <TabNote>{TAB_NOTES[3].portfolio}</TabNote>}
                <PortfolioForm
                  day={3}
                  initialDecision={isPortfolioDecisionV4(allocation?.allocation) ? allocation.allocation : null}
                  title="Portafolio de inversión — 2028 (opcional)"
                  showCapitalSocial={false}
                  locked={locked}
                />

                {reportConcepts.length > 0 && (
                  <>
                    {TAB_NOTES[3]?.deliverables && <TabNote>{TAB_NOTES[3].deliverables}</TabNote>}
                    <DeliverablesForm day={3} concepts={reportConcepts} initialValues={deliverableValues} locked={locked} />
                  </>
                )}
              </>
            )}
          </>
        )}

        {day === 4 && (
          <>
            <PillTabBar
              tabs={[
                { key: "ref", label: "Respuestas Día 3", href: `/day/4?tab=ref` },
                { key: "entreg", label: "Entregables Día 4", href: `/day/4?tab=entreg` },
              ]}
              activeKey={activeTab}
            />

            {activeTab === "ref" && (
              <>
                {capacityHistory.length > 0 && (
                  <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
                    <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                      Tu límite de cuota, 2027 vs. 2028
                    </h3>
                    <p className="mb-3 text-xs text-[var(--color-brand-text-secondary)]">
                      Este es el mismo límite de capacidad que viste en los resultados objetivos de cada año — puesto lado a lado para que veas si
                      tu capital se ajustó entre años, y si eso coincide con el Requerimiento de Capital y el Margen de solvencia que estás
                      reportando este día.
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

                <DeliverablesReadOnly concepts={day3ReportConcepts} values={day3TrueValues} title="P&G / Balance real — Año 2 y proyección Año 3" />
              </>
            )}

            {activeTab === "entreg" && (
              <>
                {reportConcepts.length > 0 && (
                  <>
                    {TAB_NOTES[4]?.deliverables && <TabNote>{TAB_NOTES[4].deliverables}</TabNote>}
                    <DeliverablesForm day={4} concepts={reportConcepts} initialValues={deliverableValues} locked={locked} />
                  </>
                )}

                {hasAnalitica && (
                  <>
                    {TAB_NOTES[4]?.analytics && <TabNote>{TAB_NOTES[4].analytics}</TabNote>}
                    <AnalyticsForm day={4} initialPicks={analyticsPicksByKey} locked={locked} />
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
