"use client";

import { deleteTeamMemberAction } from "@/lib/adminActions";

export function DeleteMemberButton({ teamMemberId, memberName, day }: { teamMemberId: string; memberName: string; day: number }) {
  return (
    <form
      action={deleteTeamMemberAction.bind(null, teamMemberId, day)}
      onSubmit={(e) => {
        if (
          !confirm(
            `¿Eliminar a "${memberName}" del equipo? Dejará de contar en la calificación subjetiva, incluido su historial. Esta acción no se puede deshacer.`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="shrink-0 text-xs text-[var(--color-brand-text-secondary)] hover:text-[var(--color-brand-red)]" title="Eliminar participante">
        Eliminar participante
      </button>
    </form>
  );
}
