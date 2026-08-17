/**
 * Test-data seed for the 12-team cohort: generates the Colombia universe,
 * builds a per-team tariff/portfolio for Día 1 and Día 2, runs both market
 * simulations for real (runSimulation/runSimulationYear2, same domain
 * functions /api/simulation uses), and derives Día 2/3/4 deliverables +
 * Día 4 sector analytics from each team's real finBench() benchmark (with a
 * small per-team noise factor, so scores vary and aren't all a perfect 100).
 *
 * This is NOT a fixture of hand-typed numbers — it plays through the actual
 * engine (pricing, market clearing, reserving, ALM, finBench) so the
 * resulting admin views are internally consistent and exercise real grading,
 * the same way a live cohort's data would.
 *
 * Safe to re-run: teams/tariffs/portfolios/deliverables/analytics are
 * upserted or replaced; each run does create a fresh SimulationRun per day
 * (mirroring the admin's own "re-run the simulation" behavior) — helper
 * queries elsewhere always pick the most recent DONE run per day.
 *
 * Usage: npm run db:seed-test
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL — crea .env.local con tu connection string de Neon antes de correr este seed.");
  process.exit(1);
}

import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeCapacityByTeamId } from "@/lib/capacityHelper";
import { computeFinBenchForCohort } from "@/lib/finBenchHelper";
import { getPreviousAssignmentNumeric } from "@/lib/teamBook";

import { generateColombia, getExposure } from "@/domain/generation/generateColombia";
import type { ColombiaUniverse } from "@/domain/generation/generateColombia";
import { generateYear2Claims } from "@/domain/generation/generateYear2Claims";
import type { Year2Claims } from "@/domain/generation/generateYear2Claims";
import { N_COLOMBIA } from "@/domain/generation/constants";
import { seedRand } from "@/domain/generation/rng";
import type { Rng } from "@/domain/generation/rng";
import { calcLambda } from "@/domain/pricing/frequency";
import { calcMediaSev } from "@/domain/pricing/severity";
import { meanPremium } from "@/domain/pricing/outsourced";
import { runSimulation } from "@/domain/market/runSimulation";
import type { TeamInfo } from "@/domain/market/runSimulation";
import { runSimulationYear2 } from "@/domain/market/runSimulationYear2";
import { solveLongOnlyMinVariance, TARGET_RETURN, portfolioExpectedReturn } from "@/domain/finance/markowitz";
import { INSTRUMENTS } from "@/domain/finance/instruments";
import type { Allocation, PortfolioDecisionV4 } from "@/domain/finance/instruments";
import type { FinBenchResult } from "@/domain/finance/finBench";
import { computeSectorStats, rankForCrecer, rankForDisminuir } from "@/domain/grading/sectors";
import type { SectorStat } from "@/domain/grading/sectors";
import { conceptosDia, CONCEPTO_BY_ID } from "@/domain/grading/concepts";
import type { Dia } from "@/domain/grading/concepts";

const TEAM_COUNT = 12;
const TEST_TEAM_PASSWORD = "Prueba1234";
/**
 * A dedicated, INACTIVE cohort — deliberately not reusing
 * getOrCreateActiveCohort() (which would either return whatever cohort is
 * already marked active, or — worse — mean creating this one active and
 * silently hiding a real, currently-in-use cohort from the whole admin/team
 * UI, since this app only ever reads a single "active" cohort at a time, see
 * CLAUDE.md §7). Keeping this cohort inactive means the simulations run here
 * never become the "latest run" for any other cohort, and its teams/data
 * are fully isolated — the tradeoff is that browsing it through the actual
 * app UI requires temporarily flipping Cohort.active, a separate explicit
 * step, not something this script does on its own.
 */
const TEST_COHORT_NAME = "Cohorte prueba (12 equipos)";
const TEAM_COLORS = [
  "#0033A0",
  "#00AEC7",
  "#E3E829",
  "#007A50",
  "#D0021B",
  "#888B8D",
  "#5B2A86",
  "#F5821F",
  "#1B998B",
  "#C9184A",
  "#2E5266",
  "#8AA29E",
];

// Same defaults SimulationTrigger.tsx pre-fills for the admin.
const BETA = 1.5;
const MARCA_SCALE = 0.3;
const CUOTA_PCT = 0.3;
const RETENTION_FACTOR = 1;

