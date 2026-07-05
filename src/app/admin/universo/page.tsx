import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { UniverseGenerator, type UniverseRunSummary } from "./UniverseGenerator";

export default async function UniversoPage() {
  const cohort = await getOrCreateActiveCohort();
  // Explicit select excludes the `data` Bytes column — we only need status here.
  const runs = await prisma.universeRun.findMany({
    where: { cohortId: cohort.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, seed: true, rowCount: true, status: true, error: true, createdAt: true },
  });

  const toSummary = (kind: "colombia" | "chile"): UniverseRunSummary | null => {
    const run = runs.find((r) => r.kind === kind);
    if (!run) return null;
    return { ...run, createdAt: run.createdAt.toISOString() };
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-8">
      <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Universo de datos
      </h1>
      <p className="text-sm text-[var(--color-brand-text-secondary)]">
        Genera el universo sintético de pólizas de Colombia y el dataset de referencia de Chile. Hazlo una sola vez
        por cohorte, antes del Día 1 — todos los equipos tarifican sobre el mismo universo.
      </p>
      <UniverseGenerator initialColombia={toSummary("colombia")} initialChile={toSummary("chile")} />
    </main>
  );
}
