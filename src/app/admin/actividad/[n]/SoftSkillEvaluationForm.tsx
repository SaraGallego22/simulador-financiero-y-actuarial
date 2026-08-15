"use client";

import { submitSoftSkillEvaluationAction } from "@/lib/adminActions";
import { SOFT_SKILL_COMPETENCIES, SOFT_SKILL_RATINGS, COMPETENCY_LABELS, RATING_LABELS } from "@/lib/softSkills";
import type { SoftSkillCompetency, SoftSkillRating } from "@/lib/softSkills";

export function SoftSkillEvaluationForm({
  id,
  activity,
  initial,
}: {
  id: string;
  activity: number;
  initial: Partial<Record<SoftSkillCompetency, SoftSkillRating>>;
}) {
  const action = submitSoftSkillEvaluationAction.bind(null, id, activity);

  return (
    <form
      action={action}
      className="grid grid-cols-1 gap-2 rounded border border-[var(--color-brand-gray-light)] p-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {SOFT_SKILL_COMPETENCIES.map((competency) => (
        <label key={competency} className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
          {COMPETENCY_LABELS[competency]}
          <select
            name={`rating_${competency}`}
            defaultValue={initial[competency] ?? ""}
            className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
          >
            <option value="">Sin definir</option>
            {SOFT_SKILL_RATINGS.map((rating) => (
              <option key={rating} value={rating}>
                {RATING_LABELS[rating]}
              </option>
            ))}
          </select>
        </label>
      ))}

      <button
        type="submit"
        className="col-span-full mt-1 w-fit rounded-full bg-[image:var(--gradient-brand-primary)] shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 active:translate-y-0 hover:shadow-[var(--shadow-md)] px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
      >
        Guardar
      </button>
    </form>
  );
}
