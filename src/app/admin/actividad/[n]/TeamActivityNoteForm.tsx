"use client";

import { useTransition } from "react";
import { upsertTeamActivityNoteAction } from "@/lib/adminActions";
import { useToast } from "@/components/ui/ToastProvider";

/**
 * Single editable note per team/activity — saving overwrites the previous
 * text (see TeamActivityNote's doc comment). Unlike AddCommentForm this
 * doesn't clear the field or require non-empty text (an empty save is a
 * valid way to clear the note); it only needed the same pending-disabled +
 * toast confirmation so "Guardar" visibly does something.
 */
export function TeamActivityNoteForm({ teamId, activity, initialText }: { teamId: string; activity: number; initialText: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <form
      action={(formData: FormData) => {
        startTransition(async () => {
          await upsertTeamActivityNoteAction(teamId, activity, formData);
          toast.success("Comentario del equipo guardado.");
        });
      }}
      className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2"
    >
      <label className="flex flex-1 flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
        Comentario para el equipo
        <textarea
          name="text"
          rows={2}
          defaultValue={initialText}
          disabled={pending}
          className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm disabled:opacity-60"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-full px-3 py-1.5 text-xs font-medium text-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-accent)]/12 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 active:translate-y-0 hover:bg-[var(--color-brand-blue-accent)]/20 hover:shadow-[var(--shadow-md)] disabled:opacity-60 disabled:pointer-events-none"
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
