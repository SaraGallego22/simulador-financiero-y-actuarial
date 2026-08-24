import { cookies } from "next/headers";
import { prisma } from "./prisma";

/**
 * Fetches the active cohort, creating a default one on first use. Only
 * relevant when zero cohorts exist yet (first-ever deploy) — with two or
 * more cohorts live at once, use getSelectedCohort/getCohortForSession
 * instead, which is what every page actually calls.
 */
export async function getOrCreateActiveCohort() {
  const existing = await prisma.cohort.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
  if (existing) return existing;

  const year = new Date().getFullYear();
  return prisma.cohort.create({ data: { name: `Cohorte ${year}`, loginSlug: String(year), active: true } });
}

export async function getAllCohorts() {
  return prisma.cohort.findMany({ orderBy: { createdAt: "asc" } });
}

/** Cookie the admin cohort switcher writes to (see setSelectedCohortAction in adminActions.ts). */
export const SELECTED_COHORT_COOKIE = "adminCohortId";

/**
 * The cohort an ADMIN/ADMIN_TH session is currently viewing — whichever
 * cohort's id is in the switcher cookie, falling back to getOrCreateActiveCohort
 * when unset or stale (e.g. the cohort it pointed to was deleted).
 */
export async function getSelectedCohort() {
  const cookieStore = await cookies();
  const selectedId = cookieStore.get(SELECTED_COHORT_COOKIE)?.value;
  if (selectedId) {
    const cohort = await prisma.cohort.findUnique({ where: { id: selectedId } });
    if (cohort) return cohort;
  }
  return getOrCreateActiveCohort();
}

/** A team's own cohort — the only cohort a TEAM session may ever be scoped to. */
export async function getCohortForTeamId(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, include: { cohort: true } });
  return team?.cohort ?? null;
}

/**
 * The cohort a page should scope its queries to, for either kind of session:
 * a TEAM session is always scoped to its own team's cohort (never the admin
 * switcher's selection — a team must never see another cohort's data just
 * because an admin elsewhere flipped the switcher); an ADMIN/ADMIN_TH
 * session gets whichever cohort the switcher currently points to.
 */
export async function getCohortForSession(session: { user: { role: string; teamId: string | null } }) {
  if (session.user.role === "TEAM" && session.user.teamId) {
    const cohort = await getCohortForTeamId(session.user.teamId);
    if (cohort) return cohort;
  }
  return getSelectedCohort();
}
