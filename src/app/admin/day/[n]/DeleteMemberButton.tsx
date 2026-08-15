"use client";

import { deleteTeamMemberAction } from "@/lib/adminActions";
import { useConfirmSubmit } from "@/components/ui/confirm-modal";

export function DeleteMemberButton({ teamMemberId, memberName, day }: { teamMemberId: string; memberName: string; day: number }) {
  const { formRef, onSubmit } = useConfirmSubmit(
    `¿Eliminar a "${memberName}" del equipo? Dejará de contar en la calificación subjetiva, incluido su historial. Esta acción no se puede deshacer.`,
    { destructive: true, confirmLabel: "Eliminar" }
  );

  return (
    <form ref={formRef} action={deleteTeamMemberAction.bind(null, teamMemberId, day)} onSubmit={onSubmit}>
      <button type="submit" className="shrink-0 text-xs text-[var(--color-brand-text-secondary)] hover:text-[var(--color-brand-red)]" title="Eliminar participante">
        Eliminar participante
      </button>
    </form>
  );
}