const FIRST_NAMES = [
  "Juan",
  "Camila",
  "Andrés",
  "Valentina",
  "Santiago",
  "Mariana",
  "Felipe",
  "Daniela",
  "Sebastián",
  "Laura",
  "Nicolás",
  "Isabella",
  "Alejandro",
  "Gabriela",
  "Diego",
  "Sofía",
  "Miguel",
  "Valeria",
  "Julián",
  "Natalia",
  "David",
  "Camilo",
  "Paula",
  "Esteban",
  "Carolina",
];
const LAST_NAMES = [
  "García",
  "Rodríguez",
  "Martínez",
  "López",
  "González",
  "Pérez",
  "Sánchez",
  "Ramírez",
  "Torres",
  "Flórez",
  "Rojas",
  "Gómez",
  "Díaz",
  "Vargas",
  "Castro",
  "Ortiz",
  "Ruiz",
  "Álvarez",
  "Romero",
  "Suárez",
];

interface TeamRef {
  id: string;
  name: string;
}

async function ensureTestCohort(): Promise<{ id: string; name: string }> {
  const existing = await prisma.cohort.findUnique({ where: { name: TEST_COHORT_NAME } });
  if (existing) {
    await prisma.cohort.update({ where: { id: existing.id }, data: { openDay: 4 } });
    return existing;
  }
  return prisma.cohort.create({ data: { name: TEST_COHORT_NAME, active: false, openDay: 4 } });
}

async function ensureTeams(cohortId: string): Promise<TeamRef[]> {
  const teams: TeamRef[] = [];
  for (let i = 1; i <= TEAM_COUNT; i++) {
    const name = `Equipo ${i}`;
    const username = `equipo${i}`;
    let team = await prisma.team.findUnique({ where: { cohortId_name: { cohortId, name } } });
    if (!team) {
      team = await prisma.team.create({ data: { cohortId, name, color: TEAM_COLORS[(i - 1) % TEAM_COLORS.length] } });
    }
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (!existingUser) {
      await prisma.user.create({
        data: { username, passwordHash: await bcrypt.hash(TEST_TEAM_PASSWORD, 10), role: "TEAM", teamId: team.id },
      });
    }
    teams.push({ id: team.id, name: team.name });
  }
  return teams;
}

async function ensureTeamMembers(teamId: string, teamIndex: number): Promise<void> {
  const existing = await prisma.teamMember.count({ where: { teamId } });
  if (existing > 0) return;
  const rng = seedRand(9000 + teamIndex);
  const names = new Set<string>();
  while (names.size < 3) {
    const fn = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
    const ln = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
    names.add(`${fn} ${ln}`);
  }
  await prisma.teamMember.createMany({ data: [...names].map((name) => ({ teamId, name })) });
}

/** Breakeven-calibrated pure premium (calcLambda x calcMediaSev, rescaled so its average matches the universe's own realized average claim cost — same rescaling generateOutsourcedTariff() uses, see its doc comment). Per-team tariffs multiply this by their own factor. */
function buildBaseTariff(universe: ColombiaUniverse): { rawPure: Float32Array; scaleCorrection: number } {
  const n = universe.n;
  const rawPure = new Float32Array(n);
  let rawSum = 0;
  let realizedSum = 0;
  for (let i = 0; i < n; i++) {
    const e = getExposure(universe, i);
    const p = calcLambda(e) * calcMediaSev(e);
    rawPure[i] = p;
    rawSum += p;
    if (universe.siniestro[i]) realizedSum += universe.sev[i];
  }
  const rawAvg = rawSum / n;
  const scaleCorrection = rawAvg > 0 ? realizedSum / n / rawAvg : 1;
  return { rawPure, scaleCorrection };
}

