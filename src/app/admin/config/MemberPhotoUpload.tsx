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
        className="shrink-0 rounded border border-[var(--color-brand-blue-accent)] px-2 py-1 text-xs font-medium text-[var(--color-brand-blue-accent)] transition-colors hover:bg-[var(--color-brand-blue-light)] disabled:opacity-50"
      >
        {pending ? "Subiendo…" : "Subir foto"}
      </button>
      {state.error && <span className="text-xs text-[var(--color-brand-red)]">{state.error}</span>}
    </form>
  );
}
