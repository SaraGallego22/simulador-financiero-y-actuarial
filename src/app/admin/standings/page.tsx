import { getOrCreateActiveCohort } from "@/lib/cohort";
import { computeConsolidado, computeMemberConsolidado } from "@/lib/consolidado";

// computeConsolidado() reads live DB state (fetches per-team tariff blobs on
// Neon's free tier, ~10s each) and must never be statically prerendered —
// without this, `next build` tries to prerender it once at build time and
// times out (see CLAUDE.md §4.1 on Neon's bytea throughput ceiling).
export const dynamic = "force-dynamic";

const fmt = (v: number | null) => (v != null ? v.toFixed(1) : "—");

export default async function AdminStandingsPage() {
  const cohort = await getOrCreateActiveCohort();
  const [rows, memberRows] = await Promise.all([computeConsolidado(cohort.id), computeMemberConsolidado(cohort.id)]);

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

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-condensed)] text-xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
            Consolidado por integrante
          </h2>
          <a
            href="/api/members/consolidado-csv"
            className="rounded border border-[var(--color-brand-blue-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-brand-blue-accent)] hover:bg-[var(--color-brand-blue-light)]"
          >
            Descargar CSV
          </a>
        </div>
        <p className="mb-3 text-sm text-[var(--color-brand-text-secondary)]">
          Promedio de la Nota general (1-5) que cada integrante recibió en la calificación subjetiva de los Días 2-4.
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-brand-blue)] text-left text-white">
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">#</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Integrante</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 2</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 3</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 4</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Promedio</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Días aprobados</th>
              </tr>
            </thead>
            <tbody>
              {memberRows.map((r, i) => (
                <tr key={r.teamMemberId} className="border-t border-[var(--color-brand-gray-light)]">
                  <td className="px-4 py-2 font-semibold">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                  <td className="px-4 py-2">{r.memberName}</td>
                  <td className="px-4 py-2">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.teamColor }} />
                    {r.teamName}
                  </td>
                  {r.perDay.map((d) => (
                    <td key={d.day} className="px-4 py-2">
                      {d.notaGeneral != null ? d.notaGeneral.toFixed(1) : "—"}
                    </td>
                  ))}
                  <td className="px-4 py-2 font-[family-name:var(--font-condensed)] text-base font-bold text-[var(--color-brand-blue-accent)]">
                    {r.promedio != null ? r.promedio.toFixed(1) : "—"}
                  </td>
                  <td className="px-4 py-2">
                    {r.diasAprobados}/{r.diasEvaluados}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
