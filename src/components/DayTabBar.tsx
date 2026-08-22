import { PillTabBar } from "./PillTabBar";

export type DayTabKey = "resultados" | "subj" | "top";

const ALL_TABS: { key: DayTabKey; label: string }[] = [
  { key: "resultados", label: "Resultados" },
  { key: "subj", label: "Calificación subjetiva" },
  { key: "top", label: "Top del día" },
];

/**
 * Drives the admin's per-day sub-tabs (yr-tab-bar in the legacy prototype).
 * Every day now shows the same three: "Resultados" (everything the teams
 * submitted plus what the engine computed against it), "Calificación
 * subjetiva" and "Top del día".
 *
 * The legacy 5-tab split ("Tarifas y simulación" / "Entregables" /
 * "Resultados objetivos" separately) is gone: each of those panels only
 * ever showed one slice of the same per-team story, so an evaluator had to
 * tab back and forth to answer a single question about a single team. Días
 * 1-2 were merged first; Días 3-4 follow the same shape. What used to live
 * in "Resultados objetivos" (finBench, balance/proyección) sits at the
 * bottom of "Resultados"; the objective nota's component breakdown sits in
 * "Top del día", next to the nota it explains.
 *
 * Team days are still a single unmarked panel each, except Día 3, which
 * reuses the underlying PillTabBar directly (see app/(team)/day/[n]/page.tsx)
 * for its own two-tab "Respuestas Día 2" / "Entregables Día 3" split — this
 * component's fixed ALL_TABS/basePath+day shape doesn't fit that case.
 */
export function DayTabBar({
  basePath,
  day,
  activeTab,
  includeSubj = true,
}: {
  basePath: string;
  day: number;
  activeTab: DayTabKey;
  /** Teams never see the "Calificación subjetiva" tab — only the admin does. Individual notas/comentarios aren't for teams; the team's own subjective nota (an aggregate) surfaces in "Top del día" instead. */
  includeSubj?: boolean;
}) {
  // Día 1 has no subjective grade at all (see MemberDayEvaluation's doc
  // comment) — not enough contact time yet to judge each member.
  const tabs = ALL_TABS.filter((t) => (t.key === "subj" ? includeSubj && day !== 1 : true));
  return (
    <PillTabBar tabs={tabs.map((t) => ({ key: t.key, label: t.label, href: `${basePath}/${day}?tab=${t.key}` }))} activeKey={activeTab} />
  );
}
