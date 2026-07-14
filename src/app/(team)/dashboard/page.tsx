import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InstrumentsPanel } from "@/components/team/InstrumentsPanel";

const DAYS = [
  {
    n: 1,
    label: "Día 1 — Tarifación Año 1",
    actuarial: "Tarificas cada póliza del Año 1 antes de que el mercado se cierre.",
    financiero: "Presentas un portafolio de mínima varianza sujeto a un rendimiento objetivo.",
  },
  {
    n: 2,
    label: "Día 2 — P&G Año 1 y retarifación Año 2",
    actuarial: "Retarificas para el Año 2 (con retención de clientes) y reportas el estado de resultados del Año 1.",
    financiero: "Armas el árbol de decisiones de tu portafolio de inversión real.",
  },
  {
    n: 3,
    label: "Día 3 — P&G Año 2 y Balance",
    actuarial: "Reportas las reservas técnicas de Año 1 y Año 2.",
    financiero: "Reportas el estado de resultados del Año 2, la proyección del Año 3 y el Balance completo; puedes rebalancear tu portafolio.",
  },
  {
    n: 4,
    label: "Día 4 — Solvencia, dividendos y analítica",
    actuarial: "Recomiendas sectores del mercado a crecer y a disminuir.",
    financiero: "Reportas solvencia (capital requerido, margen) y dividendos.",
  },
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
        El reto simula 4 días de trabajo repartidos en 2 años de operación de una aseguradora de autos. Tu equipo
        compite contra los demás equipos del cohorte por una porción de un mercado sintético de 1.000.000 de pólizas
        en Colombia, tomando decisiones actuariales (tarifa, reservas, recomendaciones sectoriales) y financieras
        (portafolio de inversión, P&G, Balance, solvencia). Cada día se califica de forma objetiva, contra un motor
        de referencia, y de forma subjetiva, según la rúbrica del evaluador.
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
            <p className="mt-2 text-xs text-[var(--color-brand-text-secondary)]">
              <span className="font-semibold text-[var(--color-brand-blue-accent)]">Actuarial — </span>
              {d.actuarial}
            </p>
            <p className="mt-1 text-xs text-[var(--color-brand-text-secondary)]">
              <span className="font-semibold text-[var(--color-brand-blue-accent)]">Financiero — </span>
              {d.financiero}
            </p>
            <p className="mt-2 text-xs italic text-[var(--color-brand-text-secondary)]">
              {completeByDay.get(d.n) ? "Tarifa cargada" : "Tarifa pendiente"}
            </p>
          </Link>
        ))}
      </div>

      <InstrumentsPanel />
    </main>
  );
}
