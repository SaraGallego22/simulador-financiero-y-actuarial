import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { N_COLOMBIA } from "@/domain/generation/constants";
import { BYTES_PER_PREMIUM, MIN_COVERAGE, chunkByteRange, chunkCount } from "@/lib/tariffUpload";
import { toFloat32View } from "@/lib/binary";
import { hasDaySimResult, medianOfPositive } from "@/lib/tariffAccess";
import { isDayLocked, DAY_LOCKED_ERROR } from "@/lib/dayLock";

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

  // An outsourced tariff's premium is withheld from the team until this
  // day's market has cleared — seeing it earlier would hint at relative
  // risk levels before that happens (see tariffAccess.ts's doc comment on
  // hasDaySimResult()). A self-priced tariff has no such restriction — it's
  // the team's own number, already known to them.
  const revealed = submission?.outsourced ? await hasDaySimResult(teamId, day) : true;

  return NextResponse.json({
    exists: !!submission,
    complete: submission?.meanPremium != null,
    meanPremium: revealed ? (submission?.meanPremium ?? null) : null,
    submittedAt: submission?.submittedAt ?? null,
    outsourced: submission?.outsourced ?? false,
    revealed,
  });
}

// Chunked upload — see CLAUDE.md §4.3. Each chunk is small (~800KB), well
// under Vercel's 4.5MB request body limit; maxDuration is generous here
// mostly for the last chunk's full-blob read (see below), not compute.
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
  if (await isDayLocked(teamId, day)) return NextResponse.json({ error: DAY_LOCKED_ERROR }, { status: 403 });

  const chunkBytes = Buffer.from(await request.arrayBuffer());
  const { start, end } = chunkByteRange(chunkIndex, N_COLOMBIA);
  if (chunkBytes.byteLength !== end - start) {
    return NextResponse.json({ error: "El tamaño del fragmento no coincide con lo esperado" }, { status: 400 });
  }

  const fullByteLength = N_COLOMBIA * BYTES_PER_PREMIUM;

  // Splices this chunk directly into the stored bytea inside Postgres via
  // overlay(), instead of round-tripping the whole (up to ~4MB) blob through
  // this app on every one of the 5 chunks — a prior findUnique+upsert of the
  // full column here cost ~9x the logical upload size in Neon data transfer
  // per submission (read the growing blob back, then write it whole again,
  // 5 times), which is what actually exhausted the free-tier transfer quota.
  // Falls back to a fresh zero-filled blob (built server-side from a length,
  // never sent over the wire) when there's no row yet or a size mismatch —
  // same defensive reset the old buffer-alloc fallback did. Zero here reads
  // as "not priced" everywhere downstream (see MIN_COVERAGE's doc comment in
  // tariffUpload.ts) exactly like an index a chunk never overlaid should.
  // outsourced is always reset to false here (even before the last chunk) —
  // a team that previously hit "Tercerizar tarifas" instead of uploading its
  // own CSV should stop being treated as outsourced from the first chunk,
  // not just once the upload completes.
  await prisma.$executeRaw`
    INSERT INTO "TariffSubmission" ("id", "teamId", "day", "data", "outsourced", "submittedAt")
    VALUES (
      gen_random_uuid()::text, ${teamId}, ${day},
      overlay(decode(repeat('00', ${fullByteLength}), 'hex') placing ${chunkBytes} from ${start + 1} for ${chunkBytes.byteLength}),
      false, now()
    )
    ON CONFLICT ("teamId", "day") DO UPDATE SET
      "data" = overlay(
        CASE WHEN octet_length("TariffSubmission"."data") = ${fullByteLength} THEN "TariffSubmission"."data"
             ELSE decode(repeat('00', ${fullByteLength}), 'hex') END
        placing ${chunkBytes} from ${start + 1} for ${chunkBytes.byteLength}
      ),
      "outsourced" = false
  `;

  const isLastChunk = chunkIndex === totalChunks - 1;
  if (!isLastChunk) {
    return NextResponse.json({ chunkIndex, complete: false, meanPremium: null });
  }

  // Only the last chunk needs the assembled blob back — one full read
  // instead of one per chunk — to compute the coverage check and meanPremium.
  const row = await prisma.tariffSubmission.findUniqueOrThrow({ where: { teamId_day: { teamId, day } }, select: { data: true } });
  const view = toFloat32View(row.data!, N_COLOMBIA);
  let sum = 0;
  let covered = 0;
  for (let i = 0; i < N_COLOMBIA; i++) {
    if (view[i] > 0) {
      sum += view[i];
      covered++;
    }
  }
  if (covered / N_COLOMBIA < MIN_COVERAGE) {
    // Data is already persisted (the overlay() above ran regardless of
    // coverage) so the team can see what's missing — just don't mark it
    // complete.
    return NextResponse.json(
      { error: `Cobertura insuficiente: solo ${((covered / N_COLOMBIA) * 100).toFixed(1)}% de las pólizas tienen prima > 0 (se requiere ${MIN_COVERAGE * 100}%).` },
      { status: 422 }
    );
  }

  const meanPremium = sum / covered;
  const medianPremium = medianOfPositive(view);
  await prisma.tariffSubmission.update({ where: { teamId_day: { teamId, day } }, data: { meanPremium, medianPremium } });

  return NextResponse.json({ chunkIndex, complete: true, meanPremium });
}
