import { auth } from "@/lib/auth";
import { signOutAction } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { TariffUpload } from "./TariffUpload";

const DAY = 1;

export default async function TeamDashboard() {
  const session = await auth();
  const teamId = session?.user.teamId ?? null;

  const [team, submission, publishedResult] = await Promise.all([
    teamId ? prisma.team.findUnique({ where: { id: teamId } }) : null,
    teamId
      ? prisma.tariffSubmission.findUnique({
          where: { teamId_day: { teamId, day: DAY } },
          select: { meanPremium: true },
        })
      : null,
    teamId
      ? prisma.teamSimResult.findFirst({
          where: { teamId, published: true, simulationRun: { day: DAY } },
          orderBy: { simulationRun: { createdAt: "desc" } },
        })
      : null,
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          {team?.name ?? "Equipo"}
        </h1>
        <form action={signOutAction}>
          <button type="submit" className="text-sm text-gray-500 underline hover:text-gray-700">
            Cerrar sesión
          </button>
        </form>
      </div>
      <p className="text-sm text-gray-600">
        Descarga el universo de pólizas, define tu tarifa por póliza y sube el resultado. Tus resultados objetivos y
        la calificación subjetiva aparecerán aquí una vez que el evaluador corra la simulación y los publique.
      </p>

      <a
        href="/api/universe/public-csv"
        className="w-fit rounded border border-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-[var(--color-brand-blue)] hover:bg-[var(--color-brand-blue-light)]"
      >
        Descargar CSV público del universo
      </a>

      <TariffUpload day={DAY} initialComplete={submission?.meanPremium != null} initialMeanPremium={submission?.meanPremium ?? null} />

      <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-cyan)] bg-white p-5">
        <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          Resultados — Día {DAY}
        </h3>
        {publishedResult ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-gray-500">Asegurados</p>
              <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue)]">
                {publishedResult.insuredCount.toLocaleString("es-CO")}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Prima total</p>
              <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue)]">
                ${Math.round(publishedResult.totalPremium).toLocaleString("es-CO")}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Siniestros</p>
              <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue)]">
                {publishedResult.claimsCount.toLocaleString("es-CO")}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase text-gray-500">Loss ratio</p>
              <p className="font-[family-name:var(--font-condensed)] text-xl font-bold text-[var(--color-brand-blue)]">
                {publishedResult.totalPremium > 0
                  ? `${((publishedResult.claimsAmount / publishedResult.totalPremium) * 100).toFixed(1)}%`
                  : "—"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">El evaluador aún no ha publicado los resultados de este día.</p>
        )}
      </div>
    </main>
  );
}
