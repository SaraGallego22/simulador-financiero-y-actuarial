import { auth } from "@/lib/auth";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { computeConsolidado } from "@/lib/consolidado";

// Never statically prerender — see admin/standings/page.tsx.
export const dynamic = "force-dynamic";

const fmt = (v: number | null) => (v != null ? v.toFixed(1) : "—");

export default async function TeamStandingsPage() {
  const session = await auth();
  const cohort = await getOrCreateActiveCohort();
  const rows = await computeConsolidado(cohort.id, true);
  const ranked = rows.filter((r) => r.notaFinal != null);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Ranking general
      </h1>
      <p className="text-sm text-[var(--color-brand-text-secondary)]">
        Nota final ponderada de los días publicados. Solo se muestran los resultados que el evaluador ya publicó.
      </p>

      {ranked.length === 0 ? (
        <p className="text-sm text-[var(--color-brand-text-secondary)]">El evaluador aún no ha publicado resultados.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-brand-blue)] text-left text-white">
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">#</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Nota final</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => {
                const isMine = r.teamId === session?.user.teamId;
                return (
                  <tr
                    key={r.teamId}
                    className={`border-t border-[var(--color-brand-gray-light)] ${isMine ? "bg-[var(--color-brand-blue-light)] font-semibold" : ""}`}
                  >
                    <td className="px-4 py-2">{i + 1}</td>
                    <td className="px-4 py-2">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                      {r.teamName}
                      {isMine && " (tu equipo)"}
                    </td>
                    <td className="px-4 py-2 font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue-accent)]">
                      {fmt(r.notaFinal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
