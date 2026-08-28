import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCohortForSession, getOrCreateActiveCohort } from "@/lib/cohort";
import { getActiveColombiaUniverse } from "@/lib/teamBook";
import { computeFinBenchForCohort } from "@/lib/finBenchHelper";
import { SIMULATED_YEAR_LABEL } from "@/lib/days";
import { Table } from "@/components/ui/table";
import { MarketYearSelect } from "./MarketYearSelect";

// Never statically prerender — see admin/standings/page.tsx.
export const dynamic = "force-dynamic";

const YEAR_INDICES = [1, 2, 3] as const;

const fmtCop = (v: number | null) => (v == null ? "—" : `$${Math.round(v).toLocaleString("es-CO")}`);
const fmtM = (v: number | null) => (v == null ? "—" : `$${Math.round(v / 1e6).toLocaleString("es-CO")} M`);
const fmtPct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);

export default async function TeamMarketPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const { anio } = await searchParams;
  const session = await auth();
  const cohort = session ? await getCohortForSession(session) : await getOrCreateActiveCohort();
  const teamId = session?.user.teamId ?? null;

  // A simulated year Y (1 → 2027, 2 → 2028, 3 → 2029 proyectado) is visible to
  // teams only once the day AFTER it has been opened — the same rule that
  // governs /standings (rankingMaxDay = openDay - 1) and the per-day results
  // cards (Día 2 muestra el 2027, Día 3 el 2028, Día 4 la proyección del 2029).
  const visibleYears = YEAR_INDICES.filter((y) => cohort.openDay > y).map((y) => ({ index: y, label: SIMULATED_YEAR_LABEL[y] }));

  const heading = (
    <div>
      <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Resultados del mercado
      </h1>
      <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">
        Cómo se resolvió el mercado cada año. Tu equipo aparece con su nombre; el resto va anónimo. RT y patrimonio en millones de pesos.
      </p>
    </div>
  );

  if (visibleYears.length === 0) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-8">
        {heading}
        <p className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5 text-sm text-[var(--color-brand-text-secondary)]">
          Todavía no hay años cerrados. El evaluador habilita cada año a medida que avanza el reto.
        </p>
      </main>
    );
  }

  const selected = visibleYears.find((y) => y.label === anio) ?? visibleYears[visibleYears.length - 1];
  // 2027/2028 tuvieron mercado (la simulación del Día 1/2); el 2029 es solo la
  // proyección financiera del Día 3 — sin mercado no hay cuota, prima mediana
  // ni cobro mediano.
  const simDay = selected.index <= 2 ? selected.index : null;

  const universe = await getActiveColombiaUniverse(cohort.id);

  const [teams, benchByTeamId, simResults, tariffs] = await Promise.all([
    prisma.team.findMany({
      where: { cohortId: cohort.id },
      select: { id: true, name: true, color: true },
      orderBy: { createdAt: "asc" },
    }),
    computeFinBenchForCohort(cohort.id, universe ?? undefined),
    simDay
      ? prisma.teamSimResult.findMany({
          where: { simulationRun: { cohortId: cohort.id, day: simDay, status: "DONE" } },
          orderBy: { simulationRun: { createdAt: "desc" } },
          select: { teamId: true, insuredCount: true, extra: true },
        })
      : Promise.resolve([]),
    simDay
      ? prisma.tariffSubmission.findMany({
          where: { day: simDay, team: { cohortId: cohort.id } },
          select: { teamId: true, medianPremium: true },
        })
      : Promise.resolve([]),
  ]);

  // Keep only the latest DONE run per team (findMany above is ordered by run
  // recency, so the first entry wins).
  const simByTeamId = new Map<string, { insuredCount: number; extra: unknown }>();
  for (const r of simResults) {
    if (!simByTeamId.has(r.teamId)) simByTeamId.set(r.teamId, { insuredCount: r.insuredCount, extra: r.extra });
  }
  const medianTariffByTeamId = new Map(tariffs.map((t) => [t.teamId, t.medianPremium]));
  const totalInsured = [...simByTeamId.values()].reduce((s, r) => s + r.insuredCount, 0);

  const rows = teams.map((team) => {
    const bench = benchByTeamId.get(team.id) ?? null;
    const pnl = bench ? (selected.index === 1 ? bench.p1 : selected.index === 2 ? bench.p2 : bench.p3) : null;
    const bal = bench ? (selected.index === 1 ? bench.bal1 : selected.index === 2 ? bench.bal2 : bench.bal3) : null;
    const sim = simByTeamId.get(team.id);
    const extra = sim?.extra as { medianWonPremium?: number | null } | null;
    return {
      teamId: team.id,
      name: team.name,
      color: team.color,
      isMine: team.id === teamId,
      marketShare: sim && totalInsured > 0 ? sim.insuredCount / totalInsured : null,
      medianPremium: medianTariffByTeamId.get(team.id) ?? null,
      cobroMediano: extra?.medianWonPremium ?? null,
      lossRatio: pnl && pnl.primaDevengada > 0 ? pnl.costo / pnl.primaDevengada : null,
      rt: pnl?.rt ?? null,
      patrimonio: bal?.patrimonio ?? null,
    };
  });

  // Ranked so the anonymous "Equipo N" labels carry no identity from one year
  // to the next: por cuota de mercado cuando la hay, si no por patrimonio.
  rows.sort((a, b) =>
    simDay ? (b.marketShare ?? -Infinity) - (a.marketShare ?? -Infinity) : (b.patrimonio ?? -Infinity) - (a.patrimonio ?? -Infinity)
  );

  let anon = 0;
  const labelled = rows.map((r) => ({ ...r, label: r.isMine ? `${r.name} (tu equipo)` : `Equipo ${++anon}` }));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-8">
      {heading}

      <MarketYearSelect years={visibleYears.map((y) => y.label)} selected={selected.label} />

      <Table className="whitespace-nowrap">
        <Table.Head>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Market</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Prima mediana</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Cobro mediano</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Loss ratio</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">RT</th>
          <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Patrimonio</th>
        </Table.Head>
        <tbody>
          {labelled.map((r) => (
            <Table.Row key={r.teamId} className={r.isMine ? "!bg-[var(--color-brand-blue-light)] font-semibold" : ""}>
              <td className="px-4 py-2">
                {r.isMine && <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />}
                {r.label}
              </td>
              <td className="px-4 py-2">{fmtPct(r.marketShare)}</td>
              <td className="px-4 py-2">{fmtCop(r.medianPremium)}</td>
              <td className="px-4 py-2">{fmtCop(r.cobroMediano)}</td>
              <td className="px-4 py-2">{fmtPct(r.lossRatio)}</td>
              <td className="px-4 py-2">{fmtM(r.rt)}</td>
              <td className="px-4 py-2">{fmtM(r.patrimonio)}</td>
            </Table.Row>
          ))}
        </tbody>
      </Table>

      {simDay == null && (
        <p className="text-xs text-[var(--color-brand-text-secondary)]">
          {selected.label} es una proyección financiera: no hubo mercado ese año, así que no hay cuota de mercado, prima mediana ni cobro mediano.
        </p>
      )}
    </main>
  );
}
