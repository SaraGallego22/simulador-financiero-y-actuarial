import { auth } from "@/lib/auth";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { notaTarifacionAnio } from "@/domain/grading/composite";
import type { ObjectiveMode } from "@/domain/grading/composite";

const DAY = 1;

export default async function TeamStandingsPage() {
  const session = await auth();
  const cohort = await getOrCreateActiveCohort();

  const [teams, rubric] = await Promise.all([
    prisma.team.findMany({
      where: { cohortId: cohort.id },
      include: {
        simResults: {
          where: { published: true, simulationRun: { day: DAY } },
          orderBy: { simulationRun: { createdAt: "desc" } },
          take: 1,
        },
      },
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
    .map((t, i) => ({ team: t, score: scoreMap.get(i + 1) ?? 0 }))
    .sort((a, b) => b.score - a.score);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
        Ranking — Día {DAY}
      </h1>

      {ranked.length === 0 ? (
        <p className="text-sm text-gray-500">El evaluador aún no ha publicado resultados de este día.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-brand-blue)] text-left text-white">
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">#</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Nota</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => {
                const isMine = r.team.id === session?.user.teamId;
                return (
                  <tr
                    key={r.team.id}
                    className={`border-t border-[var(--color-brand-gray-light)] ${isMine ? "bg-[var(--color-brand-blue-light)] font-semibold" : ""}`}
                  >
                    <td className="px-4 py-2">{i + 1}</td>
                    <td className="px-4 py-2">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.team.color }} />
                      {r.team.name}
                      {isMine && " (tu equipo)"}
                    </td>
                    <td className="px-4 py-2 font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue)]">
                      {r.score.toFixed(1)}
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
