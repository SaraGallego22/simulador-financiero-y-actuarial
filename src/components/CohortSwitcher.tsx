"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setSelectedCohortAction } from "@/lib/adminActions";
import { useSidebarCollapsed } from "@/lib/sidebarCollapse";

/**
 * Lets an ADMIN/ADMIN_TH session flip which cohort every admin page is
 * scoped to (see getSelectedCohort in cohort.ts) — hidden entirely while
 * only one cohort exists, since there's nothing to switch between yet.
 */
export function CohortSwitcher({ cohorts, selectedId }: { cohorts: { id: string; name: string }[]; selectedId: string }) {
  const router = useRouter();
  const collapsed = useSidebarCollapsed();
  const [pending, startTransition] = useTransition();

  if (cohorts.length <= 1) return null;
  if (collapsed) return null;

  return (
    <select
      value={selectedId}
      disabled={pending}
      onChange={(e) => {
        const id = e.target.value;
        startTransition(async () => {
          await setSelectedCohortAction(id);
          router.refresh();
        });
      }}
      title="Cohorte que estás administrando"
      className="w-full rounded-[var(--radius-sm)] border border-white/20 bg-white/10 px-2 py-1.5 font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
    >
      {cohorts.map((c) => (
        <option key={c.id} value={c.id} className="text-[var(--color-foreground)]">
          {c.name}
        </option>
      ))}
    </select>
  );
}
