import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { N_COLOMBIA } from "@/domain/generation/constants";
import { BYTES_PER_PREMIUM, MIN_COVERAGE, chunkByteRange, chunkCount } from "@/lib/tariffUpload";
import { toFloat32View } from "@/lib/binary";

async function requireTeam() {
  const session = await auth();
  if (!session || session.user.role !== "TEAM" || !session.user.teamId) return null;
  return session.user.teamId;
}

export async function GET(request: Request) {
  const teamId = await requireTeam();
  if (!teamId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const day = Number(new URL(request.url).searchParams.get("day"));
  if (!Number.isFinite(day)) return NextResponse.json({ error: "Falta el parámetro day" }, { status: 400 });

  const submission = await prisma.tariffSubmission.findUnique({
    where: { teamId_day: { teamId, day } },
    select: { meanPremium: true, submittedAt: true, outsourced: true },
  });

  return NextResponse.json({
    exists: !!submission,
    complete: submission?.meanPremium != null,
    meanPremium: submission?.meanPremium ?? null,
    submittedAt: submission?.submittedAt ?? null,
    outsourced: submission?.outsourced ?? false,
  });
}

// Chunked upload — see CLAUDE.md §4.3. Each chunk is small (~800KB), well
// under Vercel's 4.5MB request body limit; maxDuration is generous here
// mostly for the read-modify-write round trip against Postgres, not compute.
export const maxDuration = 30;

export async function POST(request: Request) {
  const teamId = await requireTeam();
  if (!teamId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const url = new URL(request.url);
  const day = Number(url.searchParams.get("day"));
  const chunkIndex = Number(url.searchParams.get("chunkIndex"));
  const totalChunks = Number(url.searchParams.get("totalChunks"));
  if (![day, chunkIndex, totalChunks].every(Number.isFinite)) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }
  if (totalChunks !== chunkCount(N_COLOMBIA)) {
    return NextResponse.json({ error: "totalChunks no coincide con el tamaño esperado del universo" }, { status: 400 });
  }

  const chunkBytes = new Uint8Array(await request.arrayBuffer());
  const { start, end } = chunkByteRange(chunkIndex, N_COLOMBIA);
  if (chunkBytes.byteLength !== end - start) {
    return NextResponse.json({ error: "El tamaño del fragmento no coincide con lo esperado" }, { status: 400 });
  }

  const fullByteLength = N_COLOMBIA * BYTES_PER_PREMIUM;

  const existing = await prisma.tariffSubmission.findUnique({ where: { teamId_day: { teamId, day } } });
  const buffer =
    existing?.data && existing.data.byteLength === fullByteLength
      ? Buffer.from(existing.data)
      : Buffer.alloc(fullByteLength);
  buffer.set(chunkBytes, start);

  const isLastChunk = chunkIndex === totalChunks - 1;
  let meanPremium: number | null = existing?.meanPremium ?? null;

  if (isLastChunk) {
    const view = toFloat32View(buffer, N_COLOMBIA);
    let sum = 0;
    let covered = 0;
    for (let i = 0; i < N_COLOMBIA; i++) {
      if (view[i] > 0) {
        sum += view[i];
        covered++;
      }
    }
    if (covered / N_COLOMBIA < MIN_COVERAGE) {
      // Still save the partial data so the team can see what's missing, but
      // don't mark it complete.
      meanPremium = null;
      await prisma.tariffSubmission.upsert({
        where: { teamId_day: { teamId, day } },
        update: { data: new Uint8Array(buffer), outsourced: false },
        create: { teamId, day, data: new Uint8Array(buffer), outsourced: false },
      });
      return NextResponse.json(
        { error: `Cobertura insuficiente: solo ${((covered / N_COLOMBIA) * 100).toFixed(1)}% de las pólizas tienen prima > 0 (se requiere ${MIN_COVERAGE * 100}%).` },
        { status: 422 }
      );
    }
    meanPremium = sum / covered;
  }

  // outsourced is always reset to false here (even before the last chunk) —
  // a team that previously hit "Tercerizar tarifas" and is now uploading its
  // own CSV should stop being treated as outsourced from the first chunk,
  // not just once the upload completes.
  await prisma.tariffSubmission.upsert({
    where: { teamId_day: { teamId, day } },
    update: { data: new Uint8Array(buffer), meanPremium: isLastChunk ? meanPremium : undefined, outsourced: false },
    create: { teamId, day, data: new Uint8Array(buffer), meanPremium: isLastChunk ? meanPremium : null, outsourced: false },
  });

  return NextResponse.json({ chunkIndex, complete: isLastChunk, meanPremium: isLastChunk ? meanPremium : null });
}
