import { getOrCreateActiveCohort } from "@/lib/cohort";
import { computeConsolidado, computeMemberConsolidado } from "@/lib/consolidado";
import { SOFT_SKILL_COMPETENCIES, COMPETENCY_LABELS } from "@/lib/softSkills";
import { Table } from "@/components/ui/table";
import { TrophyIcon } from "@/components/ui/icons";

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
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Consolidado final
        </h1>
        <p className="text-sm text-[var(--color-brand-text-secondary)]">
          Nota final ponderada de los 4 días (objetiva + subjetiva). El objetivo mezcla resultado actuarial y
          financiero; el subjetivo, la rúbrica por habilidad.
        </p>
      </div>

      <Table>
        <Table.Head>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">#</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 1</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 2</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 3</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 4</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Obj. final</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Subj. final</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Nota final</th>
        </Table.Head>
        <tbody>
          {rows.map((r, i) => (
            <Table.Row key={r.teamId}>
              <td className="px-4 py-2 font-semibold">
                {i < 3 ? <TrophyIcon rank={i} className="h-5 w-5" /> : i + 1}
              </td>
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
            </Table.Row>
          ))}
        </tbody>
      </Table>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-condensed)] text-xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
            Consolidado por integrante
          </h2>
          <a
            href="/api/members/consolidado-csv"
            className="rounded border border-[var(--color-brand-gray-light)] px-3 py-1.5 text-xs font-medium text-[var(--color-brand-blue-accent)] hover:bg-[var(--color-brand-blue-light)]"
          >
            Descargar CSV
          </a>
        </div>
        <p className="mb-3 text-sm text-[var(--color-brand-text-secondary)]">
          Promedio de la Nota general (1-5) que cada integrante recibió en la calificación subjetiva de los Días 2-4. Las columnas de habilidades
          blandas son el promedio de las 3 actividades (escala 1-4: No se evidencia / Regular / Bueno / Excelente) — ver comentarios de TH en el CSV.
        </p>
        <Table>
          <Table.Head>
            <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">#</th>
            <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Integrante</th>
            <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
            <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 2</th>
            <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 3</th>
            <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Día 4</th>
            <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Promedio</th>
            <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Días aprobados</th>
            <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Aptitud Riesgos</th>
            {SOFT_SKILL_COMPETENCIES.map((c) => (
              <th key={c} className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">
                {COMPETENCY_LABELS[c]}
              </th>
            ))}
          </Table.Head>
          <tbody>
            {memberRows.map((r, i) => (
              <Table.Row key={r.teamMemberId}>
                <td className="px-4 py-2 font-semibold">
                  {i < 3 ? <TrophyIcon rank={i} className="h-5 w-5" /> : i + 1}
                </td>
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
                <td className="px-4 py-2">{r.aptitudesRiesgosCount}/3</td>
                {SOFT_SKILL_COMPETENCIES.map((c) => (
                  <td key={c} className="px-4 py-2">
                    {r.softSkills[c] != null ? r.softSkills[c]!.toFixed(1) : "—"}
                  </td>
                ))}
              </Table.Row>
            ))}
          </tbody>
        </Table>
      </div>
    </main>
  );
}