/** Same idea as buildBaseTariff, but for Año 2's own risk (vehicle a year older, claim-history bump, inflated severity) — same eYear2 transform as generateYear2Claims.ts. */
function buildYear2BaseTariff(universe: ColombiaUniverse, year2Claims: Year2Claims): { rawPure2: Float32Array; scaleCorrection2: number } {
  const n = universe.n;
  const rawPure2 = new Float32Array(n);
  let rawSum = 0;
  let realizedSum = 0;
  for (let i = 0; i < n; i++) {
    const e1 = getExposure(universe, i);
    const eYear2 = { ...e1, antig: e1.antig + 1, hist: universe.siniestro[i] ? Math.min(e1.hist + 1, 5) : e1.hist };
    const p = calcLambda(eYear2) * calcMediaSev(eYear2);
    rawPure2[i] = p;
    rawSum += p;
    if (year2Claims.siniestro[i]) realizedSum += year2Claims.sev[i];
  }
  const rawAvg = rawSum / n;
  const scaleCorrection2 = rawAvg > 0 ? realizedSum / n / rawAvg : 1;
  return { rawPure2, scaleCorrection2 };
}

function scaleTariff(rawPure: Float32Array, scale: number, teamFactor: number): Float32Array {
  const n = rawPure.length;
  const out = new Float32Array(n);
  const f = scale * teamFactor;
  for (let i = 0; i < n; i++) out[i] = rawPure[i] * f;
  return out;
}

// Wrapped in `new Uint8Array(...)` (the copy-constructing overload) so the
// result is concretely Uint8Array<ArrayBuffer> — what Prisma's Bytes fields
// expect — matching the same pattern /api/simulation/route.ts already uses
// for resultData. Single-arg Buffer.from is safe here: every array passed in
// is freshly allocated (byteOffset 0, spanning its whole buffer), never a
// slice of something larger.
function bufferFromFloat32(arr: Float32Array): Uint8Array<ArrayBuffer> {
  // Every array passed in is genuinely a fresh Uint8Array<ArrayBuffer> at
  // runtime (Buffer.from's copy always allocates a real ArrayBuffer) — the
  // cast just narrows past TS's generic-default widening on the bare
  // Float32Array/Buffer.from types, which Prisma's Bytes fields don't accept.
  return new Uint8Array(Buffer.from(arr.buffer)) as Uint8Array<ArrayBuffer>;
}

/**
 * Optimal min-variance weights at TARGET_RETURN, plus extra weight added to
 * ACC (the menu's highest-yield instrument) — since ACC's yield exceeds the
 * optimal portfolio's own achieved return (which sits exactly at
 * TARGET_RETURN), adding mass to it can only raise the achieved return, so
 * this never risks falling below TARGET_RETURN (the one thing
 * submitMinVarianceAction rejects) while still moving away from the true
 * optimum by a team-specific amount — a believable "we understood the
 * trade-off but didn't nail it" submission instead of everyone submitting
 * the literal right answer.
 */
function buildTeamMinVar(teamRng: Rng): Allocation {
  const optimal = solveLongOnlyMinVariance(TARGET_RETURN);
  const weights: Allocation = { ...optimal };
  const boost = 0.05 + teamRng() * 0.35;
  weights.ACC = (weights.ACC ?? 0) + boost;
  return weights;
}

function buildTeamAlmSchedule(teamRng: Rng): PortfolioDecisionV4 {
  const ids = INSTRUMENTS.map((i) => i.id);
  const randomAllocation = (): Allocation => {
    const alloc: Allocation = {};
    for (const id of ids) alloc[id] = 5 + teamRng() * 25;
    return alloc;
  };
  return {
    capitalSocialAllocation: randomAllocation(),
    schedule: [
      { month: 0, allocation: randomAllocation() },
      { month: 24, allocation: randomAllocation() },
    ],
  };
}

interface SimRunRefs {
  teamIdByNumericId: Record<number, string>;
  numericIdByTeamId: Map<string, number>;
}

