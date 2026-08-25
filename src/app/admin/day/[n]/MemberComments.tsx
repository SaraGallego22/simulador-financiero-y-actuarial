"use client";

import { addMemberCommentAction, deleteMemberCommentAction, updateMemberCommentAction } from "@/lib/adminActions";
import { EditableComment } from "@/components/ui/editable-comment";
import { AddCommentForm } from "@/components/ui/add-comment-form";

export interface MemberCommentItem {
  id: string;
  author: string;
  text: string;
  createdAt: string | Date;
}

const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Any number of dated, authored remarks per member/day — see MemberComment's doc comment. */
export function MemberComments({ teamMemberId, day, comments }: { teamMemberId: string; day: number; comments: MemberCommentItem[] }) {
  const addAction = addMemberCommentAction.bind(null, teamMemberId, day);

  return (
    <div className="flex flex-col gap-2 rounded border border-[var(--color-brand-gray-light)] p-3">
      {comments.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {comments.map((c) => (
            <EditableComment
              key={c.id}
              text={c.text}
              meta={`— ${c.author}, ${fmtDate(c.createdAt)}`}
              editAction={updateMemberCommentAction.bind(null, c.id, day)}
              deleteAction={deleteMemberCommentAction.bind(null, c.id, day)}
            />
          ))}
        </div>
      )}

      <AddCommentForm action={addAction} label="Nuevo comentario">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
          Autor
          <input type="text" name="author" className="w-full rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm sm:w-36" />
        </label>
      </AddCommentForm>
    </div>
  );
}
