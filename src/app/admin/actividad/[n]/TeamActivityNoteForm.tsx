"use client";

import { upsertTeamActivityNoteAction } from "@/lib/adminActions";

/** Single editable note per team/activity — saving overwrites the previous text (see TeamActivityNote's doc comment). */
export function TeamActivityNoteForm({ teamId, activity, initialText }: { teamId: string; activity: number; initialText: string }) {
  const action = upsertTeamActivityNoteAction.bind(null, teamId, activity);

  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2">
      <label className="flex flex-1 flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
        Comentario para el equipo
        <textarea
          name="text"
          rows={2}
          defaultValue={initialText}
          className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
        />
      </label>
      <button
        type="submit"
        className="rounded border border-[var(--color-brand-gray-light)] px-3 py-1.5 text-xs font-medium text-[var(--color-brand-blue-accent)] hover:bg-[var(--color-brand-blue-light)]"
      >
        Guardar
      </button>
    </form>
  );
}
