import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { generateColombia } from "@/domain/generation/generateColombia";
import { generateChile } from "@/domain/generation/generateChile";
import { N_COLOMBIA, N_CHILE } from "@/domain/generation/constants";
import { serializeChilePolicies, serializeColombiaUniverse } from "@/lib/binary";

// Generation runs synchronously in this Route Handler rather than a
// background job/queue — see CLAUDE.md §4.1. At the reduced row counts
// (1M/100k) this completes in a few seconds, well inside the Hobby plan's
// 60s ceiling.
export const maxDuration = 60;

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
    const buffer =
      kind === "colombia" ? serializeColombiaUniverse(generateColombia(seed)) : serializeChilePolicies(generateChile(seed));
    // Prisma's Bytes field expects a plain Uint8Array<ArrayBuffer>; Buffer's
    // generic type param (ArrayBufferLike) doesn't structurally match, so
    // copy into a fresh Uint8Array rather than fighting the type.
    const data = new Uint8Array(buffer);

    await prisma.universeRun.update({
      where: { id: run.id },
      data: { status: "DONE", data, finishedAt: new Date() },
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
