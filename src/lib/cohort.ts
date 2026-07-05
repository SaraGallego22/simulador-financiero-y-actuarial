import { prisma } from "./prisma";

/**
 * Fetches the active cohort, creating a default one on first use. Keeps
 * cohort management out of the MVP admin UI for now — every model that's
 * global-per-run (universe, rubric) still carries a real cohortId per
 * CLAUDE.md §7, so a future "start a new cohort" feature is additive, not a
 * schema change.
 */
export async function getOrCreateActiveCohort() {
  const existing = await prisma.cohort.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
  if (existing) return existing;

  const year = new Date().getFullYear();
  return prisma.cohort.create({ data: { name: `Cohorte ${year}`, active: true } });
}
