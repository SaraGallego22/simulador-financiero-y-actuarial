"use client";

import { deleteTeamAction } from "@/lib/adminActions";
import { useConfirmSubmit } from "@/components/ui/confirm-modal";

export function DeleteTeamButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  const { formRef, onSubmit } = useConfirmSubmit(
    `¿Eliminar el equipo "${teamName}" y su cuenta de acceso? Esta acción no se puede deshacer.`,
    { destructive: true, confirmLabel: "Eliminar" }
  );

  return (
    <form ref={formRef} action={deleteTeamAction.bind(null, teamId)} onSubmit={onSubmit}>
      <button type="submit" className="text-xs text-[var(--color-brand-red)] underline hover:opacity-80">
        Eliminar
      </button>
    </form>
  );
}
