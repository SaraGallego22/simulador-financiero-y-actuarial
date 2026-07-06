"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { INSTRUMENTS, INSTRUMENT_BY_ID, isBondLike } from "@/domain/finance/instruments";
import type { Allocation, PortfolioDecisionV2, MaturityRules } from "@/domain/finance/instruments";
import { conceptosDia } from "@/domain/grading/concepts";
import type { Dia } from "@/domain/grading/concepts";
import { SEGMENTS } from "@/domain/grading/analytics";
import type { Recommendation } from "@/domain/grading/analytics";

async function requireTeam(): Promise<string> {
  const session = await auth();
  if (!session || session.user.role !== "TEAM" || !session.user.teamId) throw new Error("No autorizado");
  return session.user.teamId;
}

export interface SubmitPortfolioState {
  error?: string;
  success?: boolean;
}

function readAllocation(formData: FormData, prefix: string): Allocation {
  const alloc: Allocation = {};
  for (const ins of INSTRUMENTS) {
    const raw = formData.get(`${prefix}_${ins.id}`);
    const value = raw == null || raw === "" ? 0 : Number(raw);
    if (Number.isFinite(value) && value > 0) alloc[ins.id] = value;
  }
  return alloc;
}

function readMaturityRules(formData: FormData): { rules: MaturityRules; error?: string } {
  const rules: MaturityRules = {};
  for (const ins of INSTRUMENTS) {
    if (!isBondLike(ins)) continue;
    const raw = formData.get(`maturity_${ins.id}`);
    if (raw == null || raw === "") continue;
    const value = String(raw);
    if (value === "cash") {
      rules[ins.id] = { action: "cash" };
      continue;
    }
    if (!INSTRUMENT_BY_ID[value]) return { rules, error: `Regla de vencimiento inválida para ${ins.id}.` };
    rules[ins.id] = { action: "reinvest", instrumentId: value };
  }
  return { rules };
}

/**
 * A team's portfolio decision has two parts: `allocation` (where fresh
 * surplus cash gets invested every month) and `maturityRules` (a per-
 * instrument rule for what happens when that specific holding matures —
 * hold as cash, or reinvest into another instrument, chaining further) —
 * see almSim()'s doc comment in src/domain/finance/alm.ts for the full
 * rationale. An instrument with no maturity rule falls back to
 * `allocation` when it matures, so a team can set one allocation and never
 * touch anything else.
 */
export async function submitPortfolioAction(day: number, _prev: SubmitPortfolioState, formData: FormData): Promise<SubmitPortfolioState> {
  const teamId = await requireTeam();

  const allocation = readAllocation(formData, "alloc");
  if (Object.keys(allocation).length === 0) return { error: "Define al menos un instrumento en tu asignación." };
  const { rules: maturityRules, error } = readMaturityRules(formData);
  if (error) return { error };

  const decision: PortfolioDecisionV2 = { allocation, maturityRules };
  const decisionJson = decision as unknown as Prisma.InputJsonValue;

  await prisma.portfolioAllocation.upsert({
    where: { teamId_day: { teamId, day } },
    update: { allocation: decisionJson },
    create: { teamId, day, allocation: decisionJson },
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