async function runDay1Simulation(
  cohortId: string,
  universe: ColombiaUniverse,
  teams: TeamRef[],
  seed: number,
  meanPremiumByTeamId: Map<string, number>,
  tariffByTeamId: Map<string, Float32Array>
): Promise<SimRunRefs> {
  const teamIdByNumericId: Record<number, string> = {};
  const numericIdByTeamId = new Map<string, number>();
  teams.forEach((t, i) => {
    teamIdByNumericId[i + 1] = t.id;
    numericIdByTeamId.set(t.id, i + 1);
  });

  const run = await prisma.simulationRun.create({
    data: { cohortId, day: 1, status: "RUNNING", startedAt: new Date(), params: { seed, beta: BETA, marcaScale: MARCA_SCALE, cuotaPct: CUOTA_PCT, teamIdByNumericId } },
  });

  const capacityByRealTeamId = await computeCapacityByTeamId(
    cohortId,
    1,
    teams.map((t) => ({ id: t.id, avgOwnPremium: meanPremiumByTeamId.get(t.id)! })),
    universe
  );
  const capacityByTeamId = new Map<number, number>();
  for (const t of teams) capacityByTeamId.set(numericIdByTeamId.get(t.id)!, capacityByRealTeamId.get(t.id) ?? 0);

  const teamInfos: TeamInfo[] = teams.map((t) => ({ id: numericIdByTeamId.get(t.id)!, fallbackPremium: meanPremiumByTeamId.get(t.id)! }));
  const tariffsByNumericId = new Map<number, Float32Array>();
  for (const t of teams) tariffsByNumericId.set(numericIdByTeamId.get(t.id)!, tariffByTeamId.get(t.id)!);

  const result = runSimulation(universe, tariffsByNumericId, teamInfos, { seed, beta: BETA, marcaScale: MARCA_SCALE, cuotaPct: CUOTA_PCT, capacityByTeamId });

  await prisma.simulationRun.update({
    where: { id: run.id },
    data: {
      resultData: new Uint8Array(Buffer.from(result.assignment.buffer)) as Uint8Array<ArrayBuffer>,
      status: "DONE",
      finishedAt: new Date(),
    },
  });

  await prisma.$transaction(
    teams.map((t) => {
      const agg = result.aggregates.get(numericIdByTeamId.get(t.id)!)!;
      const data = {
        insuredCount: agg.insuredCount,
        totalPremium: agg.totalPremium,
        claimsCount: agg.claimsCount,
        claimsAmount: agg.claimsAmount,
        rejectedCount: agg.rejectedCount,
        extra: { sumLambda: agg.sumLambda, capacityLimit: agg.capacityLimit, rawCapacityLimit: agg.rawCapacityLimit },
      };
      return prisma.teamSimResult.upsert({
        where: { simulationRunId_teamId: { simulationRunId: run.id, teamId: t.id } },
        update: data,
        create: { simulationRunId: run.id, teamId: t.id, ...data },
      });
    })
  );

  return { teamIdByNumericId, numericIdByTeamId };
}

async function runDay2Simulation(
  cohortId: string,
  universe: ColombiaUniverse,
  year2Claims: Year2Claims,
  teams: TeamRef[],
  seed: number,
  meanPremiumByTeamId: Map<string, number>,
  tariffByTeamId: Map<string, Float32Array>
): Promise<SimRunRefs> {
  const teamIdByNumericId: Record<number, string> = {};
  const numericIdByTeamId = new Map<string, number>();
  teams.forEach((t, i) => {
    teamIdByNumericId[i + 1] = t.id;
    numericIdByTeamId.set(t.id, i + 1);
  });

  const run = await prisma.simulationRun.create({
    data: {
      cohortId,
      day: 2,
      status: "RUNNING",
      startedAt: new Date(),
      params: { seed, beta: BETA, marcaScale: MARCA_SCALE, cuotaPct: CUOTA_PCT, retentionFactor: RETENTION_FACTOR, teamIdByNumericId },
    },
  });

  const capacityByRealTeamId = await computeCapacityByTeamId(
    cohortId,
    2,
    teams.map((t) => ({ id: t.id, avgOwnPremium: meanPremiumByTeamId.get(t.id)! })),
    universe,
    year2Claims
  );
  const capacityByTeamId = new Map<number, number>();
  for (const t of teams) capacityByTeamId.set(numericIdByTeamId.get(t.id)!, capacityByRealTeamId.get(t.id) ?? 0);

  const previousAssignment = await getPreviousAssignmentNumeric(cohortId, 1, numericIdByTeamId, universe.n);
  if (!previousAssignment) throw new Error("No se encontró la simulación del Día 1 — córrela primero.");

  const teamInfos: TeamInfo[] = teams.map((t) => ({ id: numericIdByTeamId.get(t.id)!, fallbackPremium: meanPremiumByTeamId.get(t.id)! }));
  const tariffsByNumericId = new Map<number, Float32Array>();
  for (const t of teams) tariffsByNumericId.set(numericIdByTeamId.get(t.id)!, tariffByTeamId.get(t.id)!);

  const result = runSimulationYear2(universe, year2Claims, previousAssignment, tariffsByNumericId, teamInfos, {
    seed,
    beta: BETA,
    marcaScale: MARCA_SCALE,
    cuotaPct: CUOTA_PCT,
    capacityByTeamId,
    retentionFactor: RETENTION_FACTOR,
  });

  await prisma.simulationRun.update({
    where: { id: run.id },
    data: { resultData: new Uint8Array(Buffer.from(result.assignment.buffer)) as Uint8Array<ArrayBuffer>, status: "DONE", finishedAt: new Date() },
  });

  await prisma.$transaction(
    teams.map((t) => {
      const agg = result.aggregates.get(numericIdByTeamId.get(t.id)!)!;
      const data = {
        insuredCount: agg.insuredCount,
        totalPremium: agg.totalPremium,
        claimsCount: agg.claimsCount,
        claimsAmount: agg.claimsAmount,
        rejectedCount: agg.rejectedCount,
        extra: { sumLambda: agg.sumLambda, retainedCount: agg.retainedCount, newCount: agg.newCount, capacityLimit: agg.capacityLimit, rawCapacityLimit: agg.rawCapacityLimit },
      };
      return prisma.teamSimResult.upsert({
        where: { simulationRunId_teamId: { simulationRunId: run.id, teamId: t.id } },
        update: data,
        create: { simulationRunId: run.id, teamId: t.id, ...data },
      });
    })
  );

  return { teamIdByNumericId, numericIdByTeamId };
}

