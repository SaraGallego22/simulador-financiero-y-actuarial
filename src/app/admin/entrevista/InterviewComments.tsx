"use client";

import { addInterviewCommentAction, deleteInterviewCommentAction, updateInterviewCommentAction } from "@/lib/adminActions";
import { INTERVIEW_COMMENT_AUTHOR } from "@/lib/interview";
import { EditableComment } from "@/components/ui/editable-comment";
import { AddCommentForm } from "@/components/ui/add-comment-form";

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
            <EditableComment
              key={c.id}
              text={c.text}
              meta={`— ${INTERVIEW_COMMENT_AUTHOR}, ${fmtDate(c.createdAt)}`}
              editAction={updateInterviewCommentAction.bind(null, c.id)}
              deleteAction={deleteInterviewCommentAction.bind(null, c.id)}
            />
          ))}
        </div>
      )}

      <AddCommentForm action={addAction} label={`Nuevo comentario (${INTERVIEW_COMMENT_AUTHOR})`} />
    </div>
  );
}
