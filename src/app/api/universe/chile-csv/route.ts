import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { getChileForSeed } from "@/lib/teamBook";
import { YEARS_CL } from "@/domain/generation/generateChile";

// Streamed response, same rationale as universe/public-csv/route.ts — Vercel's
// 4.5MB buffered-body cap doesn't apply to a streamed one, so this returns
// the full 100,000-row Chile CSV in one request.
export const maxDuration = 60;

const CSV_HEADER =
  "id_poliza,edad_conductor,tipo_vehiculo,zona,antiguedad_vehiculo,kilometraje_anual,siniestros_previos,valor_comercial_uf,uso_vehiculo,caja_automatica,seguro_complementario,genero,comuna_tipo," +
  YEARS_CL.map((y) => `siniestro_${y},fecha_siniestro_${y},fecha_aviso_${y},monto_uf_${y}`).join(",") +
  "\n";

const BATCH_SIZE = 5_000;

export async function GET() {
  const session = await auth();
  if (!session) return new Response("No autorizado", { status: 403 });

  const cohort = await getOrCreateActiveCohort();
  const run = await prisma.universeRun.findFirst({
    where: { cohortId: cohort.id, kind: "chile", status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { seed: true },
  });
  if (!run) {
    return new Response("El dataset Chile aún no se ha generado.", { status: 404 });
  }

  // Regenerated from the stored seed, not fetched as a stored blob — same
  // reasoning as the Colombia universe (see CLAUDE.md §4.1): deterministic
  // and fast (~1s at 100,000 rows), so there's nothing to gain from paying
  // Neon's free-tier bytea read cost instead.
  const policies = getChileForSeed(run.seed);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(CSV_HEADER));
      let text = "";
      for (let i = 0; i < policies.length; i++) {
        const p = policies[i];
        const fields = [
          p.id,
          p.edadConductor,
          p.tipoVehiculo,
          p.zona,
          p.antiguedadVehiculo,
          p.kilometrajeAnual,
          p.siniestrosPrevios,
          p.valorComercialUf,
          p.usoVehiculo,
          p.cajaAutomatica ? "si" : "no",
          p.seguroComplementario ? "si" : "no",
          p.genero,
          p.comunaTipo,
        ];
        for (const year of YEARS_CL) {
          const claim = p.years[year];
          fields.push(claim.siniestro, claim.fechaSiniestro, claim.fechaAviso, claim.montoUf);
        }
        text += fields.join(",") + "\n";
        if ((i + 1) % BATCH_SIZE === 0) {
          controller.enqueue(encoder.encode(text));
          text = "";
        }
      }
      if (text) controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=dataset_chile_2021_2023.csv",
    },
  });
}
