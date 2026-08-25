"use client";

import { addSoftSkillCommentAction, deleteSoftSkillCommentAction, updateSoftSkillCommentAction } from "@/lib/adminActions";
import { SOFT_SKILL_COMMENT_AUTHOR } from "@/lib/softSkills";
import { EditableComment } from "@/components/ui/editable-comment";
import { AddCommentForm } from "@/components/ui/add-comment-form";

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

      <AddCommentForm action={addAction} label={`Nuevo comentario (${SOFT_SKILL_COMMENT_AUTHOR})`} />
    </div>
  );
}
