"use client";

import { useRouter } from "next/navigation";

/**
 * Year picker for the team "Resultados del mercado" page — navigates via an
 * `anio` query param (2027/2028/2029) the server page reads. Same pattern as
 * admin's TeamSelect, minus the extra-params plumbing (this page has none).
 */
export function MarketYearSelect({ years, selected }: { years: string[]; selected: string }) {
  const router = useRouter();

  return (
    <label className="flex w-fit flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
      Año
      <select
        value={selected}
        onChange={(e) => router.push(`/mercado?anio=${e.target.value}`)}
        className="min-w-40 rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-foreground)]"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  );
}
