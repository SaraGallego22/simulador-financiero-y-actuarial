import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { toInt32View } from "@/lib/binary";
import { getTariffArray } from "@/lib/tariffAccess";
import { getExposure } from "@/domain/generation/generateColombia";
import { ANIO_BASE_A1 } from "@/domain/generation/constants";
import { getUniverseForSeed, getYear2ClaimsForSeed } from "@/lib/teamBook";
import { dirtyRow, type DirtyColumns } from "@/lib/dirtyCsv";

// Streamed — bypasses Vercel's 4.5MB response cap (see CLAUDE.md §4.3), needed
// since one team's book can be up to the full 1,000,000-row universe.
export const maxDuration = 60;

const MS_PER_DAY = 86_400_000;
function epochDayYear(epochDay: number): number | null {
  if (epochDay < 0) return null;
  return new Date(epochDay * MS_PER_DAY).getFullYear();
}
function epochDayIso(epochDay: number): string {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

const HEADER_YEAR1 =
  "id_expuesto,edad_conductor,tipo_vehiculo,zona,antiguedad_vehiculo,usos_anuales_km,historial_siniestros,valor_vehiculo,uso_vehiculo,parqueadero,nivel_educativo,estrato,genero,marca_vehiculo,prima_cobrada,fecha_siniestro,fecha_aviso,monto_siniestro\n";
const HEADER_YEAR2 =
  "id_expuesto,edad_conductor,tipo_vehiculo,zona,antiguedad_vehiculo,usos_anuales_km,historial_siniestros,valor_vehiculo,uso_vehiculo,parqueadero,nivel_educativo,estrato,genero,marca_vehiculo,prima_cobrada_a2,asegurado_a1,siniestros_a1_monto,fecha_siniestro,fecha_aviso,monto_siniestro\n";

const BATCH_SIZE = 20_000;

// Risk-factor column indexes shared by both years' reports (id_expuesto at
// index 0 is never dirtied); outcome columns appended after these (premium,
// fechas, montos) are never touched — see dirtyCsv.ts. Kept in sync with
// /api/universe/public-csv's split.
const DIRTY_COLUMNS: DirtyColumns = {
  categorical: [2, 3, 8, 9, 10, 12, 13], // tipo, zona, uso, parq, edu, genero, marca
  numeric: [1, 4, 5, 6, 7, 11], // edad, antig, km, hist, valor, estrato
};

/**
 * A team's own per-policy report: their assigned exposures, the premium they
 * charged, and their claims — but only the claims a real insurer would
 * already know about by report time (occurred *and* reported within the
 * same calendar year). This mirrors esVisible2027()/esVisible2028() in the
 * legacy prototype (line ~2482/3660) — the whole point is simulating real
 * IBNR opacity, not a spreadsheet trick, so it is NOT optional/bypassable.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "TEAM" || !session.user.teamId) {
    return new Response("No autorizado", { status: 403 });
  }
  const teamId = session.user.teamId;

  const { searchParams } = new URL(request.url);
  const day = Number(searchParams.get("day"));
  if (day !== 1 && day !== 2) {
    return new Response("day debe ser 1 o 2", { status: 400 });
  }

  const cohort = await getOrCreateActiveCohort();

  const run = await prisma.simulationRun.findFirst({
    where: { cohortId: cohort.id, day, status: "DONE" },
    orderBy: { createdAt: "desc" },
  });
  if (!run) return new Response(`Aún no hay una simulación completa para el día ${day}.`, { status: 404 });

  const universeRun = await prisma.universeRun.findFirst({
    where: { cohortId: cohort.id, kind: "colombia", status: "DONE" },
    orderBy: { createdAt: "desc" },
    select: { seed: true },
  });
  if (!universeRun) return new Response("El universo Colombia aún no se ha generado.", { status: 404 });

  const universe = getUniverseForSeed(universeRun.seed);

  const params = run.params as { teamIdByNumericId?: Record<string, string> } | null;
  let myAssignment: Int32Array;
  let myNumericId: number;
  if (run.resultData && params?.teamIdByNumericId) {
    myAssignment = toInt32View(run.resultData, universe.n);
    myNumericId = Number(Object.entries(params.teamIdByNumericId).find(([, id]) => id === teamId)?.[0] ?? -1);
    if (myNumericId === -1) return new Response("Tu equipo no participó en esta simulación.", { status: 404 });
  } else {
    const teamResults = await prisma.teamSimResult.findMany({ where: { simulationRunId: run.id } });
    if (teamResults.length !== 1 || teamResults[0].teamId !== teamId) {
      return new Response("Tu equipo no participó en esta simulación.", { status: 404 });
    }
    myAssignment = new Int32Array(universe.n).fill(1); // monopoly: everyone is "mine"
    myNumericId = 1;
  }

  const myTariffRow = await prisma.tariffSubmission.findUnique({ where: { teamId_day: { teamId, day } } });
  if (!myTariffRow || myTariffRow.meanPremium == null) {
    return new Response("Tu equipo no tiene una tarifa completa para este día.", { status: 404 });
  }
  const myTariff = getTariffArray(myTariffRow, universe);
  const myMeanPremium = myTariffRow.meanPremium;

  const encoder = new TextEncoder();

  if (day === 1) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(HEADER_YEAR1));
        for (let i = 0; i < universe.n; i += BATCH_SIZE) {
          const end = Math.min(i + BATCH_SIZE, universe.n);
          let text = "";
          for (let k = i; k < end; k++) {
            if (myAssignment[k] !== myNumericId) continue;
            const e = getExposure(universe, k);
            const premium = Math.round(myTariff[k] || myMeanPremium);
            const claimed = !!universe.siniestro[k];
            const visible =
              claimed &&
              epochDayYear(universe.fechaSinEpochDay[k]) === ANIO_BASE_A1 &&
              epochDayYear(universe.fechaAvisoEpochDay[k]) === ANIO_BASE_A1;
            const fechaSin = visible ? epochDayIso(universe.fechaSinEpochDay[k]) : "";
            const fechaAviso = visible ? epochDayIso(universe.fechaAvisoEpochDay[k]) : "";
            const monto = visible ? universe.sev[k] : "";
            const fields = [e.id, e.edad, e.tipo, e.zona, e.antig, e.km, e.hist, e.valor, e.uso, e.parq, e.edu, e.estrato, e.genero, e.marca];
            for (const row of dirtyRow(universeRun.seed, k, fields, DIRTY_COLUMNS)) {
              text += [...row, premium, fechaSin, fechaAviso, monto].join(",") + "\n";
            }
          }
          controller.enqueue(encoder.encode(text));
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=reporte_dia1.csv",
      },
    });
  }

  // day === 2: needs Year 1's assignment (was this exposure mine last year?)
  // and Year 1's claim amount (fully known by now, Year 1 is closed) plus
  // Year 2's own IBNR-censored claims.
  const year1Run = await prisma.simulationRun.findFirst({
    where: { cohortId: cohort.id, day: 1, status: "DONE" },
    orderBy: { createdAt: "desc" },
  });
  const year1Params = year1Run?.params as { teamIdByNumericId?: Record<string, string> } | null;
  let wasMineYear1: Uint8Array;
  if (year1Run?.resultData && year1Params?.teamIdByNumericId) {
    const year1Assignment = toInt32View(year1Run.resultData, universe.n);
    const myYear1NumericId = Number(
      Object.entries(year1Params.teamIdByNumericId).find(([, id]) => id === teamId)?.[0] ?? -1
    );
    wasMineYear1 = new Uint8Array(universe.n);
    if (myYear1NumericId !== -1) {
      for (let k = 0; k < universe.n; k++) wasMineYear1[k] = year1Assignment[k] === myYear1NumericId ? 1 : 0;
    }
  } else if (year1Run) {
    const year1Results = await prisma.teamSimResult.findMany({ where: { simulationRunId: year1Run.id } });
    wasMineYear1 = new Uint8Array(universe.n).fill(year1Results.length === 1 && year1Results[0].teamId === teamId ? 1 : 0);
  } else {
    wasMineYear1 = new Uint8Array(universe.n);
  }

  const year2Claims = getYear2ClaimsForSeed(universeRun.seed, universe);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(HEADER_YEAR2));
      for (let i = 0; i < universe.n; i += BATCH_SIZE) {
        const end = Math.min(i + BATCH_SIZE, universe.n);
        let text = "";
        for (let k = i; k < end; k++) {
          if (myAssignment[k] !== myNumericId) continue;
          const e = getExposure(universe, k);
          const premium2 = Math.round(myTariff[k] || myMeanPremium);
          const eraA1 = wasMineYear1[k];
          const sinMontoA1 = eraA1 && universe.siniestro[k] ? universe.sev[k] : 0;
          const claimed2 = !!year2Claims.siniestro[k];
          const visible2 =
            claimed2 &&
            epochDayYear(year2Claims.fechaSinEpochDay[k]) === ANIO_BASE_A1 + 1 &&
            epochDayYear(year2Claims.fechaAvisoEpochDay[k]) === ANIO_BASE_A1 + 1;
          const fechaSin2 = visible2 ? epochDayIso(year2Claims.fechaSinEpochDay[k]) : "";
          const fechaAviso2 = visible2 ? epochDayIso(year2Claims.fechaAvisoEpochDay[k]) : "";
          const monto2 = visible2 ? year2Claims.sev[k] : "";
          const fields = [
            e.id, e.edad, e.tipo, e.zona, e.antig + 1, e.km, e.hist + (universe.siniestro[k] ? 1 : 0),
            e.valor, e.uso, e.parq, e.edu, e.estrato, e.genero, e.marca,
          ];
          for (const row of dirtyRow(universeRun.seed, k, fields, DIRTY_COLUMNS)) {
            text += [...row, premium2, eraA1, sinMontoA1, fechaSin2, fechaAviso2, monto2].join(",") + "\n";
          }
        }
        controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=reporte_dia2.csv",
    },
  });
}
