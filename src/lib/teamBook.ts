import { prisma } from "./prisma";
import { toInt32View } from "./binary";
import { generateColombia } from "@/domain/generation/generateColombia";
import type { ColombiaUniverse } from "@/domain/generation/generateColombia";
import { ANIO_BASE_A1 } from "@/domain/generation/constants";
import { computeLiabilitySchedules } from "@/domain/reserving/liability";
import type { ClaimForLiability, LiabilitySchedule } from "@/domain/reserving/liability";

const MS_PER_DAY = 86_400_000;

function epochDayToMonthIndex(epochDay: number): number {
  const date = new Date(epochDay * MS_PER_DAY);
  return (date.getFullYear() - ANIO_BASE_A1) * 12 + date.getMonth();
}

export interface TeamBook {
  universe: ColombiaUniverse;
  /** Notice-month + severity for each team's claims, keyed by real team.id — the shape computeLiabilitySchedules() needs, minus the numeric-id remap it requires (see computeReservesForTeams). */
  claimsByTeamId: Map<string, Omit<ClaimForLiability, "teamId">[]>;
}

/**
 * Reconstructs each team's book of business (their claims, for reserving)
 * from a completed SimulationRun. Needed because the assignment array
 * stored on `SimulationRun.resultData` uses ephemeral numeric ids (1..N,
 * scoped to that one run) — the mapping back to real `team.id` strings is
 * stored in `SimulationRun.params.teamIdByNumericId` (see /api/simulation).
 */
export async function getTeamBookForDay(cohortId: string, day: number): Promise<TeamBook | null> {
  const run = await prisma.simulationRun.findFirst({
    where: { cohortId, day, status: "DONE" },
    orderBy: { createdAt: "desc" },
  });
  if (!run) return null;

  const universeRun = await prisma.universeRun.findFirst({
    where: { cohortId, kind: "colombia", status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { seed: true },
  });
  if (!universeRun) return null;
  // Regenerated from the seed, not fetched as a stored blob — see CLAUDE.md §4.1.
  const universe = generateColombia(universeRun.seed);

  const claimsByTeamId = new Map<string, Omit<ClaimForLiability, "teamId">[]>();
  const addClaim = (teamId: string, exposureIndex: number) => {
    if (!universe.siniestro[exposureIndex] || universe.fechaAvisoEpochDay[exposureIndex] < 0) return;
    if (!claimsByTeamId.has(teamId)) claimsByTeamId.set(teamId, []);
    claimsByTeamId.get(teamId)!.push({
      noticeMonth: epochDayToMonthIndex(universe.fechaAvisoEpochDay[exposureIndex]),
      severity: universe.sev[exposureIndex],
    });
  };

  const params = run.params as { teamIdByNumericId?: Record<string, string> } | null;

  if (run.resultData && params?.teamIdByNumericId) {
    const assignment = toInt32View(run.resultData, universe.n);
    const teamIdByNumericId = params.teamIdByNumericId;
    for (let k = 0; k < universe.n; k++) {
      const teamId = teamIdByNumericId[assignment[k]];
      if (teamId) addClaim(teamId, k);
    }
  } else {
    // Monopoly case (see /api/simulation): a single team was assigned the
    // whole universe and resultData wasn't stored (nothing to disambiguate).
    const teamResults = await prisma.teamSimResult.findMany({ where: { simulationRunId: run.id } });
    if (teamResults.length !== 1) return null;
    const teamId = teamResults[0].teamId;
    for (let k = 0; k < universe.n; k++) addClaim(teamId, k);
  }

  return { universe, claimsByTeamId };
}

/**
 * Runs computeLiabilitySchedules() per team, handling the string-id <->
 * numeric-id remap the domain function expects (see CLAUDE.md's domain
 * glossary — src/domain modules take plain typed data, not app-specific id
 * types).
 */
export function computeReservesForTeams(
  claimsByTeamId: Map<string, Omit<ClaimForLiability, "teamId">[]>
): Map<string, LiabilitySchedule> {
  const teamIds = [...claimsByTeamId.keys()];
  const numericIdByTeamId = new Map(teamIds.map((id, i) => [id, i + 1]));

  const allClaims: ClaimForLiability[] = [];
  for (const [teamId, claims] of claimsByTeamId) {
    const numericId = numericIdByTeamId.get(teamId)!;
    for (const c of claims) allClaims.push({ ...c, teamId: numericId });
  }

  const schedules = computeLiabilitySchedules(allClaims, [...numericIdByTeamId.values()]);
  const schedulesByTeamId = new Map<string, LiabilitySchedule>();
  for (const [teamId, numericId] of numericIdByTeamId) {
    schedulesByTeamId.set(teamId, schedules.get(numericId)!);
  }
  return schedulesByTeamId;
}
