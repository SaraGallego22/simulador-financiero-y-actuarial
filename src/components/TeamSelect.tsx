"use client";

import { useRouter } from "next/navigation";

export interface TeamSelectOption {
  id: string;
  name: string;
  color: string;
}

/**
 * Single-team picker for admin pages that show one team at a time (day
 * subjective grading, habilidades blandas activities, entrevista TH) —
 * navigates via a `team` query param on change, preserving whatever other
 * params (e.g. `tab=subj`) the page already carries.
 */
export function TeamSelect({
  teams,
  selectedTeamId,
  basePath,
  extraParams = {},
}: {
  teams: TeamSelectOption[];
  selectedTeamId: string;
  basePath: string;
  extraParams?: Record<string, string>;
}) {
  const router = useRouter();

  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
      Equipo
      <select
        value={selectedTeamId}
        onChange={(e) => {
          const params = new URLSearchParams(extraParams);
          params.set("team", e.target.value);
          router.push(`${basePath}?${params.toString()}`);
        }}
        className="min-w-56 rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-foreground)]"
      >
        {teams.map((t) => (
          <option key={t.id} value={t.id} style={{ color: t.color }}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
