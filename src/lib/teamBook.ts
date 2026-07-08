import { prisma } from "./prisma";
import { toInt32View } from "./binary";
import { getTariffArray } from "./tariffAccess";
import { generateColombia } from "@/domain/generation/generateColombia";
import type { ColombiaUniverse } from "@/domain/generation/generateColombia";
import { generateYear2Claims } from "@/domain/generation/generateYear2Claims";
import type { Year2Claims } from "@/domain/generation/generateYear2Claims";
import { ANIO_BASE_A1 } from "@/domain/generation/constants";
import { computeLiabilitySchedules } from "@/domain/reserving/liability";
import type { ClaimForLiability, LiabilitySchedule } from "@/domain/reserving/liability";
import { computeDevelopment } from "@/domain/reserving/development";
import type { TeamDevelopment } from "@/domain/reserving/development";
import { getExposure } from "@/domain/generation/generateColombia";
import { segmentKeysFor, computeSegmentData } from "@/domain/grading/analytics";
import type { SegmentLossRatio } from "@/domain/grading/analytics";

const MS_PER_DAY = 86_400_000;

function epochDayToMonthIndex(epochDay: number): number {
  const date = new Date(epochDay * MS_PER_DAY);
  return (date.getFullYear() - ANIO_BASE_A1) * 12 + date.getMonth();
}

/**
 * Module-scope (NOT per-request) cache for the Colombia universe and its
 * Year-2 claims, keyed by seed. Vercel's Fluid Compute can route multiple
 * concurrent/sequential requests to the same warm instance, sharing its
 * memory — a request-scoped fix (passing universeOverride through one
 * request, or React.cache()) doesn't help when the duplication happens
 * *across* overlapping requests on the same instance. Without this, e.g.
 * the admin's day/[n] page load and a concurrent /api/simulation POST each
 * independently allocate their own ~40MB universe (+~17MB Year-2 claims),
 * and enough overlapping requests was enough to exceed the function's
 * memory ceiling even for a 3-team cohort. There's only ever one active
 * seed per cohort in practice, so a single-entry cache (evicted whenever
 * the seed changes) is sufficient — this never grows unboundedly.
 */
let cachedUniverse: { seed: number; universe: ColombiaUniverse } | null = null;
export function getUniverseForSeed(seed: number): ColombiaUniverse {
  if (cachedUniverse?.seed !== seed) {
    cachedUniverse = { seed, universe: generateColombia(seed) };
  }
  return cachedUniverse.universe;
}

let cachedYear2Claims: { seed: number; claims: Year2Claims } | null = null;
export function getYear2ClaimsForSeed(seed: number, universe: ColombiaUniverse): Year2Claims {
  if (cachedYear2Claims?.seed !== seed) {
    cachedYear2Claims = { seed, claims: generateYear2Claims(universe, seed) };
  }
  return cachedYear2Claims.claims;
}

export interface TeamBook {
  universe: ColombiaUniverse;
  /** Notice-month + severity for each team's claims, keyed by real team.id — the shape computeLiabilitySchedules() needs, minus the numeric-id remap it requires (see computeReservesForTeams). */
  claimsByTeamId: Map<string, Omit<ClaimForLiability, "teamId">[]>;
}

/**
 * Generates the cohort's active Colombia universe once, for a caller that
 * needs to pass it into *multiple* other calls this same request (e.g.
 * admin/day/[n], which calls getTeamBookForDay() for the current day *and*
 * computeFinBenchBundlesForCohort() — which itself needs Day 1's book —
 * without this each of those would regenerate its own 1,000,000-row copy).
 * Returns null if no universe has been generated for this cohort yet.
 */
