"use client";

import { submitMemberScoresAction } from "@/lib/adminActions";

/** Subjective grading is person-level only — see toggleMemberScoresPublishedForTeamAction. */
export function ScoreForm({
  id,
  day,
  skills,
  initialValues,
}: {
  id: string;
  day: number;
  skills: { id: string; name: string }[];
  initialValues: Record<string, number | null | undefined>;
}) {
  const action = submitMemberScoresAction.bind(null, id, day);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {skills.map((skill) => (
        <label key={skill.id} className="flex flex-col gap-1 text-xs text-gray-600">
          {skill.name}
          <input
            type="number"
            step="0.1"
            min="0"
            name={skill.id}
            defaultValue={initialValues[skill.id] ?? ""}
            className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </label>
      ))}
      <button
        type="submit"
        className="rounded bg-[var(--color-brand-blue)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--color-brand-blue-dark)]"
      >
        Guardar
      </button>
    </form>
  );
}