/**
 * Writes one day's "reporte" deliverables for a team, derived from its real
 * finBench() benchmark scaled by a team-specific noise factor (uniform
 * multiplicative noise preserves every linear formula relationship those
 * concepts are graded against — see concepts.ts's FormulaSpec — so grading
 * still produces sensible, non-trivial scores instead of either all-100 or
 * garbage). `p2_ajusteSiniestralidad` has no true `get()` value (it's
 * formula-only, correcting the team's own Día 2 guess) — computed directly
 * from the true Año-1 cost minus this team's own submitted p1_costo instead.
 */
async function writeDeliverablesForDay(
  day: number,
  teamId: string,
  bench: FinBenchResult,
  noise: number,
  submittedByTeam: Map<string, Map<string, number>>
): Promise<void> {
  const dia = `d${day}` as Dia;
  const concepts = conceptosDia(dia).filter((c) => c.tipo === "reporte");
  let teamMap = submittedByTeam.get(teamId);
  if (!teamMap) {
    teamMap = new Map();
    submittedByTeam.set(teamId, teamMap);
  }

  const rows: { conceptId: string; value: number }[] = [];
  for (const c of concepts) {
    let value: number | null = null;
    if (c.id === "p2_ajusteSiniestralidad") {
      const trueP1Costo = CONCEPTO_BY_ID.p1_costo.get?.(bench) ?? null;
      const submittedP1Costo = teamMap.get("p1_costo") ?? null;
      if (trueP1Costo != null && submittedP1Costo != null) value = trueP1Costo - submittedP1Costo;
    } else if (c.get) {
      const trueValue = c.get(bench);
      if (trueValue != null) value = trueValue * (1 + noise);
    }
    if (value == null || !Number.isFinite(value)) continue;
    rows.push({ conceptId: c.id, value });
    teamMap.set(c.id, value);
  }
  if (rows.length === 0) return;

  await prisma.$transaction(
    rows.map((r) =>
      prisma.deliverable.upsert({
        where: { teamId_day_conceptId: { teamId, day, conceptId: r.conceptId } },
        update: { value: r.value },
        create: { teamId, day, conceptId: r.conceptId, value: r.value },
      })
    )
  );
}

