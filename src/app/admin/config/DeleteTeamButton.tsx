"use client";

import { deleteTeamAction } from "@/lib/adminActions";

export function DeleteTeamButton({ teamId, teamName }: { teamId: string; teamName: string }) {
  return (
    <form
      action={() => deleteTeamAction(teamId)}
      onSubmit={(e) => {
        if (!confirm(`¿Eliminar el equipo "${teamName}" y su cuenta de acceso? Esta acción no se puede deshacer.`)) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-xs text-red-600 underline hover:text-red-800">
        Eliminar
      </button>
    </form>
  );
}
