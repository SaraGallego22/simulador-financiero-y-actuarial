import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TariffUpload } from "@/components/team/TariffUpload";
import { PortfolioUpload } from "@/components/team/PortfolioUpload";
import { DayTabBar } from "@/components/DayTabBar";
import type { DayTabKey } from "@/components/DayTabBar";

const DAY_TITLES: Record<number, string> = {
  1: "Tarificación Año 1 y portafolio",
  2: "P&G Año 1 y retarifación Año 2",
  3: "P&G Año 2 (+proy. A3) y Balance",
  4: "Solvencia, dividendos y analítica",
};

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

  const [submission, publishedResult, allocation] = await Promise.all([
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
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-8">
      <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
        Día {day} — {DAY_TITLES[day]}
      </h1>

      <DayTabBar basePath="/day" day={day} activeTab={activeTab} includeSim={includeSim} />

      {activeTab === "sim" && includeSim && (
        <div className="flex flex-col gap-4">
          <a
            href="/api/universe/public-csv"
            className="w-fit rounded border border-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-[var(--color-brand-blue)] hover:bg-[var(--color-brand-blue-light)]"
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
          <PortfolioUpload day={day} hasAllocation={!!allocation} />
          <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-white p-5 text-sm text-gray-500">
            Entregables financieros/analíticos adicionales se agregan próximamente.
          </div>
        </div>
      )}

      {activeTab === "obj" && (
        <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-cyan)] bg-white p-5">
          <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
            Resultados objetivos — Día {day}
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
      )}

      {activeTab === "subj" && (
        <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-white p-5 text-sm text-gray-500">
          Tu calificación subjetiva aparecerá aquí una vez el evaluador la publique.
        </div>
      )}

      {activeTab === "top" && (
        <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-white p-5 text-sm text-gray-500">
          Consulta el <a href="/standings" className="text-[var(--color-brand-blue)] underline">ranking general</a>.
        </div>
      )}
    </main>
  );
}
