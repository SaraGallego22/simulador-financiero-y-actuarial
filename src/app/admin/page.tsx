import Link from "next/link";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";

export default async function AdminHome() {
  const cohort = await getOrCreateActiveCohort();
  const [teamCount, universeRuns] = await Promise.all([
    prisma.team.count({ where: { cohortId: cohort.id } }),
    prisma.universeRun.findMany({
      where: { cohortId: cohort.id },
      orderBy: { createdAt: "desc" },
      select: { kind: true, status: true },
    }),
  ]);

  const colombiaDone = universeRuns.find((r) => r.kind === "colombia")?.status === "DONE";
  const chileDone = universeRuns.find((r) => r.kind === "chile")?.status === "DONE";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Panel de administración
        </h1>
        <p className="text-sm text-[var(--color-brand-text-secondary)]">
          Cohorte activa: <strong>{cohort.name}</strong>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">Equipos creados</p>
          <p className="mt-1 font-[family-name:var(--font-condensed)] text-2xl font-bold text-[var(--color-brand-blue-accent)]">
            {teamCount}
          </p>
        </div>
        <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">Universo Colombia</p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-foreground)]">{colombiaDone ? "Generado" : "Pendiente"}</p>
        </div>
        <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-4">
          <p className="text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">Dataset Chile</p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-foreground)]">{chileDone ? "Generado" : "Pendiente"}</p>
        </div>
      </div>

      <p className="text-sm text-[var(--color-brand-text-secondary)]">
        Empieza en <Link href="/admin/universo" className="text-[var(--color-brand-blue-accent)] underline">Universo</Link> para
        generar los datos, luego en <Link href="/admin/config" className="text-[var(--color-brand-blue-accent)] underline">Configuración</Link> para
        crear las cuentas de los equipos y ajustar la rúbrica. Las vistas de simulación y calificación por día siguen
        en construcción.
      </p>
    </main>
  );
}
