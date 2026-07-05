"use server";

import { revalidatePath } from "next/cache";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { parseCsv } from "./csv";
import { portfolioCsvSchema } from "./csvSchemas";

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
