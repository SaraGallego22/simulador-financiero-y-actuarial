import Link from "next/link";
import { auth } from "@/lib/auth";
import { signOutAction } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { INSTRUMENTS } from "@/domain/finance/instruments";
import { TariffUpload } from "./TariffUpload";
import { PortfolioUpload } from "./PortfolioUpload";

const DAY = 1;

export default async function TeamDashboard() {
  const session = await auth();
  const teamId = session?.user.teamId ?? null;

  const [team, submission, publishedResult, allocation] = await Promise.all([
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
    teamId ? prisma.portfolioAllocation.findUnique({ where: { teamId_day: { teamId, day: DAY } } }) : null,
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          {team?.name ?? "Equipo"}
        </h1>
        <div className="flex items-center gap-4">
          <Link href="/standings" className="text-sm text-[var(--color-brand-blue)] underline">
            Ver ranking
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="text-sm text-gray-500 underline hover:text-gray-700">
              Cerrar sesión
            </button>
          </form>
        </div>
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

      <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-white p-5">
        <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          Instrumentos disponibles
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-1 pr-4">ID</th>
                <th className="py-1 pr-4">Nombre</th>
                <th className="py-1 pr-4">Rendimiento EA</th>
                <th className="py-1 pr-4">Plazo</th>
              </tr>
            </thead>
            <tbody>
              {INSTRUMENTS.map((ins) => (
                <tr key={ins.id} className="border-t border-[var(--color-brand-gray-light)]">
                  <td className="py-1 pr-4 font-mono">{ins.id}</td>
                  <td className="py-1 pr-4">{ins.nombre}</td>
                  <td className="py-1 pr-4">{(ins.yield * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-4">{ins.plazoM >= 999 ? "sin venc." : `${ins.plazoM} meses`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <PortfolioUpload day={DAY} hasAllocation={!!allocation} />

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
