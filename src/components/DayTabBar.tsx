import Link from "next/link";

export type DayTabKey = "sim" | "entreg" | "obj" | "subj" | "top";

const ALL_TABS: { key: DayTabKey; label: string }[] = [
  { key: "sim", label: "Tarifas y simulación" },
  { key: "entreg", label: "Entregables" },
  { key: "obj", label: "Resultados objetivos" },
  { key: "subj", label: "Calificación subjetiva" },
  { key: "top", label: "Top del día" },
];

/**
 * Admin-only now: the team view is a single unmarked panel per day (see
 * app/(team)/day/[n]/page.tsx), no tab switching. This bar still drives the
 * admin's per-day sub-tabs (yr-tab-bar in the legacy prototype) — sim,
 * entregables, resultados objetivos, calificación subjetiva, top del día.
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
    <div className="inline-flex w-fit flex-wrap gap-1 rounded-full bg-[var(--color-brand-gray-light)] p-1">
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Link
            key={tab.key}
            href={`${basePath}/${day}?tab=${tab.key}`}
            className={`rounded-full px-4 py-1.5 font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-wide transition-all duration-150 ${
              active
                ? "bg-[var(--color-brand-surface)] text-[var(--color-brand-blue-accent)] shadow-[var(--shadow-sm)]"
                : "text-[var(--color-brand-text-secondary)] hover:text-[var(--color-brand-blue-accent)]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