/** Picks up to 3 crecer + 3 disminuir sector slots, mostly the true top picks with an occasional off-by-one and a noised multiplier estimate — see scoreSectorPicks() in sectors.ts for how this grades. */
async function writeAnalyticsForTeam(teamId: string, day: number, trueCrecer: SectorStat[], trueDisminuir: SectorStat[], teamRng: Rng): Promise<void> {
  function pickList(trueRanking: SectorStat[], list: "crecer" | "disminuir") {
    const rows: { list: string; rank: number; dimA: string; valA: string; dimB: string; valB: string; estimatedMultiplier: number }[] = [];
    for (let rank = 1; rank <= 3; rank++) {
      const idx = Math.min(trueRanking.length - 1, rank - 1 + (teamRng() < 0.25 ? 1 : 0));
      const s = trueRanking[idx];
      if (!s) continue;
      const noise = (teamRng() - 0.5) * 0.3;
      rows.push({ list, rank, dimA: s.dimA, valA: s.valA, dimB: s.dimB, valB: s.valB, estimatedMultiplier: s.multiplier * (1 + noise) });
    }
    return rows;
  }

  const rows = [...pickList(trueCrecer, "crecer"), ...pickList(trueDisminuir, "disminuir")];
  await prisma.$transaction([
    prisma.analyticsRecommendation.deleteMany({ where: { teamId, day } }),
    ...rows.map((r) =>
      prisma.analyticsRecommendation.create({
        data: { teamId, day, list: r.list, rank: r.rank, dimA: r.dimA, valA: r.valA, dimB: r.dimB, valB: r.valB, estimatedMultiplier: r.estimatedMultiplier },
      })
    ),
  ]);
}

