import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { generateChile } from "@/domain/generation/generateChile";
import { N_COLOMBIA, N_CHILE } from "@/domain/generation/constants";
import { getUniverseForSeed } from "@/lib/teamBook";

// Generation runs synchronously in this Route Handler rather than a
// background job/queue — see CLAUDE.md §4.1. Hobby's max duration is 300s.
export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const kind = body?.kind;
  const seed = Number(body?.seed);
  if ((kind !== "colombia" && kind !== "chile") || !Number.isFinite(seed)) {
    return NextResponse.json({ error: "Body inválido: se espera { kind: 'colombia'|'chile', seed: number }" }, { status: 400 });
  }

  const cohort = await getOrCreateActiveCohort();
  const rowCount = kind === "colombia" ? N_COLOMBIA : N_CHILE;

  const run = await prisma.universeRun.create({
    data: { cohortId: cohort.id, kind, seed, rowCount, status: "RUNNING", startedAt: new Date() },
  });

  try {
    // Generation is deterministic given `seed` (measured ~1s for Colombia at
    // 1M rows), so we only need to persist the seed, not the generated data
    // itself — reading it back is a fresh regeneration, not a blob fetch.
    // This isn't just an optimization: reading back a ~40MB `bytea` value
    // from Neon's free-tier compute measured 84-100s regardless of whether
    // the connection went through the Neon serverless adapter or plain
    // TCP/pg, which blew past this route's (and the simulation route's)
    // maxDuration in production. See CLAUDE.md §4.1.
    if (kind === "colombia") getUniverseForSeed(seed);
    else generateChile(seed);

    await prisma.universeRun.update({
      where: { id: run.id },
      data: { status: "DONE", finishedAt: new Date() },
    });

    return NextResponse.json({ id: run.id, status: "DONE" });
  } catch (err) {
    await prisma.universeRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: err instanceof Error ? err.message : String(err), finishedAt: new Date() },
    });
    return NextResponse.json({ error: "La generación falló" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const cohort = await getOrCreateActiveCohort();
  const runs = await prisma.universeRun.findMany({
    where: { cohortId: cohort.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, seed: true, rowCount: true, status: true, error: true, startedAt: true, finishedAt: true, createdAt: true },
  });

  return NextResponse.json({ runs });
}
