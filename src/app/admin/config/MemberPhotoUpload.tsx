"use client";

import { useActionState, useRef, type ClipboardEvent } from "react";
import { uploadMemberPhotoAction, type UploadMemberPhotoState } from "@/lib/adminActions";

export function MemberPhotoUpload({ teamMemberId }: { teamMemberId: string }) {
  const action = uploadMemberPhotoAction.bind(null, teamMemberId);
  const [state, formAction, pending] = useActionState<UploadMemberPhotoState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clic en el campo + Ctrl/Cmd+V con una imagen copiada (screenshot, portapapeles
  // del explorador, etc.) — evita tener que guardarla en disco primero. Sube de
  // una vez, igual que si se hubiera elegido el archivo y dado clic en "Subir foto".
  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    const file = item?.getAsFile();
    if (!file || !inputRef.current) return;
    e.preventDefault();
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    inputRef.current.files = dataTransfer.files;
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction} className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        name="photo"
        accept="image/*"
        required
        disabled={pending}
        onPaste={handlePaste}
        title="Elige un archivo, o haz clic aquí y pega (Ctrl+V) una imagen copiada"
        className="max-w-[160px] text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-accent)]/12 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 active:translate-y-0 hover:bg-[var(--color-brand-blue-accent)]/20 hover:shadow-[var(--shadow-md)] disabled:opacity-50"
      >
        {pending ? "Subiendo…" : "Subir foto"}
      </button>
      {state.error && <span className="text-xs text-[var(--color-brand-red)]">{state.error}</span>}
    </form>
  );
}