async function main() {
  console.log("== Cohorte y equipos ==");
  const cohort = await ensureTestCohort();
  const teams = await ensureTeams(cohort.id);
  for (let i = 0; i < teams.length; i++) {
    await ensureTeamMembers(teams[i].id, i);
    console.log(`  ${teams[i].name} listo`);
  }

  console.log("== Universo Colombia ==");
  let universeRun = await prisma.universeRun.findFirst({ where: { cohortId: cohort.id, kind: "colombia", status: "DONE" }, orderBy: { createdAt: "desc" } });
  const seed = universeRun?.seed ?? 42;
  if (!universeRun) {
    universeRun = await prisma.universeRun.create({
      data: { cohortId: cohort.id, kind: "colombia", seed, rowCount: N_COLOMBIA, status: "DONE", startedAt: new Date(), finishedAt: new Date() },
    });
  }
  console.log(`  Generando universo en memoria (seed=${seed})…`);
  const universe = generateColombia(seed);
  console.log("  Generando siniestros Año 2…");
  const year2Claims = generateYear2Claims(universe, seed);

  console.log("== Tarifas Día 1 ==");
  const { rawPure, scaleCorrection } = buildBaseTariff(universe);
  const day1FactorRng = seedRand(11_000);
  const day1MeanPremiumByTeamId = new Map<string, number>();
  const day1TariffByTeamId = new Map<string, Float32Array>();
  for (const team of teams) {
    const factor = 0.9 + day1FactorRng() * 0.4; // 0.90..1.30 (breakeven ± pricing strategy)
    const tariff = scaleTariff(rawPure, scaleCorrection, factor);
    const mp = meanPremium(tariff);
    await prisma.tariffSubmission.upsert({
      where: { teamId_day: { teamId: team.id, day: 1 } },
      update: { data: bufferFromFloat32(tariff), meanPremium: mp, outsourced: false },
      create: { teamId: team.id, day: 1, data: bufferFromFloat32(tariff), meanPremium: mp, outsourced: false },
    });
    day1MeanPremiumByTeamId.set(team.id, mp);
    day1TariffByTeamId.set(team.id, tariff);
    console.log(`  ${team.name}: factor=${factor.toFixed(3)} primaProm=${mp.toFixed(0)}`);
  }

  console.log("== Portafolio de mínima varianza Día 1 ==");
  const minvarRng = seedRand(12_000);
  for (const team of teams) {
    const weights = buildTeamMinVar(minvarRng);
    console.log(`  ${team.name}: retorno logrado=${(portfolioExpectedReturn(weights) * 100).toFixed(2)}%`);
    await prisma.portfolioAllocation.upsert({
      where: { teamId_day: { teamId: team.id, day: 1 } },
      update: { allocation: weights as unknown as Prisma.InputJsonValue },
      create: { teamId: team.id, day: 1, allocation: weights as unknown as Prisma.InputJsonValue },
    });
  }

  console.log("== Simulación de mercado Día 1 ==");
  await runDay1Simulation(cohort.id, universe, teams, seed, day1MeanPremiumByTeamId, day1TariffByTeamId);
  console.log("  listo");

  console.log("== Tarifas Día 2 (retarificación) ==");
  const { rawPure2, scaleCorrection2 } = buildYear2BaseTariff(universe, year2Claims);
  const day2FactorRng = seedRand(13_000);
  const day2MeanPremiumByTeamId = new Map<string, number>();
  const day2TariffByTeamId = new Map<string, Float32Array>();
  for (const team of teams) {
    const factor = 0.88 + day2FactorRng() * 0.4;
    const tariff = scaleTariff(rawPure2, scaleCorrection2, factor);
    const mp = meanPremium(tariff);
    await prisma.tariffSubmission.upsert({
      where: { teamId_day: { teamId: team.id, day: 2 } },
      update: { data: bufferFromFloat32(tariff), meanPremium: mp, outsourced: false },
      create: { teamId: team.id, day: 2, data: bufferFromFloat32(tariff), meanPremium: mp, outsourced: false },
    });
    day2MeanPremiumByTeamId.set(team.id, mp);
    day2TariffByTeamId.set(team.id, tariff);
    console.log(`  ${team.name}: factor=${factor.toFixed(3)} primaProm=${mp.toFixed(0)}`);
  }

  console.log("== Portafolio ALM Día 2 ==");
  const almRng = seedRand(14_000);
  for (const team of teams) {
    const decision = buildTeamAlmSchedule(almRng);
    await prisma.portfolioAllocation.upsert({
      where: { teamId_day: { teamId: team.id, day: 2 } },
      update: { allocation: decision as unknown as Prisma.InputJsonValue },
      create: { teamId: team.id, day: 2, allocation: decision as unknown as Prisma.InputJsonValue },
    });
  }

  console.log("== Simulación de mercado Día 2 ==");
  await runDay2Simulation(cohort.id, universe, year2Claims, teams, seed, day2MeanPremiumByTeamId, day2TariffByTeamId);
  console.log("  listo");

  console.log("== Calculando finBench (P&G/Balance/Solvencia reales) ==");
  const benchByTeamId = await computeFinBenchForCohort(cohort.id, universe, year2Claims);

  console.log("== Entregables Día 2 / Día 3 / Día 4 ==");
  const noiseRng = seedRand(15_000);
  const submittedByTeam = new Map<string, Map<string, number>>();
  for (const team of teams) {
    const bench = benchByTeamId.get(team.id);
    if (!bench) {
      console.warn(`  ${team.name}: sin benchmark financiero (revisa que ambas simulaciones hayan corrido) — se omite`);
      continue;
    }
    const noise = (noiseRng() - 0.5) * 0.16; // ±8% de error relativo por equipo
    await writeDeliverablesForDay(2, team.id, bench, noise, submittedByTeam);
    await writeDeliverablesForDay(3, team.id, bench, noise, submittedByTeam);
    await writeDeliverablesForDay(4, team.id, bench, noise, submittedByTeam);
    console.log(`  ${team.name}: entregables escritos (ruido=${(noise * 100).toFixed(1)}%)`);
  }

  console.log("== Analítica sectorial Día 4 ==");
  const sectorStats = computeSectorStats(universe);
  const trueCrecer = rankForCrecer(sectorStats);
  const trueDisminuir = rankForDisminuir(sectorStats);
  const analyticsRng = seedRand(16_000);
  for (const team of teams) {
    await writeAnalyticsForTeam(team.id, 4, trueCrecer, trueDisminuir, analyticsRng);
    console.log(`  ${team.name}: analítica escrita`);
  }

  console.log("\n== Listo ==");
  console.log(`Cohorte de prueba: "${cohort.name}" (inactiva a propósito — no afecta la cohorte real)`);
  console.log(`12 cuentas de equipo: equipo1 .. equipo12 — contraseña: ${TEST_TEAM_PASSWORD}`);
  console.log('Para verla en la app: marca esta cohorte como "active" temporalmente (y la real como inactiva) y vuelve a dejarlo como estaba al terminar.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
