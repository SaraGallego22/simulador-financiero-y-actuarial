import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { publishAllAction, togglePublishedAction } from "@/lib/adminActions";
import { getTeamBookForDay, computeReservesForTeams } from "@/lib/teamBook";
import { scoreFinanciero } from "@/domain/finance/alm";
import type { Allocation } from "@/domain/finance/instruments";
import { SimulationTrigger } from "./SimulationTrigger";

export default async function AdminDayPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const day = Number(n);
  const cohort = await getOrCreateActiveCohort();

  const teams = await prisma.team.findMany({
    where: { cohortId: cohort.id },
    include: {
      tariffSubmissions: { where: { day }, select: { meanPremium: true } },
      portfolioAllocations: { where: { day }, select: { allocation: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const latestRun = await prisma.simulationRun.findFirst({
    where: { cohortId: cohort.id, day },
    orderBy: { createdAt: "desc" },
    include: { teamResults: true },
  });

  const resultByTeamId = new Map((latestRun?.teamResults ?? []).map((r) => [r.teamId, r]));
  const submittedCount = teams.filter((t) => t.tariffSubmissions[0]?.meanPremium != null).length;
  const defaultCuotaPercent = Math.min(100, Math.max(30, Math.ceil(100 / Math.max(submittedCount, 1))));

  // ALM score per team: needs each team's book of claims (from the completed
  // simulation) to compute reserves, plus whatever portfolio they uploaded.
  const almScoreByTeamId = new Map<string, ReturnType<typeof scoreFinanciero>>();
  if (latestRun?.status === "DONE") {
    const book = await getTeamBookForDay(cohort.id, day);
    if (book) {
      const reservesByTeamId = computeReservesForTeams(book.claimsByTeamId);
      for (const team of teams) {
        const allocation = team.portfolioAllocations[0]?.allocation as Allocation | undefined;
        const reserves = reservesByTeamId.get(team.id);
        if (allocation && reserves) {
          almScoreByTeamId.set(team.id, scoreFinanciero(reserves, allocation));
        }
      }
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          Día {day}
        </h1>
        <p className="text-sm text-gray-600">
          {submittedCount} de {teams.length} equipos han subido su tarifa completa.
        </p>
      </div>

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
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Loss ratio</th>
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Nota ALM</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => {
              const submitted = team.tariffSubmissions[0]?.meanPremium != null;
              const result = resultByTeamId.get(team.id);
              const lossRatio = result && result.totalPremium > 0 ? result.claimsAmount / result.totalPremium : null;
              const almScore = almScoreByTeamId.get(team.id);
              return (
                <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                  <td className="px-4 py-2">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                    {team.name}
                  </td>
                  <td className="px-4 py-2">
                    {submitted ? (
                      <span className="text-green-700">Completa</span>
                    ) : (
                      <span className="text-gray-400">Pendiente</span>
                    )}
                  </td>
                  <td className="px-4 py-2">{result ? result.insuredCount.toLocaleString("es-CO") : "—"}</td>
                  <td className="px-4 py-2">
                    {result ? `$${Math.round(result.totalPremium).toLocaleString("es-CO")}` : "—"}
                  </td>
                  <td className="px-4 py-2">{result ? result.claimsCount.toLocaleString("es-CO") : "—"}</td>
                  <td className="px-4 py-2">{lossRatio != null ? `${(lossRatio * 100).toFixed(1)}%` : "—"}</td>
                  <td className="px-4 py-2">{almScore ? almScore.nota.toFixed(1) : "—"}</td>
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
    </main>
  );
}
