import Papa from "papaparse";
import { auth } from "@/lib/auth";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { computeMemberConsolidado } from "@/lib/consolidado";
import { SOFT_SKILL_COMPETENCIES, COMPETENCY_LABELS, SOFT_SKILL_COMMENT_AUTHOR } from "@/lib/softSkills";

const FIELDS = [
  "#",
  "Integrante",
  "Equipo",
  "Día 2",
  "Día 3",
  "Día 4",
  "Promedio",
  "Días aprobados",
  "Aptitud Riesgos",
  ...SOFT_SKILL_COMPETENCIES.map((c) => COMPETENCY_LABELS[c]),
  "Comentarios",
  "Comentarios TH (habilidades blandas)",
];

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
    `${r.aptitudesRiesgosCount}/3`,
    ...SOFT_SKILL_COMPETENCIES.map((c) => r.softSkills[c]?.toFixed(1) ?? ""),
    r.comments.map((c) => `[Día ${c.day}] ${c.author}: ${c.text}`).join(" | "),
    r.softSkillComments.map((c) => `[Actividad ${c.activity}] ${SOFT_SKILL_COMMENT_AUTHOR}: ${c.text}`).join(" | "),
  ]);
  // ";" instead of Papa Parse's default "," — the admin opens this directly in Excel, where a comma-separated CSV doesn't auto-split into columns under es-CO locale settings.
  const csv = Papa.unparse({ fields: FIELDS, data }, { delimiter: ";" });

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
