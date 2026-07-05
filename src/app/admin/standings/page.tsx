import { getOrCreateActiveCohort } from "@/lib/cohort";
import { computeConsolidado } from "@/lib/consolidado";

// computeConsolidado() reads live DB state (fetches per-team tariff blobs on
// Neon's free tier, ~10s each) and must never be statically prerendered —
// without this, `next build` tries to prerender it once at build time and
// times out (see CLAUDE.md §4.1 on Neon's bytea throughput ceiling).
export const dynamic = "force-dynamic";

const fmt = (v: number | null) => (v != null ? v.toFixed(1) : "—");

export default async function AdminStandingsPage() {
  const cohort = await getOrCreateActiveCohort();
  const rows = await computeConsolidado(cohort.id);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Consolidado final
        </h1>
        <p className="text-sm text-[var(--color-brand-text-secondary)]">
          Nota final ponderada de los 4 días (objetiva + subjetiva). El objetivo mezcla resultado actuarial y
          financiero; el subjetivo, la rúbrica por habilidad.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-brand-blue)] text-left text-white">
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">#</th>
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 1</th>
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 2</th>
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 3</th>
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 4</th>
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Obj. final</th>
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Subj. final</th>
              <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Nota final</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.teamId} className="border-t border-[var(--color-brand-gray-light)]">
                <td className="px-4 py-2 font-semibold">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                <td className="px-4 py-2">
                  <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                  {r.teamName}
                </td>
                {r.perDay.map((d, di) => (
                  <td key={di} className="px-4 py-2">
                    {fmt(d.nota)}
                  </td>
                ))}
                <td className="px-4 py-2">{fmt(r.objectiveFinal)}</td>
                <td className="px-4 py-2">{fmt(r.subjectiveFinal)}</td>
                <td className="px-4 py-2 font-[family-name:var(--font-condensed)] text-base font-bold text-[var(--color-brand-blue-accent)]">
                  {fmt(r.notaFinal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
