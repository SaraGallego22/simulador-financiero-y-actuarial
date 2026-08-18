/**
 * Habilidades blandas: 3 activities run parallel to the técnica challenge
 * (see AdminNav), grading each team member on the same 8 fixed competencies.
 * Internal to admin/TH only, no team-facing route.
 */

export const SOFT_SKILL_COMPETENCIES = [
  "TRABAJO_EQUIPO",
  "TRABAJO_PRESION",
  "ORIENTACION_LOGRO",
  "TOLERANCIA_FRUSTRACION",
  "COMUNICACION",
  "CREATIVIDAD",
  "LIDERAZGO",
  "PROACTIVIDAD",
] as const;
export type SoftSkillCompetency = (typeof SOFT_SKILL_COMPETENCIES)[number];

export const COMPETENCY_LABELS: Record<SoftSkillCompetency, string> = {
  TRABAJO_EQUIPO: "Trabajo en equipo",
  TRABAJO_PRESION: "Trabajo bajo presión",
  ORIENTACION_LOGRO: "Orientación al logro",
  TOLERANCIA_FRUSTRACION: "Tolerancia a la frustración",
  COMUNICACION: "Comunicación",
  CREATIVIDAD: "Creatividad",
  LIDERAZGO: "Liderazgo",
  PROACTIVIDAD: "Proactividad",
};

export const SOFT_SKILL_RATINGS = ["EXCELENTE", "BUENO", "REGULAR", "NO_EVIDENCIA"] as const;
export type SoftSkillRating = (typeof SOFT_SKILL_RATINGS)[number];

export const RATING_LABELS: Record<SoftSkillRating, string> = {
  EXCELENTE: "Excelente",
  BUENO: "Bueno",
  REGULAR: "Regular",
  NO_EVIDENCIA: "No se evidencia la competencia",
};

/** Ordinal 1-4 conversion of the qualitative scale, for the consolidado's per-competency nota (averaged across the 3 activities). */
export const RATING_SCORES: Record<SoftSkillRating, number> = {
  NO_EVIDENCIA: 1,
  REGULAR: 2,
  BUENO: 3,
  EXCELENTE: 4,
};

export const SOFT_SKILL_ACTIVITIES = [1, 2, 3] as const;

export const ACTIVITY_TITLES: Record<number, string> = {
  1: "Actividad 1",
  2: "Actividad 2",
  3: "Actividad 3",
};

/** Every SoftSkillComment is authored by this fixed name — never stored per-row, just rendered. */
export const SOFT_SKILL_COMMENT_AUTHOR = "Equipo TH";

export function isValidSoftSkillActivity(activity: number): boolean {
  return Number.isInteger(activity) && activity >= 1 && activity <= 3;
}

export interface SoftSkillEvalRow {
  teamMemberId: string;
  competency: string;
  rating: string;
}

/**
 * Averages each member's ordinal rating (RATING_SCORES) per competency
 * across however many of the 3 activities rated it — shared by the member
 * consolidado (consolidado.ts) and the per-team subjective grading view
 * (admin/day/[n]/page.tsx's radar chart), so both read the same numbers.
 */
export function averageSoftSkillsByMember(evals: SoftSkillEvalRow[]): Map<string, Partial<Record<SoftSkillCompetency, number>>> {
  const rawScores = new Map<string, Partial<Record<SoftSkillCompetency, number[]>>>();
  for (const e of evals) {
    if (!rawScores.has(e.teamMemberId)) rawScores.set(e.teamMemberId, {});
    const byCompetency = rawScores.get(e.teamMemberId)!;
    const competency = e.competency as SoftSkillCompetency;
    (byCompetency[competency] ??= []).push(RATING_SCORES[e.rating as SoftSkillRating]);
  }

  const result = new Map<string, Partial<Record<SoftSkillCompetency, number>>>();
  for (const [teamMemberId, byCompetency] of rawScores) {
    const averages: Partial<Record<SoftSkillCompetency, number>> = {};
    for (const competency of SOFT_SKILL_COMPETENCIES) {
      const scores = byCompetency[competency];
      if (scores && scores.length > 0) averages[competency] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }
    result.set(teamMemberId, averages);
  }
  return result;
}
