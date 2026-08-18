import Link from "next/link";

/** Shared pill-shaped tab-switcher styling — used by DayTabBar (admin) and the team Día 3 results/entregables split. */
export function PillTabBar({ tabs, activeKey }: { tabs: { key: string; label: string; href: string }[]; activeKey: string }) {
  return (
    <div className="inline-flex w-fit flex-wrap gap-1 rounded-full bg-[var(--color-brand-gray-light)] p-1">
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Link
            key={tab.key}
            href={tab.href}
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
