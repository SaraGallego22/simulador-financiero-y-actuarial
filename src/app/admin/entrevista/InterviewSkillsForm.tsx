"use client";

import { submitInterviewSkillsAction } from "@/lib/adminActions";
import { INTERVIEW_SKILLS, INTERVIEW_SKILL_LABELS, INTERVIEW_SKILL_SCALE } from "@/lib/interview";
import type { InterviewSkill, InterviewSkillScore } from "@/lib/interview";

export function InterviewSkillsForm({ id, initial }: { id: string; initial: Partial<Record<InterviewSkill, InterviewSkillScore>> }) {
  const action = submitInterviewSkillsAction.bind(null, id);

  return (
    <form action={action} className="grid grid-cols-1 gap-2 rounded border border-[var(--color-brand-gray-light)] p-3 sm:grid-cols-2">
      {INTERVIEW_SKILLS.map((skill) => (
        <label key={skill} className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
          {INTERVIEW_SKILL_LABELS[skill]}
          <select
            name={`rating_${skill}`}
            defaultValue={initial[skill] ?? ""}
            className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
          >
            <option value="">Sin definir</option>
            {INTERVIEW_SKILL_SCALE.map((score) => (
              <option key={score} value={score}>
                {score}
              </option>
            ))}
          </select>
        </label>
      ))}

      <button
        type="submit"
        className="col-span-full mt-1 w-fit rounded-full bg-[var(--color-brand-blue)] shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 active:translate-y-0 hover:shadow-[var(--shadow-md)] px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
      >
        Guardar
      </button>
    </form>
  );
}