export async function getActiveColombiaUniverse(cohortId: string): Promise<ColombiaUniverse | null> {
  const universeRun = await prisma.universeRun.findFirst({
    where: { cohortId, kind: "colombia", status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { seed: true },
  });
  if (!universeRun) return null;
  return getUniverseForSeed(universeRun.seed);
}

/**
 * Reconstructs each team's book of business (their claims, for reserving)
 * from a completed SimulationRun. Needed because the assignment array
 * stored on `SimulationRun.resultData` uses ephemeral numeric ids (1..N,
 * scoped to that one run) — the mapping back to real `team.id` strings is
 * stored in `SimulationRun.params.teamIdByNumericId` (see /api/simulation).
 */
/**
 * `universeOverride` lets a caller that already generated (or already has)
 * the Colombia universe this request — e.g. /api/simulation/route.ts,
 * which needs it anyway to run the market simulation itself — pass it in
 * instead of triggering another full generateColombia() call. Regenerating
 * a 1,000,000-row universe is individually "fast" (~1s, see CLAUDE.md §4.1)
 * but its several typed arrays (~40MB) add up fast when multiple call
 * sites each regenerate their own copy within the same request; a
 * production OOM on the Día 2 simulation trigger (three separate
 * regenerations in one request, once here, once in
 * getYear2ClaimsByTeamId(), once in the route itself) is exactly what this
 * parameter exists to prevent.
 */
export async function getTeamBookForDay(cohortId: string, day: number, universeOverride?: ColombiaUniverse): Promise<TeamBook | null> {
  const run = await prisma.simulationRun.findFirst({
    where: { cohortId, day, status: "DONE" },
    orderBy: { createdAt: "desc" },
  });
  if (!run) return null;

  let universe = universeOverride;
  if (!universe) {
    const universeRun = await prisma.universeRun.findFirst({
      where: { cohortId, kind: "colombia", status: "DONE" },
      orderBy: { createdAt: "desc" },
      select: { seed: true },
    });
    if (!universeRun) return null;
    // Regenerated from the seed, not fetched as a stored blob — see CLAUDE.md §4.1.
    universe = getUniverseForSeed(universeRun.seed);
  }

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

/**
 * Reconstructs a prior day's assignment array, remapped into a *new* run's
 * numeric-id space (each SimulationRun mints its own ephemeral 1..N ids from
 * whichever teams were eligible that day — the two runs' numbering won't
 * generally line up). Needed for the Year-2 retention bonus, which checks
 * "is this exposure's Year-1 team still an option in Year 2". Returns -1 for
 * an exposure whose previous team isn't part of the current run at all.
 */
export async function getPreviousAssignmentNumeric(
  cohortId: string,
  previousDay: number,
  numericIdByTeamId: Map<string, number>,
  n: number
): Promise<Int32Array | null> {
  const run = await prisma.simulationRun.findFirst({
    where: { cohortId, day: previousDay, status: "DONE" },
    orderBy: { createdAt: "desc" },
  });
  if (!run) return null;

  const result = new Int32Array(n).fill(-1);
  const params = run.params as { teamIdByNumericId?: Record<string, string> } | null;

  if (run.resultData && params?.teamIdByNumericId) {
    const prevAssignment = toInt32View(run.resultData, n);
    const prevTeamIdByNumericId = params.teamIdByNumericId;
    for (let k = 0; k < n; k++) {
      const realTeamId = prevTeamIdByNumericId[prevAssignment[k]];
      result[k] = realTeamId ? (numericIdByTeamId.get(realTeamId) ?? -1) : -1;
    }
  } else {
    // Monopoly case: the whole universe belonged to a single team.
    const teamResults = await prisma.teamSimResult.findMany({ where: { simulationRunId: run.id } });
    if (teamResults.length !== 1) return null;
    const numericId = numericIdByTeamId.get(teamResults[0].teamId) ?? -1;
    result.fill(numericId);
  }

  return result;
}

/**
 * Same idea as getTeamBookForDay(), but for Year-2 claims (day=2's
 * SimulationRun + a freshly-generated Year2Claims, not the universe's own
 * Year-1 fields) — needed to feed computeDevelopment() a real Year1->Year2
 * runoff instead of the simplified ratio fallback finBench() uses when no
 * development schedule is supplied.
 *
 * `universeOverride`/`year2ClaimsOverride` avoid a redundant regeneration
 * when the caller already has them this request — see getTeamBookForDay()'s
 * doc comment; this was the other half of a production OOM on the Día 2
 * simulation trigger.
 */
export async function getYear2ClaimsByTeamId(
  cohortId: string,
  universeOverride?: ColombiaUniverse,
  year2ClaimsOverride?: Year2Claims
): Promise<Map<string, Omit<ClaimForLiability, "teamId">[]> | null> {
  const run = await prisma.simulationRun.findFirst({
    where: { cohortId, day: 2, status: "DONE" },
    orderBy: { createdAt: "desc" },
  });
  if (!run) return null;

  let universe = universeOverride;
  let year2Claims = year2ClaimsOverride;
  if (!universe || !year2Claims) {
    const universeRun = await prisma.universeRun.findFirst({
      where: { cohortId, kind: "colombia", status: "DONE" },
      orderBy: { createdAt: "desc" },
      select: { seed: true },
    });
    if (!universeRun) return null;
    universe = universe ?? getUniverseForSeed(universeRun.seed);
    year2Claims = year2Claims ?? getYear2ClaimsForSeed(universeRun.seed, universe);
  }

  const claimsByTeamId = new Map<string, Omit<ClaimForLiability, "teamId">[]>();
  const addClaim = (teamId: string, k: number) => {
    if (!year2Claims.siniestro[k] || year2Claims.fechaAvisoEpochDay[k] < 0) return;
    if (!claimsByTeamId.has(teamId)) claimsByTeamId.set(teamId, []);
    claimsByTeamId.get(teamId)!.push({
      noticeMonth: epochDayToMonthIndex(year2Claims.fechaAvisoEpochDay[k]),
      severity: year2Claims.sev[k],
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
    const teamResults = await prisma.teamSimResult.findMany({ where: { simulationRunId: run.id } });
    if (teamResults.length !== 1) return null;
    const teamId = teamResults[0].teamId;
    for (let k = 0; k < universe.n; k++) addClaim(teamId, k);
  }

  return claimsByTeamId;
}

/**
 * Runs computeDevelopment() (calendar-year Year1->Year2 runoff) per team,
 * handling the same string-id <-> numeric-id remap as computeReservesForTeams.
 * Only teams present in *both* maps get a development schedule — a team with
 * no Year-2 business has nothing to develop.
 */
export function computeDevelopmentForTeams(
  year1ClaimsByTeamId: Map<string, Omit<ClaimForLiability, "teamId">[]>,
  year2ClaimsByTeamId: Map<string, Omit<ClaimForLiability, "teamId">[]>
): Map<string, TeamDevelopment> {
  const teamIds = [...new Set([...year1ClaimsByTeamId.keys(), ...year2ClaimsByTeamId.keys()])];
  const numericIdByTeamId = new Map(teamIds.map((id, i) => [id, i + 1]));

  const year1Claims = [];
  for (const [teamId, claims] of year1ClaimsByTeamId) {
    const numericId = numericIdByTeamId.get(teamId)!;
    for (const c of claims) year1Claims.push({ teamId: numericId, noticeMonth: c.noticeMonth, ultimate: c.severity });
  }
  const year2Claims = [];
  for (const [teamId, claims] of year2ClaimsByTeamId) {
    const numericId = numericIdByTeamId.get(teamId)!;
    for (const c of claims) year2Claims.push({ teamId: numericId, noticeMonth: c.noticeMonth, ultimate: c.severity });
  }

  const { byTeam } = computeDevelopment(year1Claims, year2Claims, [...numericIdByTeamId.values()]);
  const byTeamId = new Map<string, TeamDevelopment>();
  for (const [teamId, numericId] of numericIdByTeamId) {
    const dev = byTeam.get(numericId);
    if (dev) byTeamId.set(teamId, dev);
  }
  return byTeamId;
}

/**
 * Per-team, per-segment premium/claims (for scoreAnalitica, Día 4). Uses
 * Year 2's book if it's done (the latest completed experience the
 * recommendation should be judged against), falling back to Year 1's.
 * Needs each involved team's *real* per-policy tariff (not just its mean
 * premium) since a risk-differentiated tariff prices segments unevenly —
 * using a flat mean would distort exactly the loss ratios this is grading.
 */
export async function getSegmentDataForTeams(
  cohortId: string
): Promise<Map<string, Record<string, SegmentLossRatio>> | null> {
  const day2Run = await prisma.simulationRun.findFirst({ where: { cohortId, day: 2, status: "DONE" } });
  const day = day2Run ? 2 : 1;

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
  const universe = getUniverseForSeed(universeRun.seed);
  const claims = day === 2 ? getYear2ClaimsForSeed(universeRun.seed, universe) : universe;

  const params = run.params as { teamIdByNumericId?: Record<string, string> } | null;
  let assignment: Int32Array;
  let teamIds: string[];
  if (run.resultData && params?.teamIdByNumericId) {
    assignment = toInt32View(run.resultData, universe.n);
    teamIds = Object.values(params.teamIdByNumericId);
  } else {
    const teamResults = await prisma.teamSimResult.findMany({ where: { simulationRunId: run.id } });
    if (teamResults.length !== 1) return null;
    assignment = new Int32Array(universe.n).fill(1);
    teamIds = [teamResults[0].teamId];
  }

  const tariffSubmissions = await prisma.tariffSubmission.findMany({
    where: { teamId: { in: teamIds }, day },
  });
  const tariffByTeamId = new Map(
    tariffSubmissions
      .filter((t) => t.meanPremium != null)
      .map((t) => [t.teamId, { tariff: getTariffArray(t, universe), meanPremium: t.meanPremium! }])
  );

  const teamIdByNumericId = new Map<number, string>();
  if (run.resultData && params?.teamIdByNumericId) {
    for (const [numericId, teamId] of Object.entries(params.teamIdByNumericId)) {
      teamIdByNumericId.set(Number(numericId), teamId);
    }
  } else {
    teamIdByNumericId.set(1, teamIds[0]);
  }

  const rowsByTeamId = new Map<string, { premium: number; hasClaim: boolean; claimAmount: number; segmentKeys: string[] }[]>();
  for (let k = 0; k < universe.n; k++) {
    const teamId = teamIdByNumericId.get(assignment[k]);
    if (!teamId) continue;
    const tariffInfo = tariffByTeamId.get(teamId);
    if (!tariffInfo) continue;
    const premium = tariffInfo.tariff[k] || tariffInfo.meanPremium;
    const exposure = getExposure(universe, k);
    if (!rowsByTeamId.has(teamId)) rowsByTeamId.set(teamId, []);
    rowsByTeamId.get(teamId)!.push({
      premium,
      hasClaim: !!claims.siniestro[k],
      claimAmount: claims.sev[k],
      segmentKeys: segmentKeysFor(exposure),
    });
  }

  const result = new Map<string, Record<string, SegmentLossRatio>>();
  for (const [teamId, rows] of rowsByTeamId) {
    result.set(teamId, computeSegmentData(rows));
  }
  return result;
}
