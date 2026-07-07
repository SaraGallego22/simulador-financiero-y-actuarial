import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TariffUpload } from "@/components/team/TariffUpload";
import { PortfolioForm } from "@/components/team/PortfolioForm";
import { InstrumentsPanel } from "@/components/team/InstrumentsPanel";
import { DeliverablesForm } from "@/components/team/DeliverablesForm";
import { AnalyticsForm } from "@/components/team/AnalyticsForm";
import { DayTabBar } from "@/components/DayTabBar";
import type { DayTabKey } from "@/components/DayTabBar";
import { conceptosDia } from "@/domain/grading/concepts";
import type { Dia } from "@/domain/grading/concepts";
import type { Recommendation } from "@/domain/grading/analytics";
import { isPortfolioDecisionV3 } from "@/domain/finance/instruments";
import { scoreFinanciero, almLadder } from "@/domain/finance/alm";
import { getTeamBookForDay, computeReservesForTeams } from "@/lib/teamBook";
import { AlmScoreTiles, AlmLadderTable, AlmPortfolioTable } from "@/components/AlmLadderTable";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { computeConsolidado } from "@/lib/consolidado";
import { DAY_TITLES, DAY_DESCRIPTIONS, TAB_NOTES } from "@/lib/days";

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
  const { tab } = await searchParams;
  const activeTab = (tab as DayTabKey) ?? (includeSim ? "sim" : "entreg");
  const session = await auth();
  const teamId = session?.user.teamId ?? null;

  // Only the serializable fields — Concepto.get is a function and can't
  // cross the Server->Client Component boundary (see DeliverablesForm).
  const reportConcepts = conceptosDia(`d${day}` as Dia)
    .filter((c) => c.tipo === "reporte")
    .map((c) => ({ id: c.id, label: c.label, unit: c.unit }));
  const hasAnalitica = conceptosDia(`d${day}` as Dia).some((c) => c.tipo === "auto_analitica");

  const topRows =
    activeTab === "top" ? await computeConsolidado((await getOrCreateActiveCohort()).id, true) : null;

  const [submission, publishedResult, allocation, deliverables, analyticsRecs, memberScores] = await Promise.all([
    teamId
      ? prisma.tariffSubmission.findUnique({ where: { teamId_day: { teamId, day } }, select: { meanPremium: true } })
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
    teamId
      ? prisma.memberScore.findMany({
          where: { day, published: true, teamMember: { teamId } },
          include: { skill: true, teamMember: true },
        })
      : [],
  ]);
  // Subjective grading is person-level only — the team's grade per skill is
  // the average across members who have a published score for it.
  const teamAverageBySkill: { skillName: string; average: number }[] = [];
  {
    const bySkill = new Map<string, { skillName: string; values: number[] }>();
    for (const s of memberScores) {
      if (s.value == null) continue;
      if (!bySkill.has(s.skillId)) bySkill.set(s.skillId, { skillName: s.skill.name, values: [] });
      bySkill.get(s.skillId)!.values.push(s.value);
    }
    for (const { skillName, values } of bySkill.values()) {
      if (values.length > 0) teamAverageBySkill.push({ skillName, average: values.reduce((a, b) => a + b, 0) / values.length });
    }
  }
  const deliverableValues = Object.fromEntries(deliverables.map((d) => [d.conceptId, d.value]));
  const analyticsByKey = Object.fromEntries(
    analyticsRecs.map((r) => [r.segmentKey, r.recommendation as Recommendation])
  );

  // ALM detail (team-scoped): only computed once the day's simulation is
  // published, same gate as the underwriting results above. Teams only
  // ever see the fictitious ALM (what's graded) — the real-premium
  // companion run exists for evaluators only, on the admin day page, so
  // teams work out their own real P&G figure instead of reading it off an
  // auto-computed number (see README §5.3).
  let almScore: ReturnType<typeof scoreFinanciero> = null;
  let almLadderRows: ReturnType<typeof almLadder> = null;
  if (activeTab === "obj" && includeSim && publishedResult && teamId) {
    const decision = isPortfolioDecisionV3(allocation?.allocation) ? allocation.allocation : null;
    if (decision) {
      const cohort = await getOrCreateActiveCohort();
      const book = await getTeamBookForDay(cohort.id, day);
      const reserves = book ? computeReservesForTeams(book.claimsByTeamId).get(teamId) : null;
      if (reserves) {
        almScore = scoreFinanciero(reserves, decision);
        almLadderRows = almLadder(reserves, decision);
      }
    }
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
        {day === 1 && (
          <Link
            href={`/day/${day}/guia`}
            className="shrink-0 rounded-md border border-[var(--color-brand-blue-accent)] px-3 py-2 font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)] transition-colors hover:bg-[var(--color-brand-blue-light)]"
          >
            📄 Guía del pasante
          </Link>
        )}
      </div>

      <DayTabBar basePath="/day" day={day} activeTab={activeTab} includeSim={includeSim} />

      {activeTab === "sim" && includeSim && (
        <div className="flex flex-col gap-4">
          {TAB_NOTES[day]?.sim && <TabNote>{TAB_NOTES[day].sim}</TabNote>}
          <a
            href="/api/universe/public-csv"
            className="w-fit rounded border border-[var(--color-brand-blue-accent)] px-4 py-2 text-sm font-medium text-[var(--color-brand-blue-accent)] hover:bg-[var(--color-brand-blue-light)]"
          >
            Descargar CSV público del universo
          </a>
          <TariffUpload
            day={day}
            initialComplete={submission?.meanPremium != null}
            initialMeanPremium={submission?.meanPremium ?? null}
          />
        </div>
      )}

      {activeTab === "entreg" && (
        <div className="flex flex-col gap-4">
          {includeSim && <InstrumentsPanel />}
          {includeSim && (
            <>
              {TAB_NOTES[day]?.portfolio && <TabNote>{TAB_NOTES[day].portfolio}</TabNote>}
              <PortfolioForm day={day} initialDecision={isPortfolioDecisionV3(allocation?.allocation) ? allocation.allocation : null} />
            </>
          )}
          {reportConcepts.length > 0 && (
            <>
              {TAB_NOTES[day]?.deliverables && <TabNote>{TAB_NOTES[day].deliverables}</TabNote>}
              <DeliverablesForm day={day} concepts={reportConcepts} initialValues={deliverableValues} />
            </>
          )}
          {hasAnalitica && (
            <>
              {TAB_NOTES[day]?.analytics && <TabNote>{TAB_NOTES[day].analytics}</TabNote>}
              <AnalyticsForm day={day} initialRecommendations={analyticsByKey} />
            </>
          )}
          {!includeSim && reportConcepts.length === 0 && !hasAnalitica && (
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
                <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Prima total</p>
                <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
                  ${Math.round(publishedResult.totalPremium).toLocaleString("es-CO")}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Siniestros</p>
                <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
                  {publishedResult.claimsCount.toLocaleString("es-CO")}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Monto siniestros</p>
                <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
                  ${Math.round(publishedResult.claimsAmount).toLocaleString("es-CO")}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Loss ratio</p>
                <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue-accent)]">
                  {publishedResult.totalPremium > 0
                    ? `${((publishedResult.claimsAmount / publishedResult.totalPremium) * 100).toFixed(1)}%`
                    : "—"}
                </p>
              </div>
              {includeSim && (
                <div className="col-span-2 sm:col-span-4">
                  <a
                    href={`/api/teams/report?day=${day}`}
                    className="inline-block rounded border border-[var(--color-brand-blue-accent)] px-4 py-2 text-sm font-medium text-[var(--color-brand-blue-accent)] hover:bg-[var(--color-brand-blue-light)]"
                  >
                    Descargar reporte de tu cartera (CSV)
                  </a>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-brand-text-secondary)]">El evaluador aún no ha publicado los resultados de este día.</p>
          )}
        </div>

        {includeSim && (
          <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue-accent)] bg-[var(--color-brand-surface)] p-5">
            <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              ALM — tu portafolio vs. tus reservas
            </h3>
            {almScore ? (
              <div className="flex flex-col gap-3">
                <AlmScoreTiles score={almScore} />
                {almLadderRows && <AlmLadderTable rows={almLadderRows.rows} />}
                {almLadderRows && <AlmPortfolioTable rows={almLadderRows.rows} />}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-brand-text-secondary)]">
                {publishedResult
                  ? "Aún no tienes un portafolio guardado o no hay reservas calculadas para este día."
                  : "El evaluador aún no ha publicado los resultados de este día."}
              </p>
            )}
          </div>
        )}
        </div>
      )}

      {activeTab === "subj" && (
        <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
          <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
            Calificación subjetiva — Día {day}
          </h3>
          {memberScores.length === 0 ? (
            <p className="text-sm text-[var(--color-brand-text-secondary)]">El evaluador aún no ha publicado la calificación subjetiva de este día.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {teamAverageBySkill.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">Nota de tu equipo (promedio por integrante)</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {teamAverageBySkill.map((s) => (
                      <div key={s.skillName} className="rounded border border-[var(--color-brand-gray-light)] px-3 py-2">
                        <p className="text-xs text-[var(--color-brand-text-secondary)]">{s.skillName}</p>
                        <p className="font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-blue-accent)]">
                          {s.average.toFixed(1)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {memberScores.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">Por integrante</p>
                  <div className="flex flex-col gap-2">
                    {Object.entries(
                      memberScores.reduce<Record<string, typeof memberScores>>((acc, s) => {
                        acc[s.teamMember.name] = [...(acc[s.teamMember.name] ?? []), s];
                        return acc;
                      }, {} as Record<string, typeof memberScores>)
                    ).map(([name, scores]) => (
                      <div key={name}>
                        <p className="text-xs font-semibold text-[var(--color-foreground)]">{name}</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {scores.map((s) => (
                            <div key={s.id} className="rounded border border-[var(--color-brand-gray-light)] px-3 py-2">
                              <p className="text-xs text-[var(--color-brand-text-secondary)]">{s.skill.name}</p>
                              <p className="font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-blue-accent)]">
                                {s.value ?? "—"}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
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
