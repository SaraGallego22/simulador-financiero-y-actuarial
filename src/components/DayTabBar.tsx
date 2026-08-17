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
 * Días 1-2 have a "sim" tab; Días 3-4 don't, since Year 2 is the last year
 * simulated — see CLAUDE.md's domain glossary. The portfolio/ALM forms live
 * in the "entreg" tab on every day that has one (Día 1's minimum-variance
 * exercise, Día 2's real tree) — as does tariff upload, on every day that
 * has one. On the team view, Día 1's "sim" tab is the tariff/simulation
 * panel; Día 2's is repurposed (see simLabel) to show Día 1's results
 * instead, since Día 2 no longer uses it for tariff upload.
 */
export function DayTabBar({
  basePath,
  day,
  activeTab,
  includeSim,
  includeSubj = true,
  simLabel,
}: {
  basePath: string;
  day: number;
  activeTab: DayTabKey;
  includeSim: boolean;
  /** Teams never see the "Calificación subjetiva" tab — only the admin does. Individual notas/comentarios aren't for teams; the team's own subjective nota (an aggregate) surfaces in "Top del día" instead. */
  includeSubj?: boolean;
  /** Overrides the "sim" tab's label — e.g. Día 2's team view repurposes that tab to show Día 1's results instead of a tariff/simulation panel. */
  simLabel?: string;
}) {
  // Día 1 has no subjective grade at all (see MemberDayEvaluation's doc
  // comment) — not enough contact time yet to judge each member.
  const tabs = (includeSim ? ALL_TABS : ALL_TABS.filter((t) => t.key !== "sim")).map((t) =>
    t.key === "sim" && simLabel ? { ...t, label: simLabel } : t
  ).filter(
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
