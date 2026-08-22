import { prisma } from "./prisma";
import { toInt32View } from "./binary";
import { generateColombia } from "@/domain/generation/generateColombia";
import type { ColombiaUniverse } from "@/domain/generation/generateColombia";
import { generateYear2Claims } from "@/domain/generation/generateYear2Claims";
import type { Year2Claims } from "@/domain/generation/generateYear2Claims";
import { generateChile } from "@/domain/generation/generateChile";
import type { ChilePolicy } from "@/domain/generation/generateChile";
import { ANIO_BASE_A1 } from "@/domain/generation/constants";
import { computeLiabilitySchedules } from "@/domain/reserving/liability";
import type { ClaimForLiability, LiabilitySchedule } from "@/domain/reserving/liability";
import { computeDevelopment } from "@/domain/reserving/development";
import type { TeamDevelopment } from "@/domain/reserving/development";
import { computeSectorStats } from "@/domain/grading/sectors";
import type { SectorStat } from "@/domain/grading/sectors";

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

/**
 * The Día 4 sector exercise's one true answer — universe-wide, never
 * per-team (see sectors.ts's doc comment on why a team's own book is a
 * biased sample, not a fair ground truth). Same module-scope-cache-by-seed
 * pattern as getUniverseForSeed/getYear2ClaimsForSeed above, for the same
 * reason: cheap to recompute (~1s at n=1,000,000) but no reason to pay that
 * cost more than once per seed within a warm instance.
 */
let cachedSectorStats: { seed: number; stats: SectorStat[] } | null = null;
export function getSectorStatsForSeed(seed: number, universe: ColombiaUniverse): SectorStat[] {
  if (cachedSectorStats?.seed !== seed) {
    cachedSectorStats = { seed, stats: computeSectorStats(universe) };
  }
  return cachedSectorStats.stats;
}

let cachedChile: { seed: number; policies: ChilePolicy[] } | null = null;
export function getChileForSeed(seed: number): ChilePolicy[] {
  if (cachedChile?.seed !== seed) {
    cachedChile = { seed, policies: generateChile(seed) };
  }
  return cachedChile.policies;
}

/**
 * Module-scope cache (same rationale as getUniverseForSeed above) for a
 * SimulationRun's 1,000,000-entry assignment array.
 *
 * This is the single most expensive read in the app: `resultData` is exactly
 * 4,000,000 bytes, and at the per-byte throughput ceiling this database has
 * measured at (CLAUDE.md §4.1) fetching it costs ~12 seconds. A single admin
 * page load needs it up to three times — getTeamBookForDay() for Año 1,
 * getYear2ClaimsByTeamId() for Año 2, and the day page's own book for Día 2
 * — which is most of why navigating between pages took double-digit seconds.
 * Re-measure before assuming a faster Neon plan removes the need for this:
 * the cache also skips the O(n) work, not just the transfer.
 *
 * Keyed by run id, which is safe to cache indefinitely: re-simulating a day
 * writes a NEW SimulationRun row rather than mutating this one, so an entry
 * can never go stale. Bounded to a handful of runs (a cohort only ever has a
 * few) so a long-lived warm instance can't grow this without limit.
 */
const MAX_CACHED_ASSIGNMENTS = 4;
const assignmentByRunId = new Map<string, Int32Array>();
async function getAssignmentForRun(runId: string, n: number): Promise<Int32Array | null> {
  const cached = assignmentByRunId.get(runId);
  if (cached) return cached;
  const row = await prisma.simulationRun.findUnique({ where: { id: runId }, select: { resultData: true } });
  if (!row?.resultData) return null;
  const assignment = toInt32View(row.resultData, n);
  if (assignmentByRunId.size >= MAX_CACHED_ASSIGNMENTS) assignmentByRunId.clear();
  assignmentByRunId.set(runId, assignment);
  return assignment;
}

/**
 * One notice month's claims for one team, collapsed to the only two figures
 * anything downstream reads (see the TeamClaimAggregate model's doc comment):
 * the summed severity, and how many claims that sum covers.
 *
 * Structurally a superset of `Omit<ClaimForLiability, "teamId">`, so a list of
 * these is accepted anywhere a list of individual claims was — an individual
 * claim is just an aggregate of one. That's deliberate: computeReservesForTeams
 * needed no change, and its tests still exercise it with claim-level data.
 */
