"use client";

import { useRef, useTransition, type ReactNode } from "react";
import { useToast } from "./ToastProvider";

/**
 * Shared "add a new comment" form for MemberComments/SoftSkillComments/
 * InterviewComments. Without a pending-disabled button or any success
 * feedback, TH users facing Neon's cold-start delay (see prisma.ts) couldn't
 * tell a slow save from a failed one and re-clicked, producing duplicate
 * rows — this disables the button while the action is in flight and toasts
 * on completion so "Guardar" always visibly does something.
 */
export function AddCommentForm({
  action,
  label,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  label: string;
  children?: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  return (
    <form
      ref={formRef}
      action={(formData: FormData) => {
        const text = String(formData.get("text") ?? "").trim();
        if (!text) {
          toast.error("Escribe un comentario antes de guardar.");
          return;
        }
        startTransition(async () => {
          await action(formData);
          formRef.current?.reset();
          toast.success("Comentario guardado.");
        });
      }}
      className="flex flex-col gap-2"
    >
      <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
        {label}
        <textarea
          name="text"
          rows={2}
          disabled={pending}
          className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm disabled:opacity-60"
        />
      </label>
      {children}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full px-3 py-1.5 text-xs font-medium text-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-accent)]/12 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 active:translate-y-0 hover:bg-[var(--color-brand-blue-accent)]/20 hover:shadow-[var(--shadow-md)] disabled:opacity-60 disabled:pointer-events-none"
      >
        {pending ? "Guardando…" : "Agregar"}
      </button>
    </form>
  );
}
