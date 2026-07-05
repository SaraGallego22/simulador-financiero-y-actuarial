"use server";

import { revalidatePath } from "next/cache";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { parseCsv } from "./csv";
import { portfolioCsvSchema } from "./csvSchemas";
import { conceptosDia } from "@/domain/grading/concepts";
import type { Dia } from "@/domain/grading/concepts";
import { SEGMENTS } from "@/domain/grading/analytics";
import type { Recommendation } from "@/domain/grading/analytics";

async function requireTeam(): Promise<string> {
  const session = await auth();
  if (!session || session.user.role !== "TEAM" || !session.user.teamId) throw new Error("No autorizado");
  return session.user.teamId;
}

export interface UploadPortfolioState {
  error?: string;
  success?: boolean;
}

export async function uploadPortfolioAction(day: number, _prev: UploadPortfolioState, formData: FormData): Promise<UploadPortfolioState> {
  const teamId = await requireTeam();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo CSV." };

  const text = await file.text();
  const { rows, errors } = parseCsv(text, portfolioCsvSchema);
  if (rows.length === 0) {
    return { error: errors[0]?.message ?? "No se reconoció ningún instrumento válido." };
  }

  const allocation: Record<string, number> = {};
  for (const row of rows) {
    allocation[row.instrumento_id] = (allocation[row.instrumento_id] ?? 0) + row.asignacion;
  }

  await prisma.portfolioAllocation.upsert({
    where: { teamId_day: { teamId, day } },
    update: { allocation },
    create: { teamId, day, allocation },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/admin/day/${day}`);
  return { success: true };
}

export interface SubmitDeliverablesState {
  error?: string;
  success?: boolean;
}

/**
 * Bulk-upserts every "reporte"-type Deliverable a team reports for a day
 * (see CONCEPTOS in src/domain/grading/concepts.ts) — one number per
 * concept, keyed by conceptId in the form. Blank fields are skipped rather
 * than stored as 0, so a partially-filled report doesn't silently zero-grade
 * the concepts the team hasn't gotten to yet.
 */
export async function submitDeliverablesAction(
  day: number,
  _prev: SubmitDeliverablesState,
  formData: FormData
): Promise<SubmitDeliverablesState> {
  const teamId = await requireTeam();
  const concepts = conceptosDia(`d${day}` as Dia).filter((c) => c.tipo === "reporte");
  if (concepts.length === 0) return { error: "Este día no tiene entregables numéricos." };

  const rows: { conceptId: string; value: number }[] = [];
  for (const c of concepts) {
    const raw = formData.get(c.id);
    if (raw == null || raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) return { error: `Valor inválido para "${c.label}".` };
    rows.push({ conceptId: c.id, value });
  }
  if (rows.length === 0) return { error: "Completa al menos un valor." };

  await prisma.$transaction(
    rows.map((r) =>
      prisma.deliverable.upsert({
        where: { teamId_day_conceptId: { teamId, day, conceptId: r.conceptId } },
        update: { value: r.value },
        create: { teamId, day, conceptId: r.conceptId, value: r.value },
      })
    )
  );

  revalidatePath(`/day/${day}`);
  revalidatePath(`/admin/day/${day}`);
  return { success: true };
}

export interface SubmitAnalyticsState {
  error?: string;
  success?: boolean;
}

/** Upserts a team's crecer/disminuir/mantener recommendation per segment (Día 4). */
export async function submitAnalyticsAction(
  day: number,
  _prev: SubmitAnalyticsState,
  formData: FormData
): Promise<SubmitAnalyticsState> {
  const teamId = await requireTeam();

  const rows: { segmentKey: string; recommendation: Recommendation }[] = [];
  for (const seg of SEGMENTS) {
    const raw = formData.get(seg.key);
    if (raw !== "crecer" && raw !== "disminuir" && raw !== "mantener") continue;
    rows.push({ segmentKey: seg.key, recommendation: raw });
  }
  if (rows.length === 0) return { error: "Selecciona al menos una recomendación." };

  await prisma.$transaction(
    rows.map((r) =>
      prisma.analyticsRecommendation.upsert({
        where: { teamId_day_segmentKey: { teamId, day, segmentKey: r.segmentKey } },
        update: { recommendation: r.recommendation },
        create: { teamId, day, segmentKey: r.segmentKey, recommendation: r.recommendation },
      })
    )
  );

  revalidatePath(`/day/${day}`);
  revalidatePath(`/admin/day/${day}`);
  return { success: true };
}
