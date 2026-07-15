import Papa from "papaparse";
import { auth } from "@/lib/auth";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { computeMemberConsolidado } from "@/lib/consolidado";

const FIELDS = ["#", "Integrante", "Equipo", "Día 2", "Día 3", "Día 4", "Promedio", "Días aprobados"];

/** Admin's own export — unpublished scores included, same as /admin/standings itself. */
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") return new Response("No autorizado", { status: 403 });

  const cohort = await getOrCreateActiveCohort();
  const rows = await computeMemberConsolidado(cohort.id);

  const data = rows.map((r, i) => [
    i + 1,
    r.memberName,
    r.teamName,
    r.perDay[0]?.notaGeneral?.toFixed(1) ?? "",
    r.perDay[1]?.notaGeneral?.toFixed(1) ?? "",
    r.perDay[2]?.notaGeneral?.toFixed(1) ?? "",
    r.promedio?.toFixed(1) ?? "",
    `${r.diasAprobados}/${r.diasEvaluados}`,
  ]);
  const csv = Papa.unparse({ fields: FIELDS, data });

  // Leading BOM so Excel opens accented names (á/é/í/ó/ú/ñ) correctly
  // without a manual "import as UTF-8" step — see src/lib/csv.ts's
  // decodeCsvText() for the upload-side counterpart of this same issue.
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=consolidado_integrantes.csv",
    },
  });
}
