import { PillTabBar } from "./PillTabBar";

export type DayTabKey = "resultados" | "sim" | "entreg" | "obj" | "subj" | "top";

const ALL_TABS: { key: DayTabKey; label: string }[] = [
  { key: "resultados", label: "Resultados" },
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
  // Día 1 merges "Tarifas y simulación" + "Entregables" into a single
  // "Resultados" tab (see admin/day/[n]/page.tsx's "resultados" block)
  // instead of showing them separately, and folds "Resultados objetivos"
  // into "Top del día" (Día 1's own version of that table already carries
  // the Tarifas/mín-var/objetiva breakdown — a separate "obj" tab would
  // just repeat it). Día 1 also has no subjective grade (see
  // MemberDayEvaluation's doc comment) — not enough contact time yet to
  // judge each member.
  //
  // Día 2 gets the same "Resultados"/"Top del día" merge (it does have
  // subjective grading, so "subj" stays a separate tab) — every other day
  // keeps the original 5-tab split.
  const tabs = ALL_TABS.filter((t) => {
    if (day === 1) return t.key !== "sim" && t.key !== "entreg" && t.key !== "subj" && t.key !== "obj";
    if (day === 2) return t.key !== "sim" && t.key !== "entreg" && t.key !== "obj";
    if (t.key === "resultados") return false;
    if (t.key === "sim") return includeSim;
    if (t.key === "subj") return includeSubj;
    return true;
  });
  return (
    <PillTabBar tabs={tabs.map((t) => ({ key: t.key, label: t.label, href: `${basePath}/${day}?tab=${t.key}` }))} activeKey={activeTab} />
  );
}
