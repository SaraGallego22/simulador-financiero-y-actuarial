"use client";

import { toggleAptitudesRiesgosAction } from "@/lib/adminActions";

export function AptitudesRiesgosToggle({ teamMemberId, day, active }: { teamMemberId: string; day: number; active: boolean }) {
  const action = toggleAptitudesRiesgosAction.bind(null, teamMemberId, day);

  return (
    <form action={action}>
      <button
        type="submit"
        className={`w-fit rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
          active
            ? "bg-[var(--color-brand-green)]/15 text-[var(--color-brand-green)]"
            : "border border-[var(--color-brand-gray-light)] text-[var(--color-brand-text-secondary)] hover:bg-[var(--color-brand-blue-light)]"
        }`}
      >
        {active ? "✓ Mostró aptitudes para Riesgos" : "Mostró aptitudes para Riesgos"}
      </button>
    </form>
  );
}
