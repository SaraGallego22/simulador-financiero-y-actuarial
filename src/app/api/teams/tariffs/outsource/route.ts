import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { getUniverseForSeed } from "@/lib/teamBook";
import { getExposure } from "@/domain/generation/generateColombia";
import { generateOutsourcedTariff, meanPremium } from "@/domain/pricing/outsourced";

export const maxDuration = 60;

async function requireTeam() {
  const session = await auth();
  if (!session || session.user.role !== "TEAM" || !session.user.teamId) return null;
  return session.user.teamId;
}

async function loadUniverse(cohortId: string) {
  const universeRun = await prisma.universeRun.findFirst({
    where: { cohortId, kind: "colombia", status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { seed: true },
  });
  if (!universeRun) return null;
  // Regenerated from the seed, never persisted — same reasoning as the
  // universe itself and the outsourced tariff below (CLAUDE.md §4.1).
  return getUniverseForSeed(universeRun.seed);
}

/**
 * "Tercerizar tarifas" — the emergency option for a team that couldn't
 * price in time. Narratively: hiring a Chilean consultancy with no
 * experience in the Colombian market. Assigns a deterministic,
 * worse-than-healthy tariff (see domain/pricing/outsourced.ts) so the team
 * can still take part in the market, at a real cost to their solvency.
 *
 * No `data` blob is stored (TariffSubmission.data stays null, outsourced is
 * set true) — the tariff is a pure function of the universe seed, so it's
 * regenerated on demand by getTariffArray() wherever it's needed (the
 * simulation route, the team's own report, and the GET handler below),
 * exactly like the universe itself is never persisted as a blob.
 */
export async function POST(request: Request) {
  const teamId = await requireTeam();
  if (!teamId) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const day = Number(body?.day);
  if (![1, 2].includes(day)) return NextResponse.json({ error: "Parámetro day inválido" }, { status: 400 });

  const cohort = await getOrCreateActiveCohort();
  const universe = await loadUniverse(cohort.id);
  if (!universe) return NextResponse.json({ error: "El universo Colombia aún no se ha generado." }, { status: 400 });

  const premiums = generateOutsourcedTariff(universe);
  const mean = meanPremium(premiums);

  await prisma.tariffSubmission.upsert({
    where: { teamId_day: { teamId, day } },
    update: { data: null, meanPremium: mean, outsourced: true },
    create: { teamId, day, data: null, meanPremium: mean, outsourced: true },
  });

  return NextResponse.json({ outsourced: true, meanPremium: mean });
}

const CSV_HEADER = "id_expuesto,prima\n";
const BATCH_SIZE = 20_000;

/** Streams the team's own outsourced tariff as a CSV — same shape as the one they'd have uploaded themselves. */
export async function GET(request: Request) {
  const teamId = await requireTeam();
  if (!teamId) return new Response("No autorizado", { status: 403 });

  const day = Number(new URL(request.url).searchParams.get("day"));
  if (!Number.isFinite(day)) return new Response("Falta el parámetro day", { status: 400 });

  const submission = await prisma.tariffSubmission.findUnique({ where: { teamId_day: { teamId, day } } });
  if (!submission?.outsourced) return new Response("Este equipo no tiene una tarifa tercerizada para este día.", { status: 404 });

  const cohort = await getOrCreateActiveCohort();
  const universe = await loadUniverse(cohort.id);
  if (!universe) return new Response("El universo Colombia aún no se ha generado.", { status: 404 });

  const premiums = generateOutsourcedTariff(universe);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(CSV_HEADER));
      for (let i = 0; i < universe.n; i += BATCH_SIZE) {
        const end = Math.min(i + BATCH_SIZE, universe.n);
        let text = "";
        for (let k = i; k < end; k++) {
          text += `${getExposure(universe, k).id},${Math.round(premiums[k])}\n`;
        }
        controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=tarifa_tercerizada_dia${day}.csv`,
    },
  });
}
