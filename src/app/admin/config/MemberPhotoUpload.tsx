"use client";

import { useActionState } from "react";
import { uploadMemberPhotoAction, type UploadMemberPhotoState } from "@/lib/adminActions";

export function MemberPhotoUpload({ teamMemberId }: { teamMemberId: string }) {
  const action = uploadMemberPhotoAction.bind(null, teamMemberId);
  const [state, formAction, pending] = useActionState<UploadMemberPhotoState, FormData>(action, {});

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="file" name="photo" accept="image/*" required disabled={pending} className="max-w-[160px] text-xs" />
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
