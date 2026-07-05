import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { toFloat32View } from "@/lib/binary";
import { runSimulation } from "@/domain/market/runSimulation";
import { generateColombia } from "@/domain/generation/generateColombia";
import type { ColombiaUniverse } from "@/domain/generation/generateColombia";
import type { TeamInfo } from "@/domain/market/runSimulation";
import { N_COLOMBIA } from "@/domain/generation/constants";

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
}

/**
 * When exactly one team has a complete tariff, there's no "choice" to
 * simulate — a market of one insurer gets the whole universe by definition.
 * runSimulation() deliberately requires >=2 teams (a discrete-choice model
 * needs >=2 alternatives to mean anything), so this monopoly case is handled
 * here instead of relaxing that domain invariant.
 */
function aggregateMonopoly(universe: ColombiaUniverse, tariff: Float32Array, fallbackPremium: number): TeamAggregate {
  let totalPremium = 0;
  let claimsCount = 0;
  let claimsAmount = 0;
  let sumLambda = 0;
  for (let k = 0; k < universe.n; k++) {
    const premium = tariff[k] || fallbackPremium;
    totalPremium += premium;
    sumLambda += universe.lam[k];
    if (universe.siniestro[k]) {
      claimsCount++;
      claimsAmount += universe.sev[k];
    }
  }
  return { insuredCount: universe.n, totalPremium, claimsCount, claimsAmount, rejectedCount: 0, sumLambda };
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
  const universe = generateColombia(universeRun.seed);

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
      params: { seed, beta, marcaScale, cuotaPct, teamIdByNumericId },
    },
  });

  try {
    const aggregateByTeamId = new Map<string, TeamAggregate>();

    if (eligibleTeams.length === 1) {
      const t = eligibleTeams[0];
      const tariff = toFloat32View(t.tariffSubmissions[0].data, N_COLOMBIA);
      aggregateByTeamId.set(t.id, aggregateMonopoly(universe, tariff, t.tariffSubmissions[0].meanPremium!));
    } else {
      const numericIdByTeamId = new Map<string, number>();
      const teamInfos: TeamInfo[] = eligibleTeams.map((t, i) => {
        const numericId = i + 1;
        numericIdByTeamId.set(t.id, numericId);
        return { id: numericId, fallbackPremium: t.tariffSubmissions[0].meanPremium! };
      });
      const tariffsByTeam = new Map<number, Float32Array>();
      for (const t of eligibleTeams) {
        tariffsByTeam.set(numericIdByTeamId.get(t.id)!, toFloat32View(t.tariffSubmissions[0].data, N_COLOMBIA));
      }

      const result = runSimulation(universe, tariffsByTeam, teamInfos, { seed, beta, marcaScale, cuotaPct });
      for (const t of eligibleTeams) {
        const agg = result.aggregates.get(numericIdByTeamId.get(t.id)!)!;
        aggregateByTeamId.set(t.id, agg);
      }

      await prisma.simulationRun.update({
        where: { id: run.id },
        data: { resultData: new Uint8Array(Buffer.from(result.assignment.buffer)) },
      });
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
            extra: { sumLambda: agg.sumLambda },
          },
          create: {
            simulationRunId: run.id,
            teamId: t.id,
            insuredCount: agg.insuredCount,
            totalPremium: agg.totalPremium,
            claimsCount: agg.claimsCount,
            claimsAmount: agg.claimsAmount,
            rejectedCount: agg.rejectedCount,
            extra: { sumLambda: agg.sumLambda },
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
    return NextResponse.json({ error: "La simulación falló" }, { status: 500 });
  }
}
