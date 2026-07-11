"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { INSTRUMENTS, isMinVarianceAllocation, isPortfolioDecisionV3 } from "@/domain/finance/instruments";
import { TARGET_RETURN, portfolioExpectedReturn } from "@/domain/finance/markowitz";
import { conceptosDia } from "@/domain/grading/concepts";
import type { Dia } from "@/domain/grading/concepts";
import { isValidSectorPick } from "@/domain/grading/sectors";

async function requireTeam(): Promise<string> {
  const session = await auth();
  if (!session || session.user.role !== "TEAM" || !session.user.teamId) throw new Error("No autorizado");
  return session.user.teamId;
}

export interface SubmitPortfolioState {
  error?: string;
  success?: boolean;
}

/**
 * A team's portfolio decision is a tree of tranches (see PortfolioDecisionV3
 * in src/domain/finance/instruments.ts) decided once, up front, via the
 * PortfolioForm wizard — each tranche says how much goes into which
 * instrument, and what happens when it reaches its own maturity/decision
 * month (hold as cash, repeat indefinitely, or reallocate into new child
 * tranches). Arbitrary tree depth doesn't flatten cleanly into named
 * FormData fields, so the wizard submits the whole tree as one JSON blob
 * (see PortfolioForm.tsx's review screen) — never trust that payload's
 * shape without re-validating server-side, since a client can submit
 * anything.
 */
export async function submitPortfolioAction(day: number, _prev: SubmitPortfolioState, formData: FormData): Promise<SubmitPortfolioState> {
  const teamId = await requireTeam();

  const raw = formData.get("decisionTree");
  if (raw == null || raw === "") return { error: "No se recibió ningún portafolio." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return { error: "El portafolio enviado no es JSON válido." };
  }
  if (!isPortfolioDecisionV3(parsed)) {
    return { error: "El portafolio enviado tiene un formato inválido. Vuelve a completar el asistente." };
  }

  const decisionJson = parsed as unknown as Prisma.InputJsonValue;

  await prisma.portfolioAllocation.upsert({
    where: { teamId_day: { teamId, day } },
    update: { allocation: decisionJson },
    create: { teamId, day, allocation: decisionJson },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/admin/day/${day}`);
  return { success: true };
}

export interface SubmitMinVarianceState {
  error?: string;
  success?: boolean;
}

/**
 * Día 1's minimum-variance exercise: a flat weight per instrument (no
 * maturity tree — this is a one-shot "how would you allocate right now"
 * question, not the ALM decision, which moved to Día 2 — see
 * submitPortfolioAction). Rejects (rather than silently persisting and
 * scoring 0) a submission whose weights don't even reach TARGET_RETURN,
 * since that's not a valid candidate answer to the exercise, same spirit as
 * rejecting a malformed tree above. Always day=1 — this exercise has no
 * other day it could belong to.
 */
export async function submitMinVarianceAction(_prev: SubmitMinVarianceState, formData: FormData): Promise<SubmitMinVarianceState> {
  const teamId = await requireTeam();

  const weights: Record<string, number> = {};
  for (const ins of INSTRUMENTS) {
    const raw = formData.get(`w-${ins.id}`);
    const value = Number(raw ?? 0);
    if (!Number.isFinite(value) || value < 0) return { error: `Peso inválido para ${ins.nombre}.` };
    weights[ins.id] = value;
  }
  if (!isMinVarianceAllocation(weights)) return { error: "El portafolio enviado tiene un formato inválido." };

  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  if (total <= 0) return { error: "Asigna al menos algo de peso a un instrumento." };

  const achievedReturn = portfolioExpectedReturn(weights);
  if (achievedReturn < TARGET_RETURN - 1e-6) {
    return {
      error: `Ese portafolio rinde ${(achievedReturn * 100).toFixed(2)}%, por debajo del objetivo de ${(TARGET_RETURN * 100).toFixed(0)}%. Ajusta los pesos para alcanzar al menos el retorno objetivo.`,
    };
  }

  await prisma.portfolioAllocation.upsert({
    where: { teamId_day: { teamId, day: 1 } },
    update: { allocation: weights as unknown as Prisma.InputJsonValue },
    create: { teamId, day: 1, allocation: weights as unknown as Prisma.InputJsonValue },
  });

  revalidatePath("/dashboard");
  revalidatePath("/admin/day/1");
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

const SECTOR_LISTS = ["crecer", "disminuir"] as const;
const MAX_SECTOR_RANK = 3;

/**
 * Replaces a team's Día 4 sector rankings — up to 3 "crecer" + 3 "disminuir"
 * picks, each a cross of two dimensions (e.g. zona=urbana x uso=comercial;
 * see domain/grading/sectors.ts). Full replace (delete then recreate) rather
 * than per-slot upsert, since a team clearing a previously-filled slot needs
 * that row actually removed, not left stale.
 */
export async function submitAnalyticsAction(
  day: number,
  _prev: SubmitAnalyticsState,
  formData: FormData
): Promise<SubmitAnalyticsState> {
  const teamId = await requireTeam();

  const rows: { list: string; rank: number; dimA: string; valA: string; dimB: string; valB: string }[] = [];
  for (const list of SECTOR_LISTS) {
    for (let rank = 1; rank <= MAX_SECTOR_RANK; rank++) {
      const dimA = String(formData.get(`${list}-${rank}-dimA`) ?? "");
      const valA = String(formData.get(`${list}-${rank}-valA`) ?? "");
      const dimB = String(formData.get(`${list}-${rank}-dimB`) ?? "");
      const valB = String(formData.get(`${list}-${rank}-valB`) ?? "");
      if (!dimA && !valA && !dimB && !valB) continue; // empty slot — skipped, not an error
      if (!isValidSectorPick(dimA, valA, dimB, valB)) {
        return { error: `El sector en la posición ${rank} de "${list}" no es válido — elige dos dimensiones distintas con un valor cada una.` };
      }
      rows.push({ list, rank, dimA, valA, dimB, valB });
    }
  }
  if (rows.length === 0) return { error: "Nombra al menos un sector en alguna de las dos listas." };

  await prisma.$transaction([
    prisma.analyticsRecommendation.deleteMany({ where: { teamId, day } }),
    ...rows.map((r) => prisma.analyticsRecommendation.create({ data: { teamId, day, ...r } })),
  ]);

  revalidatePath(`/day/${day}`);
  revalidatePath(`/admin/day/${day}`);
  return { success: true };
}
