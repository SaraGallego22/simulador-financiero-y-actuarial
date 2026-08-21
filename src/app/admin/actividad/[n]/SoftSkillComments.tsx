"use client";

import { addSoftSkillCommentAction, deleteSoftSkillCommentAction, updateSoftSkillCommentAction } from "@/lib/adminActions";
import { SOFT_SKILL_COMMENT_AUTHOR } from "@/lib/softSkills";
import { EditableComment } from "@/components/ui/editable-comment";

export interface SoftSkillCommentItem {
  id: string;
  text: string;
  createdAt: string | Date;
}

const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Same shape as MemberComments, but the author is always "Equipo TH" — no author field in the form. */
export function SoftSkillComments({ teamMemberId, activity, comments }: { teamMemberId: string; activity: number; comments: SoftSkillCommentItem[] }) {
  const addAction = addSoftSkillCommentAction.bind(null, teamMemberId, activity);

  return (
    <div className="flex flex-col gap-2 rounded border border-[var(--color-brand-gray-light)] p-3">
      {comments.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {comments.map((c) => (
            <EditableComment
              key={c.id}
              text={c.text}
              meta={`— ${SOFT_SKILL_COMMENT_AUTHOR}, ${fmtDate(c.createdAt)}`}
              editAction={updateSoftSkillCommentAction.bind(null, c.id, activity)}
              deleteAction={deleteSoftSkillCommentAction.bind(null, c.id, activity)}
            />
          ))}
        </div>
      )}

      <form action={addAction} className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
          Nuevo comentario ({SOFT_SKILL_COMMENT_AUTHOR})
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
