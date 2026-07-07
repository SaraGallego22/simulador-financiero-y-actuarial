import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { getExposure } from "@/domain/generation/generateColombia";
import { getUniverseForSeed } from "@/lib/teamBook";

// Streamed response — Vercel's 4.5MB body cap applies to buffered responses,
// not streamed ones (see CLAUDE.md §4.3), so this can return the full
// 1,000,000-row public CSV in one request without chunking on the client side.
export const maxDuration = 60;

const CSV_HEADER = "id_expuesto,edad,tipo,zona,antig,km,hist,valor,uso,parq,edu,estrato,genero,marca\n";
const BATCH_SIZE = 20_000;

export async function GET() {
  const session = await auth();
  if (!session) return new Response("No autorizado", { status: 403 });

  const cohort = await getOrCreateActiveCohort();
  const run = await prisma.universeRun.findFirst({
    where: { cohortId: cohort.id, kind: "colombia", status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { seed: true },
  });
  if (!run) {
    return new Response("El universo Colombia aún no se ha generado.", { status: 404 });
  }

  // Regenerated from the stored seed rather than read back from storage —
  // generation is deterministic and fast (~1s); fetching it as a stored blob
  // measured 84-100s on Neon's free tier regardless of connection method,
  // which is the whole reason this changed. See CLAUDE.md §4.1.
  const universe = getUniverseForSeed(run.seed);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(CSV_HEADER));
      for (let i = 0; i < universe.n; i += BATCH_SIZE) {
        const end = Math.min(i + BATCH_SIZE, universe.n);
        let text = "";
        for (let k = i; k < end; k++) {
          const e = getExposure(universe, k);
          text += `${e.id},${e.edad},${e.tipo},${e.zona},${e.antig},${e.km},${e.hist},${e.valor},${e.uso},${e.parq},${e.edu},${e.estrato},${e.genero},${e.marca}\n`;
        }
        controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=universo_colombia_publico.csv",
    },
  });
}
