import { getCohortForTeamId } from "./cohort";

/**
 * True once a later day has been made visible (Cohort.openDay > day) — from
 * then on, day `day`'s own submissions (tariffs, portfolio, deliverables,
 * analytics) are frozen so a team can't revise an earlier day's answers
 * after seeing how it played out on a following day's page.
 */
export async function isDayLocked(teamId: string, day: number): Promise<boolean> {
  const cohort = await getCohortForTeamId(teamId);
  return cohort != null && cohort.openDay > day;
}

export const DAY_LOCKED_ERROR = "Este día ya está bloqueado — el evaluador habilitó un día posterior y las respuestas ya no se pueden modificar.";