export interface ClaimMonthAggregate {
  noticeMonth: number;
  /** Sum of severity across the claims noticed that month, excluding non-positive ones (which both domain consumers skip anyway). */
  severity: number;
  /** How many claims `severity` covers — only computeDevelopment's claimCountY2 needs this. */
  count: number;
}

export interface TeamBook {
  universe: ColombiaUniverse;
  /** Per-notice-month claim totals for each team, keyed by real team.id — the shape computeLiabilitySchedules() needs, minus the numeric-id remap it requires (see computeReservesForTeams). */
  claimsByTeamId: Map<string, ClaimMonthAggregate[]>;
}

/** The per-policy claim fields an aggregation reads — `universe` itself for Year 1, `generateYear2Claims`' output for Year 2. */
interface ClaimSource {
  siniestro: Uint8Array;
  sev: Float32Array;
  fechaAvisoEpochDay: Int32Array;
}

/**
 * Collapses a run's per-policy assignment into per-team, per-notice-month
 * totals — the single definition of that reduction, shared by the writer
 * (/api/simulation, which persists the result as TeamClaimAggregate rows) and
 * by the fallback path below that recomputes it for runs predating that
 * table. Keeping one implementation is the point: if the two drifted, old and
 * new runs would grade differently.
 *
 * `teamIdForIndex` returns null for an unassigned exposure. A month entry is
 * created for every claim that was *noticed* (matching what the pre-aggregate
 * code put in its claim list), but only positive severities contribute to the
 * sum/count — exactly what computeLiabilitySchedules and computeDevelopment
 * each skip internally, so the reduction is arithmetically identical.
 */
export function aggregateClaimsByTeamMonth(
  source: ClaimSource,
  n: number,
  teamIdForIndex: (index: number) => string | null
): Map<string, ClaimMonthAggregate[]> {
  const byTeamMonth = new Map<string, Map<number, ClaimMonthAggregate>>();
  for (let k = 0; k < n; k++) {
    if (!source.siniestro[k] || source.fechaAvisoEpochDay[k] < 0) continue;
    const teamId = teamIdForIndex(k);
    if (!teamId) continue;
    let byMonth = byTeamMonth.get(teamId);
    if (!byMonth) {
      byMonth = new Map();
      byTeamMonth.set(teamId, byMonth);
    }
    const noticeMonth = epochDayToMonthIndex(source.fechaAvisoEpochDay[k]);
    let entry = byMonth.get(noticeMonth);
    if (!entry) {
      entry = { noticeMonth, severity: 0, count: 0 };
      byMonth.set(noticeMonth, entry);
    }
    const sev = source.sev[k];
    if (sev > 0) {
      entry.severity += sev;
      entry.count += 1;
    }
  }
  const result = new Map<string, ClaimMonthAggregate[]>();
  for (const [teamId, byMonth] of byTeamMonth) result.set(teamId, [...byMonth.values()]);
  return result;
}

/**
 * Reads a run's stored per-month aggregates, or returns null when it has none
 * (a run created before the TeamClaimAggregate table existed, or one whose
 * backfill hasn't run) so the caller can fall back to the `resultData` path.
 */
async function getStoredClaimAggregates(simulationRunId: string, kind: "year1" | "year2"): Promise<Map<string, ClaimMonthAggregate[]> | null> {
  const rows = await prisma.teamClaimAggregate.findMany({
    where: { simulationRunId, kind },
    select: { teamId: true, noticeMonth: true, severitySum: true, claimCount: true },
  });
  if (rows.length === 0) return null;
  const byTeamId = new Map<string, ClaimMonthAggregate[]>();
  for (const r of rows) {
    if (!byTeamId.has(r.teamId)) byTeamId.set(r.teamId, []);
    byTeamId.get(r.teamId)!.push({ noticeMonth: r.noticeMonth, severity: r.severitySum, count: r.claimCount });
  }
  return byTeamId;
}

/**
 * The per-team, per-month claim totals for one run — from the stored
 * TeamClaimAggregate rows when they exist (~20 small rows per team, the whole
 * point of this table), otherwise recomputed from `resultData` for runs that
 * predate it. The fallback is the slow path it replaced: a 4MB `bytea` read
 * (~12s) plus a scan of all 1,000,000 exposures.
 *
 * `universe` supplies `n` and the monopoly fallback; `source` is whichever
 * claim fields this `kind` reads (the universe's own for "year1",
 * generateYear2Claims' output for "year2").
 */
