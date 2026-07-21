import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { getTariffArray } from "@/lib/tariffAccess";
import { runSimulation } from "@/domain/market/runSimulation";
import { runSimulationYear2 } from "@/domain/market/runSimulationYear2";
import type { Year2Claims } from "@/domain/generation/generateYear2Claims";
import type { TeamInfo } from "@/domain/market/runSimulation";
import { getPreviousAssignmentNumeric, getUniverseForSeed, getYear2ClaimsForSeed } from "@/lib/teamBook";
import { computeCapacityByTeamId } from "@/lib/capacityHelper";

// Same reasoning as /api/universe: runs synchronously, no queue — see
// CLAUDE.md §4.1. Hobby's max duration is 300s.
export const maxDuration = 300;

interface TeamAggregate {
  insuredCount: number;
  totalPremium: number;
  claimsCount: number;
  claimsAmount: number;
  rejectedCount: number;
  sumLambda: number;
  retainedCount?: number;
  newCount?: number;
  capacityLimit: number;
  rawCapacityLimit: number;
}

/**
 * When exactly one team has a complete tariff, there's no "choice" to
 * simulate — a market of one insurer gets the whole universe by definition.
 * runSimulation()/runSimulationYear2() deliberately require >=2 teams (a
 * discrete-choice model needs >=2 alternatives to mean anything), so this
 * monopoly case is handled here instead of relaxing that domain invariant.
 */
