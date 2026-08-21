"use client";

import { useState, useTransition, type ComponentProps } from "react";
import { DeleteCommentForm } from "./confirm-modal";

/**
 * One comment row shared by MemberComments/SoftSkillComments/InterviewComments:
 * text + meta label, with pencil (inline edit) and delete buttons. Actions
 * float in a shrink-0 column so long comment text wraps under them instead of
 * overlapping (see min-w-0/break-words on the text).
 */
export function EditableComment({
  text,
  meta,
  editAction,
  deleteAction,
}: {
  text: string;
  meta: string;
  editAction: (formData: FormData) => void | Promise<void>;
  deleteAction: ComponentProps<typeof DeleteCommentForm>["action"];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        action={(formData: FormData) => {
          startTransition(async () => {
            await editAction(formData);
            setEditing(false);
          });
        }}
        className="flex flex-col gap-1.5 rounded bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-sm"
      >
        <textarea
          name="text"
          defaultValue={text}
          rows={2}
          autoFocus
          className="w-full rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] px-2 py-1 text-sm text-[var(--color-foreground)]"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={pending}
            className="text-xs text-[var(--color-brand-text-secondary)] hover:text-[var(--color-foreground)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full px-3 py-1 text-xs font-medium text-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-accent)]/12 transition-colors hover:bg-[var(--color-brand-blue-accent)]/20"
          >
            Guardar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-start justify-between gap-2 rounded bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-sm">
      <p className="min-w-0 flex-1 break-words text-[var(--color-foreground)]">
        {text}
        <span className="ml-1 text-xs text-[var(--color-brand-text-secondary)]">{meta}</span>
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 text-xs text-[var(--color-brand-text-secondary)] hover:text-[var(--color-brand-blue-accent)]"
          title="Editar comentario"
        >
          ✎
        </button>
        <DeleteCommentForm action={deleteAction} />
      </div>
    </div>
  );
}
