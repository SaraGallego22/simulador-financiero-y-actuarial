"use client";

import { addInterviewCommentAction, deleteInterviewCommentAction } from "@/lib/adminActions";
import { INTERVIEW_COMMENT_AUTHOR } from "@/lib/interview";
import { DeleteCommentForm } from "@/components/ui/confirm-modal";

export interface InterviewCommentItem {
  id: string;
  text: string;
  createdAt: string | Date;
}

const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Same shape as SoftSkillComments, but for the TH interview — author is always "Equipo TH". */
export function InterviewComments({ teamMemberId, comments }: { teamMemberId: string; comments: InterviewCommentItem[] }) {
  const addAction = addInterviewCommentAction.bind(null, teamMemberId);

  return (
    <div className="flex flex-col gap-2 rounded border border-[var(--color-brand-gray-light)] p-3">
      {comments.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-2 rounded bg-[var(--color-brand-blue-light)] px-2 py-1.5 text-sm">
              <p className="text-[var(--color-foreground)]">
                {c.text}
                <span className="ml-1 text-xs text-[var(--color-brand-text-secondary)]">
                  — {INTERVIEW_COMMENT_AUTHOR}, {fmtDate(c.createdAt)}
                </span>
              </p>
              <DeleteCommentForm action={deleteInterviewCommentAction.bind(null, c.id)} />
            </div>
          ))}
        </div>
      )}

      <form action={addAction} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
          Nuevo comentario ({INTERVIEW_COMMENT_AUTHOR})
          <textarea name="text" rows={2} className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm" />
        </label>
        <button
          type="submit"
          className="self-start rounded-full px-3 py-1.5 text-xs font-medium text-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-accent)]/12 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 active:translate-y-0 hover:bg-[var(--color-brand-blue-accent)]/20 hover:shadow-[var(--shadow-md)]"
        >
          Agregar
        </button>
      </form>
    </div>
  );
}
