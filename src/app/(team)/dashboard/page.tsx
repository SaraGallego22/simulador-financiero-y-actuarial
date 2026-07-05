import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InstrumentsPanel } from "@/components/team/InstrumentsPanel";

const DAYS = [
  { n: 1, label: "Día 1 — Tarifación Año 1" },
  { n: 2, label: "Día 2 — P&G Año 1 y retarifación Año 2" },
  { n: 3, label: "Día 3 — P&G Año 2 y Balance" },
  { n: 4, label: "Día 4 — Solvencia, dividendos y analítica" },
];

export default async function TeamDashboard() {
  const session = await auth();
  const teamId = session?.user.teamId ?? null;

  const [team, submissions] = await Promise.all([
    teamId ? prisma.team.findUnique({ where: { id: teamId } }) : null,
    teamId
      ? prisma.tariffSubmission.findMany({ where: { teamId }, select: { day: true, meanPremium: true } })
      : [],
  ]);
  const completeByDay = new Map(submissions.map((s) => [s.day, s.meanPremium != null]));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-8">
      <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        {team?.name ?? "Equipo"}
      </h1>
      <p className="text-sm text-[var(--color-brand-text-secondary)]">
        Entra a cada día para descargar el universo, subir tu tarifa y tu portafolio, y ver tus resultados una vez
        publicados por el evaluador.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DAYS.map((d) => (
          <Link
            key={d.n}
            href={`/day/${d.n}`}
            className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue-accent)] bg-[var(--color-brand-surface)] p-4 hover:shadow-sm"
          >
            <p className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              {d.label}
            </p>
            <p className="mt-1 text-xs text-[var(--color-brand-text-secondary)]">
              {completeByDay.get(d.n) ? "Tarifa cargada" : "Tarifa pendiente"}
            </p>
          </Link>
        ))}
      </div>

      <InstrumentsPanel />
    </main>
  );
}
