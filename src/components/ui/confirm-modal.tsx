"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";

interface ConfirmOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button, for destructive actions (delete comment/team/member). */
  destructive?: boolean;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingConfirm {
  message: string;
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

/**
 * Replaces the app's native `confirm()` calls with a themed modal backed by
 * a native <dialog> (free focus trap / Esc / backdrop click handling).
 * Call sites change minimally: `if (!confirm("..."))` -> `if (!(await confirm("...")))`.
 * Mount <ConfirmModalHost> once near the root (see src/app/layout.tsx).
 */
export function ConfirmModalHost({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending && !dialog.open) {
      dialog.showModal();
    } else if (!pending && dialog.open) {
      dialog.close();
    }
  }, [pending]);

  const confirm = useCallback<ConfirmFn>((message, options = {}) => {
    return new Promise<boolean>((resolve) => {
      setPending({ message, options, resolve });
    });
  }, []);

  function settle(value: boolean) {
    pending?.resolve(value);
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialogRef}
        onCancel={(e) => {
          e.preventDefault();
          settle(false);
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) settle(false);
        }}
        className="animate-modal-pop m-auto w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-6 text-[var(--color-foreground)] shadow-[var(--shadow-lg)] backdrop:bg-black/40"
      >
        {pending && (
          <>
            <p className="mb-6 text-sm">{pending.message}</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="default" onClick={() => settle(false)}>
                {pending.options.cancelLabel ?? "Cancelar"}
              </Button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={`inline-flex h-9 cursor-pointer items-center justify-center rounded-[var(--radius-md)] px-4 text-sm font-medium text-white shadow-[var(--shadow-sm)] transition-all hover:shadow-[var(--shadow-md)] hover:brightness-90 ${
                  pending.options.destructive ? "bg-[var(--color-brand-red)]" : "bg-[image:var(--gradient-brand-primary)]"
                }`}
              >
                {pending.options.confirmLabel ?? "Confirmar"}
              </button>
            </div>
          </>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a ConfirmModalHost");
  }
  return ctx;
}

/**
 * Wraps a native `<form action={...}>` delete/destroy submit with the
 * themed confirm modal, replacing the `onSubmit={(e) => { if
 * (!confirm(...)) e.preventDefault(); }}` pattern that was repeated across
 * 5 files. Since `confirm()` here is async, the form is intercepted once,
 * then resubmitted programmatically (via `formRef`) once confirmed —
 * `confirmedRef` distinguishes that resubmit from the original click so it
 * isn't asked twice.
 *
 * Usage: `const { formRef, onSubmit } = useConfirmSubmit(message, options);`
 * then spread `ref={formRef} onSubmit={onSubmit}` onto the `<form>`.
 */
export function useConfirmSubmit(message: string, options?: ConfirmOptions) {
  const confirm = useConfirm();
  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (confirmedRef.current) {
      confirmedRef.current = false;
      return;
    }
    e.preventDefault();
    const ok = await confirm(message, options);
    if (ok) {
      confirmedRef.current = true;
      formRef.current?.requestSubmit();
    }
  }

  return { formRef, onSubmit };
}

/**
 * The "✕ delete this comment" form + confirm wiring repeated identically
 * across SoftSkillComments/MemberComments/InterviewComments — each just
 * binds a different server action to `action`.
 */
export function DeleteCommentForm({ action }: { action: ComponentProps<"form">["action"] }) {
  const { formRef, onSubmit } = useConfirmSubmit("¿Eliminar este comentario? Esta acción no se puede deshacer.", {
    destructive: true,
    confirmLabel: "Eliminar",
  });
  return (
    <form ref={formRef} action={action} onSubmit={onSubmit}>
      <button
        type="submit"
        className="shrink-0 text-xs text-[var(--color-brand-text-secondary)] hover:text-[var(--color-brand-red)]"
        title="Eliminar comentario"
      >
        ✕
      </button>
    </form>
  );
}
