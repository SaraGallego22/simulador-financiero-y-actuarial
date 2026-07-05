import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { notaTarifacionAnio } from "@/domain/grading/composite";
import type { ObjectiveMode } from "@/domain/grading/composite";

const DAY = 1;

export default async function AdminStandingsPage() {
  const cohort = await getOrCreateActiveCohort();

  const [teams, rubric] = await Promise.all([
    prisma.team.findMany({
      where: { cohortId: cohort.id },
      include: {
        simResults: {
          where: { simulationRun: { day: DAY } },
          orderBy: { simulationRun: { createdAt: "desc" } },
          take: 1,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.rubricConfig.upsert({ where: { cohortId: cohort.id }, update: {}, create: { cohortId: cohort.id } }),
  ]);

  const withResult = teams.filter((t) => t.simResults[0]);
  const results = withResult.map((t, i) => ({
    teamId: i + 1,
    totalPremium: t.simResults[0].totalPremium,
    claimsAmount: t.simResults[0].claimsAmount,
  }));
  const scoreMap = notaTarifacionAnio(results, (rubric.objectiveMode as ObjectiveMode) || "relative");

  const ranked = withResult
    .map((t, i) => ({ team: t, result: t.simResults[0], score: scoreMap.get(i + 1) ?? 0 }))
    .sort((a, b) => b.score - a.score);

  const pending = teams.filter((t) => !t.simResults[0]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          Consolidado — Día {DAY}
        </h1>
        <p className="text-sm text-gray-600">
          Nota objetiva calculada con el modo de normalización configurado ({rubric.objectiveMode}).
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-brand-blue)] text-left text-white">
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">#</th>
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Nota</th>
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Loss ratio</th>
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Estado</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => {
              const lossRatio = r.result.totalPremium > 0 ? r.result.claimsAmount / r.result.totalPremium : null;
              return (
                <tr key={r.team.id} className="border-t border-[var(--color-brand-gray-light)]">
                  <td className="px-4 py-2 font-semibold">{i + 1}</td>
                  <td className="px-4 py-2">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.team.color }} />
                    {r.team.name}
                  </td>
                  <td className="px-4 py-2 font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue)]">
                    {r.score.toFixed(1)}
                  </td>
                  <td className="px-4 py-2">{lossRatio != null ? `${(lossRatio * 100).toFixed(1)}%` : "—"}</td>
                  <td className="px-4 py-2">
                    {r.result.published ? (
                      <span className="text-green-700">Publicado</span>
                    ) : (
                      <span className="text-gray-400">No publicado</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {pending.map((t) => (
              <tr key={t.id} className="border-t border-[var(--color-brand-gray-light)] text-gray-400">
                <td className="px-4 py-2">—</td>
                <td className="px-4 py-2">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
                  {t.name}
                </td>
                <td className="px-4 py-2" colSpan={3}>
                  Sin simulación para este día
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
