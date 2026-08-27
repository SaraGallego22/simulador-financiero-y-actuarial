import { auth } from "@/lib/auth";
import { getCohortForSession, getOrCreateActiveCohort } from "@/lib/cohort";
import { getActiveColombiaUniverse } from "@/lib/teamBook";
import { computeFinBenchForCohort } from "@/lib/finBenchHelper";
import { conceptosDia } from "@/domain/grading/concepts";
import { DeliverablesReadOnly } from "@/components/team/DeliverablesReadOnly";
import { PillTabBar } from "@/components/PillTabBar";
import { LockIcon } from "@/components/ui/icons";

// Static override of /day/[n] for the wrap-up day — a plain results + farewell
// screen with none of days 1-4's forms, so it doesn't belong in that switch.
// Only reachable once the admin picks "Reto terminado" (openDay = 5).
export const dynamic = "force-dynamic";

export default async function TeamDay5Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const activeTab = tab === "mensaje" ? "mensaje" : "respuestas";
  const session = await auth();
  const cohort = session ? await getCohortForSession(session) : await getOrCreateActiveCohort();

  if (cohort.openDay < 5) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-8">
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Día 5 — Cierre del reto
        </h1>
        <p className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5 text-sm text-[var(--color-brand-text-secondary)]">
          <LockIcon className="h-4 w-4 shrink-0" /> Este día se habilita cuando el evaluador da el reto por terminado.
        </p>
      </main>
    );
  }

  const teamId = session?.user.teamId ?? null;

  const day4ReportConcepts = conceptosDia("d4")
    .filter((c) => c.tipo === "reporte")
    .map((c) => ({ id: c.id, label: c.label, unit: c.unit, group: c.group }));

  // Día 4's TRUE solvency/dividend lines from finBench — shown read-only here
  // the same way Día 3 shows Año 1's real P&G and Día 4 shows Año 2/3's (see
  // day2TrueValues/day3TrueValues in /day/[n]/page.tsx).
  const day4TrueValues: Record<string, number> = {};
  if (activeTab === "respuestas" && teamId) {
    const universe = await getActiveColombiaUniverse(cohort.id);
    const benchByTeamId = await computeFinBenchForCohort(cohort.id, universe ?? undefined);
    const bench = benchByTeamId.get(teamId);
    if (bench) {
      for (const c of conceptosDia("d4").filter((c) => c.tipo === "reporte")) {
        const v = c.get?.(bench);
        if (v != null) day4TrueValues[c.id] = v;
      }
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Día 5 — Cierre del reto
        </h1>
        <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">
          El reto terminó. Aquí quedan las respuestas reales del Día 4 y un mensaje de despedida.
        </p>
      </div>

      <PillTabBar
        tabs={[
          { key: "respuestas", label: "Respuestas Día 4", href: `/day/5?tab=respuestas` },
          { key: "mensaje", label: "Mensaje", href: `/day/5?tab=mensaje` },
        ]}
        activeKey={activeTab}
      />

      {activeTab === "respuestas" && (
        <DeliverablesReadOnly
          concepts={day4ReportConcepts}
          values={day4TrueValues}
          title="Solvencia y dividendos reales — Día 4"
          collapsible
        />
      )}

      {activeTab === "mensaje" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-12 text-center">
          <p className="font-[family-name:var(--font-condensed)] text-4xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)] sm:text-5xl">
            ¡Éxitos en sus presentaciones!
          </p>
          <p className="text-base text-[var(--color-brand-text-secondary)] sm:text-lg">
            Gracias por esta semana inolvidable. — Juanpa
          </p>
        </div>
      )}
    </main>
  );
}
