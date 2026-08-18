import { PillTabBar } from "./PillTabBar";

export type DayTabKey = "sim" | "entreg" | "obj" | "subj" | "top";

const ALL_TABS: { key: DayTabKey; label: string }[] = [
  { key: "sim", label: "Tarifas y simulación" },
  { key: "entreg", label: "Entregables" },
  { key: "obj", label: "Resultados objetivos" },
  { key: "subj", label: "Calificación subjetiva" },
  { key: "top", label: "Top del día" },
];

/**
 * Drives the admin's per-day sub-tabs (yr-tab-bar in the legacy prototype) —
 * sim, entregables, resultados objetivos, calificación subjetiva, top del
 * día. Team days are still a single unmarked panel each, except Día 3, which
 * reuses the underlying PillTabBar directly (see app/(team)/day/[n]/page.tsx)
 * for its own two-tab "Respuestas Día 2" / "Entregables Día 3" split — this
 * component's fixed ALL_TABS/basePath+day shape doesn't fit that case.
 */
export function DayTabBar({
  basePath,
  day,
  activeTab,
  includeSim,
  includeSubj = true,
}: {
  basePath: string;
  day: number;
  activeTab: DayTabKey;
  includeSim: boolean;
  /** Teams never see the "Calificación subjetiva" tab — only the admin does. Individual notas/comentarios aren't for teams; the team's own subjective nota (an aggregate) surfaces in "Top del día" instead. */
  includeSubj?: boolean;
}) {
  // Día 1 has no subjective grade at all (see MemberDayEvaluation's doc
  // comment) — not enough contact time yet to judge each member.
  const tabs = (includeSim ? ALL_TABS : ALL_TABS.filter((t) => t.key !== "sim")).filter(
    (t) => (day !== 1 || t.key !== "subj") && (includeSubj || t.key !== "subj")
  );
  return (
    <PillTabBar tabs={tabs.map((t) => ({ key: t.key, label: t.label, href: `${basePath}/${day}?tab=${t.key}` }))} activeKey={activeTab} />
  );
}
