/**
 * One-on-one TH interview: a separate checkpoint from the técnica día grading
 * and from habilidades blandas (see softSkills.ts) — internal to admin/TH
 * only, no team-facing route.
 */

export const INTERVIEW_SKILLS = ["EXCEL", "PROGRAMACION"] as const;
export type InterviewSkill = (typeof INTERVIEW_SKILLS)[number];

export const INTERVIEW_SKILL_LABELS: Record<InterviewSkill, string> = {
  EXCEL: "Excel",
  PROGRAMACION: "Programación",
};

/** Every InterviewComment is authored by this fixed name — never stored per-row, just rendered. */
export const INTERVIEW_COMMENT_AUTHOR = "Equipo TH";