function aggregateMonopoly(
  n: number,
  lam: Float32Array,
  siniestro: Uint8Array,
  sev: Float32Array,
  tariff: Float32Array,
  fallbackPremium: number
): TeamAggregate {
  let totalPremium = 0;
  let claimsCount = 0;
  let claimsAmount = 0;
  let sumLambda = 0;
  for (let k = 0; k < n; k++) {
    const premium = tariff[k] || fallbackPremium;
    totalPremium += premium;
    sumLambda += lam[k];
    if (siniestro[k]) {
      claimsCount++;
      claimsAmount += sev[k];
    }
  }
  // No capacity constraint applies here — a monopoly gets the whole
  // universe by definition (see this function's doc comment), so its
  // capacity limit is trivially "everything it got".
  return { insuredCount: n, totalPremium, claimsCount, claimsAmount, rejectedCount: 0, sumLambda, capacityLimit: n, rawCapacityLimit: n };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const day = Number(body?.day);
  const seed = Number(body?.seed);
  const beta = Number(body?.beta);
  const marcaScale = Number(body?.marcaScale);
  const cuotaPct = Number(body?.cuotaPct);
  const retentionFactor = Number(body?.retentionFactor ?? 1);
  if (![day, seed, beta, marcaScale, cuotaPct].every(Number.isFinite)) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const cohort = await getOrCreateActiveCohort();

  // Check eligibility BEFORE fetching the ~40MB universe blob or any team's
  // tariff data — this used to fetch the universe unconditionally first,
  // which made the "not enough teams" case slow for no reason.
  const teamsLite = await prisma.team.findMany({
    where: { cohortId: cohort.id },
    select: { id: true, tariffSubmissions: { where: { day }, select: { meanPremium: true } } },
  });
  const eligibleTeamIds = teamsLite.filter((t) => t.tariffSubmissions[0]?.meanPremium != null).map((t) => t.id);
  if (eligibleTeamIds.length === 0) {
    return NextResponse.json({ error: `Ningún equipo tiene una tarifa completa para el día ${day}.` }, { status: 400 });
  }

  const universeRun = await prisma.universeRun.findFirst({
    where: { cohortId: cohort.id, kind: "colombia", status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { seed: true },
  });
  if (!universeRun) {
    return NextResponse.json({ error: "Genera el universo Colombia primero." }, { status: 400 });
  }
  // Regenerated from the seed, not fetched as a stored blob — see
  // CLAUDE.md §4.1 (a ~40MB bytea read measured 84-100s on Neon's free
  // tier, regardless of connection method; regeneration takes ~1s).
  // getUniverseForSeed/getYear2ClaimsForSeed cache at module scope (not just
  // per-request) — under Fluid Compute, concurrent requests on the same
  // warm instance share this rather than each allocating their own copy,
  // which was enough to exceed the function's memory ceiling even for a
  // 3-team cohort (see teamBook.ts's doc comment on the cache).
  const universe = getUniverseForSeed(universeRun.seed);

  // Year 2 (day 2) uses its own claim draws and a retention-aware market
  // model — see CLAUDE.md's domain glossary (generarSiniestrosA2/correrSim2).
  const year2Claims: Year2Claims | null = day === 2 ? getYear2ClaimsForSeed(universeRun.seed, universe) : null;
  const monopolyLam = year2Claims?.lam ?? universe.lam;
  const monopolySiniestro = year2Claims?.siniestro ?? universe.siniestro;
  const monopolySev = year2Claims?.sev ?? universe.sev;

  const eligibleTeams = await prisma.team.findMany({
    where: { id: { in: eligibleTeamIds } },
    include: { tariffSubmissions: { where: { day } } },
  });

  // Numeric ids (1..N) are ephemeral, scoped to this one run — runSimulation
  // works in those terms, but persisting resultData without also persisting
  // which real team.id each number maps to would make it unreadable later
  // (needed by the reserving pipeline to attribute claims per team).
  const teamIdByNumericId: Record<number, string> = {};
  eligibleTeams.forEach((t, i) => {
    teamIdByNumericId[i + 1] = t.id;
  });

  const run = await prisma.simulationRun.create({
    data: {
      cohortId: cohort.id,
      day,
      status: "RUNNING",
      startedAt: new Date(),
      params: { seed, beta, marcaScale, cuotaPct, retentionFactor, teamIdByNumericId },
    },
  });

  try {
    const aggregateByTeamId = new Map<string, TeamAggregate>();

    if (eligibleTeams.length === 1) {
      const t = eligibleTeams[0];
      const tariff = getTariffArray(t.tariffSubmissions[0], universe);
      aggregateByTeamId.set(
        t.id,
        aggregateMonopoly(
          universe.n,
          monopolyLam,
          monopolySiniestro,
          monopolySev,
          tariff,
          t.tariffSubmissions[0].meanPremium!
        )
      );
    } else {
      const numericIdByTeamId = new Map<string, number>();
      const teamInfos: TeamInfo[] = eligibleTeams.map((t, i) => {
        const numericId = i + 1;
        numericIdByTeamId.set(t.id, numericId);
        return { id: numericId, fallbackPremium: t.tariffSubmissions[0].meanPremium! };
      });
      const tariffsByTeam = new Map<number, Float32Array>();
      for (const t of eligibleTeams) {
        tariffsByTeam.set(numericIdByTeamId.get(t.id)!, getTariffArray(t.tariffSubmissions[0], universe));
      }

      // Solvency-derived, per-team market-share limit — replaces the old
      // uniform cuotaPct-only cap as what actually rejects excess demand;
      // cuotaPct remains an absolute ceiling nobody can exceed regardless
      // of capital (see CLAUDE.md-adjacent README section on this and
      // capacityHelper.ts's doc comment for the Año1/Año2 distinction).
      const capacityByRealTeamId = await computeCapacityByTeamId(
        cohort.id,
        day,
        eligibleTeams.map((t) => ({ id: t.id, avgOwnPremium: t.tariffSubmissions[0].meanPremium! })),
        universe,
        year2Claims ?? undefined
      );
      const capacityByTeamId = new Map<number, number>();
      for (const t of eligibleTeams) {
        capacityByTeamId.set(numericIdByTeamId.get(t.id)!, capacityByRealTeamId.get(t.id) ?? 0);
      }

      if (day === 2 && year2Claims) {
        const previousAssignment = await getPreviousAssignmentNumeric(cohort.id, 1, numericIdByTeamId, universe.n);
        if (!previousAssignment) {
          throw new Error("Corre la simulación del Día 1 primero — el Día 2 necesita saber quién aseguró a quién en el 2027.");
        }
        const result = runSimulationYear2(universe, year2Claims, previousAssignment, tariffsByTeam, teamInfos, {
          seed,
          beta,
          marcaScale,
          cuotaPct,
          capacityByTeamId,
          retentionFactor,
        });
        for (const t of eligibleTeams) {
          const agg = result.aggregates.get(numericIdByTeamId.get(t.id)!)!;
          aggregateByTeamId.set(t.id, agg);
        }
        await prisma.simulationRun.update({
          where: { id: run.id },
          data: { resultData: new Uint8Array(Buffer.from(result.assignment.buffer)) },
        });
      } else {
        const result = runSimulation(universe, tariffsByTeam, teamInfos, { seed, beta, marcaScale, cuotaPct, capacityByTeamId });
        for (const t of eligibleTeams) {
          const agg = result.aggregates.get(numericIdByTeamId.get(t.id)!)!;
          aggregateByTeamId.set(t.id, agg);
        }
        await prisma.simulationRun.update({
          where: { id: run.id },
          data: { resultData: new Uint8Array(Buffer.from(result.assignment.buffer)) },
        });
      }
    }

    await prisma.$transaction([
      prisma.simulationRun.update({ where: { id: run.id }, data: { status: "DONE", finishedAt: new Date() } }),
      ...eligibleTeams.map((t) => {
        const agg = aggregateByTeamId.get(t.id)!;
        return prisma.teamSimResult.upsert({
          where: { simulationRunId_teamId: { simulationRunId: run.id, teamId: t.id } },
          update: {
            insuredCount: agg.insuredCount,
            totalPremium: agg.totalPremium,
            claimsCount: agg.claimsCount,
            claimsAmount: agg.claimsAmount,
            rejectedCount: agg.rejectedCount,
            extra: {
              sumLambda: agg.sumLambda,
              retainedCount: agg.retainedCount,
              newCount: agg.newCount,
              capacityLimit: agg.capacityLimit,
              rawCapacityLimit: agg.rawCapacityLimit,
            },
          },
          create: {
            simulationRunId: run.id,
            teamId: t.id,
            insuredCount: agg.insuredCount,
            totalPremium: agg.totalPremium,
            claimsCount: agg.claimsCount,
            claimsAmount: agg.claimsAmount,
            rejectedCount: agg.rejectedCount,
            extra: {
              sumLambda: agg.sumLambda,
              retainedCount: agg.retainedCount,
              newCount: agg.newCount,
              capacityLimit: agg.capacityLimit,
              rawCapacityLimit: agg.rawCapacityLimit,
            },
          },
        });
      }),
    ]);

    return NextResponse.json({ id: run.id, status: "DONE" });
  } catch (err) {
    await prisma.simulationRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message : String(err), finishedAt: new Date() },
    });
    return NextResponse.json({ error: err instanceof Error ? err.message : "La simulación falló" }, { status: 500 });
  }
}