async function getClaimAggregatesForRun(
  run: { id: string; params: unknown },
  universe: ColombiaUniverse,
  source: ClaimSource,
  kind: "year1" | "year2"
): Promise<Map<string, ClaimMonthAggregate[]> | null> {
  const stored = await getStoredClaimAggregates(run.id, kind);
  if (stored) return stored;

  const params = run.params as { teamIdByNumericId?: Record<string, string> } | null;
  const teamIdByNumericId = params?.teamIdByNumericId;
  const assignment = teamIdByNumericId ? await getAssignmentForRun(run.id, universe.n) : null;

  if (assignment && teamIdByNumericId) {
    return aggregateClaimsByTeamMonth(source, universe.n, (k) => teamIdByNumericId[assignment[k]] ?? null);
  }
  // Monopoly case (see /api/simulation): a single team was assigned the
  // whole universe and resultData wasn't stored (nothing to disambiguate).
  const teamResults = await prisma.teamSimResult.findMany({ where: { simulationRunId: run.id }, select: { teamId: true } });
  if (teamResults.length !== 1) return null;
  const soleTeamId = teamResults[0].teamId;
  return aggregateClaimsByTeamMonth(source, universe.n, () => soleTeamId);
}

/** Persists what aggregateClaimsByTeamMonth() produced, replacing whatever that run/kind had before. Used by /api/simulation and the backfill script. */
export async function saveClaimAggregates(
  simulationRunId: string,
  kind: "year1" | "year2",
  byTeamId: Map<string, ClaimMonthAggregate[]>
): Promise<void> {
  const data = [...byTeamId].flatMap(([teamId, months]) =>
    months.map((m) => ({ simulationRunId, teamId, kind, noticeMonth: m.noticeMonth, severitySum: m.severity, claimCount: m.count }))
  );
  await prisma.$transaction([
    prisma.teamClaimAggregate.deleteMany({ where: { simulationRunId, kind } }),
    ...(data.length > 0 ? [prisma.teamClaimAggregate.createMany({ data })] : []),
  ]);
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
  // `select` matters: without it Prisma also fetches the 4MB `resultData`
  // bytea on every call (~12s measured) even though the fast path below
  // never touches it — see getAssignmentForRun().
  const run = await prisma.simulationRun.findFirst({
    where: { cohortId, day, status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, params: true },
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

  const claimsByTeamId = await getClaimAggregatesForRun(run, universe, universe, "year1");
  if (!claimsByTeamId) return null;
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
    select: { id: true, params: true },
  });
  if (!run) return null;

  const result = new Int32Array(n).fill(-1);
  const params = run.params as { teamIdByNumericId?: Record<string, string> } | null;
  const prevAssignment = params?.teamIdByNumericId ? await getAssignmentForRun(run.id, n) : null;

  if (prevAssignment && params?.teamIdByNumericId) {
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
): Promise<Map<string, ClaimMonthAggregate[]> | null> {
  const run = await prisma.simulationRun.findFirst({
    where: { cohortId, day: 2, status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, params: true },
  });
  if (!run) return null;

  // Only needed on the fallback path — when this run has stored aggregates
  // (the normal case), generating Year-2 claims is pure waste, so the stored
  // rows are checked first.
  const stored = await getStoredClaimAggregates(run.id, "year2");
  if (stored) return stored;

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

  return getClaimAggregatesForRun(run, universe, year2Claims, "year2");
}

/**
 * Runs computeDevelopment() (calendar-year Year1->Year2 runoff) per team,
 * handling the same string-id <-> numeric-id remap as computeReservesForTeams.
 * Only teams present in *both* maps get a development schedule — a team with
 * no Year-2 business has nothing to develop.
 */
export function computeDevelopmentForTeams(
  year1ClaimsByTeamId: Map<string, ClaimMonthAggregate[]>,
  year2ClaimsByTeamId: Map<string, ClaimMonthAggregate[]>
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
    // `count` carries how many real claims this month's summed `severity`
    // stands for — computeDevelopment's claimCountY2 is the one figure that
    // isn't linear in the sum, so it can't be recovered from the total alone.
    for (const c of claims) year2Claims.push({ teamId: numericId, noticeMonth: c.noticeMonth, ultimate: c.severity, count: c.count });
  }

  const { byTeam } = computeDevelopment(year1Claims, year2Claims, [...numericIdByTeamId.values()]);
  const byTeamId = new Map<string, TeamDevelopment>();
  for (const [teamId, numericId] of numericIdByTeamId) {
    const dev = byTeam.get(numericId);
    if (dev) byTeamId.set(teamId, dev);
  }
  return byTeamId;
}

