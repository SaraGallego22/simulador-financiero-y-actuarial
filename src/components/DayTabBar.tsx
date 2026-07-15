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
 * Matches the legacy prototype's per-day sub-tab structure (yr-tab-bar):
 * Días 1-2 have a "sim" tab (tariff upload + trigger the year's
 * simulation); Días 3-4 don't, since Year 2 is the last year simulated —
 * see CLAUDE.md's domain glossary. The portfolio/ALM forms live in the
 * "entreg" tab on every day that has one (Día 1's minimum-variance
 * exercise, Día 2's real tree, Día 3's optional rebalance).
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
    <div className="flex flex-wrap gap-1 border-b border-[var(--color-brand-gray-light)]">
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Link
            key={tab.key}
            href={`${basePath}/${day}?tab=${tab.key}`}
            className={`-mb-px border-b-[3px] px-4 py-2 font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-wide transition-colors ${
              active
                ? "border-[var(--color-brand-yellow)] text-[var(--color-brand-blue-accent)]"
                : "border-transparent text-[var(--color-brand-text-secondary)] hover:text-[var(--color-brand-blue-accent)]"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
