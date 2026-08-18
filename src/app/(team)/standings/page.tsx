import { auth } from "@/lib/auth";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { computeConsolidado } from "@/lib/consolidado";
import { Table } from "@/components/ui/table";

// Never statically prerender — see admin/standings/page.tsx.
export const dynamic = "force-dynamic";

const fmt = (v: number | null) => (v != null ? v.toFixed(1) : "—");

export default async function TeamStandingsPage() {
  const session = await auth();
  const cohort = await getOrCreateActiveCohort();
  const rows = await computeConsolidado(cohort.id, cohort.openDay);
  const ranked = rows.filter((r) => r.notaFinal != null);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-8">
      <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Ranking general
      </h1>
      <p className="text-sm text-[var(--color-brand-text-secondary)]">
        Nota final ponderada de los días habilitados hasta ahora.
      </p>

      {ranked.length === 0 ? (
        <p className="text-sm text-[var(--color-brand-text-secondary)]">Todavía no hay resultados disponibles.</p>
      ) : (
        <Table>
          <Table.Head>
            <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">#</th>
            <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
            <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Nota final</th>
          </Table.Head>
          <tbody>
            {ranked.map((r, i) => {
              const isMine = r.teamId === session?.user.teamId;
              return (
                <Table.Row key={r.teamId} className={isMine ? "!bg-[var(--color-brand-blue-light)] font-semibold" : ""}>
                  <td className="px-4 py-2">{i + 1}</td>
                  <td className="px-4 py-2">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                    {r.teamName}
                    {isMine && " (tu equipo)"}
                  </td>
                  <td className="px-4 py-2 font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue-accent)]">
                    {fmt(r.notaFinal)}
                  </td>
                </Table.Row>
              );
            })}
          </tbody>
        </Table>
      )}
    </main>
  );
}
