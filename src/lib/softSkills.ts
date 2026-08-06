/**
 * Habilidades blandas: 3 activities run parallel to the técnica challenge
 * (see AdminNav), grading each team member on the same 8 fixed competencies.
 * Internal to admin/TH only — no `published` flag, no team-facing route.
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
