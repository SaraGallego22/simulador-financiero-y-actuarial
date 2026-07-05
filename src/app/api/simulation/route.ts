import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { deserializeColombiaUniverse, toFloat32View } from "@/lib/binary";
import { runSimulation } from "@/domain/market/runSimulation";
import type { TeamInfo } from "@/domain/market/runSimulation";
import { N_COLOMBIA } from "@/domain/generation/constants";

// Same reasoning as /api/universe: runs synchronously, no queue — see
// CLAUDE.md §4.1. A 1M-row market clearing across ~12 teams takes a few
// seconds (benchmarked), well inside Vercel Hobby's 300s function limit.
export const maxDuration = 120;

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

  const universeRun = await prisma.universeRun.findFirst({
    where: { cohortId: cohort.id, kind: "colombia", status: "DONE" },
    orderBy: { createdAt: "desc" },
  });
  if (!universeRun?.data) {
    return NextResponse.json({ error: "Genera el universo Colombia primero." }, { status: 400 });
  }
  const universe = deserializeColombiaUniverse(Buffer.from(universeRun.data));

  const teams = await prisma.team.findMany({
    where: { cohortId: cohort.id },
    include: { tariffSubmissions: { where: { day } } },
  });

  const eligibleTeams = teams.filter((t) => t.tariffSubmissions[0]?.meanPremium != null);
  if (eligibleTeams.length < 2) {
    return NextResponse.json(
      { error: `Se necesitan al menos 2 equipos con tarifa completa para el día ${day} (hay ${eligibleTeams.length}).` },
      { status: 400 }
    );
  }

  const numericIdByTeamId = new Map<string, number>();
  const teamInfos: TeamInfo[] = eligibleTeams.map((t, i) => {
    const numericId = i + 1;
    numericIdByTeamId.set(t.id, numericId);
    return { id: numericId, fallbackPremium: t.tariffSubmissions[0].meanPremium! };
  });

  const tariffsByTeam = new Map<number, Float32Array>();
  for (const t of eligibleTeams) {
    const numericId = numericIdByTeamId.get(t.id)!;
    tariffsByTeam.set(numericId, toFloat32View(t.tariffSubmissions[0].data, N_COLOMBIA));
  }

  const run = await prisma.simulationRun.create({
    data: {
      cohortId: cohort.id,
      day,
      status: "RUNNING",
      startedAt: new Date(),
      params: { seed, beta, marcaScale, cuotaPct },
    },
  });

  try {
    const result = runSimulation(universe, tariffsByTeam, teamInfos, { seed, beta, marcaScale, cuotaPct });

    await prisma.$transaction([
      prisma.simulationRun.update({
        where: { id: run.id },
        data: {
          status: "DONE",
          finishedAt: new Date(),
          resultData: new Uint8Array(Buffer.from(result.assignment.buffer)),
        },
      }),
      ...eligibleTeams.map((t) => {
        const agg = result.aggregates.get(numericIdByTeamId.get(t.id)!)!;
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
