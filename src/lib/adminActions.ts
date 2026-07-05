"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { auth } from "./auth";
import { getOrCreateActiveCohort } from "./cohort";

const TEAM_COLORS = [
  "#0033A0",
  "#00AEC7",
  "#E3E829",
  "#007A50",
  "#D0021B",
  "#888B8D",
  "#5B2A86",
  "#F5821F",
  "#1B998B",
  "#C9184A",
  "#2E5266",
  "#8AA29E",
];

async function requireAdmin() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") throw new Error("No autorizado");
  return session;
}

export async function createTeamAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !username || password.length < 8) {
    return { error: "Nombre, usuario y una contraseña de al menos 8 caracteres son obligatorios." };
  }

  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) return { error: `El usuario "${username}" ya existe.` };

  const cohort = await getOrCreateActiveCohort();
  const teamCount = await prisma.team.count({ where: { cohortId: cohort.id } });

  const existingTeamName = await prisma.team.findUnique({
    where: { cohortId_name: { cohortId: cohort.id, name } },
  });
  if (existingTeamName) return { error: `Ya existe un equipo llamado "${name}" en esta cohorte.` };

  const team = await prisma.team.create({
    data: { cohortId: cohort.id, name, color: TEAM_COLORS[teamCount % TEAM_COLORS.length] },
  });

  await prisma.user.create({
    data: { username, passwordHash: await bcrypt.hash(password, 10), role: "TEAM", teamId: team.id },
  });

  revalidatePath("/admin/config");
  return {};
}

export async function deleteTeamAction(teamId: string): Promise<void> {
  await requireAdmin();
  await prisma.user.deleteMany({ where: { teamId } });
  await prisma.team.delete({ where: { id: teamId } });
  revalidatePath("/admin/config");
}

export async function updateRubricWeightsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const cohort = await getOrCreateActiveCohort();

  await prisma.rubricConfig.upsert({
    where: { cohortId: cohort.id },
    update: {
      subjectiveWeight: Number(formData.get("subjectiveWeight")),
      actuarialWeight: Number(formData.get("actuarialWeight")),
      maxScale: Number(formData.get("maxScale")),
      objectiveMode: String(formData.get("objectiveMode")),
      tolerancePerfect: Number(formData.get("tolerancePerfect")),
      toleranceZero: Number(formData.get("toleranceZero")),
    },
    create: {
      cohortId: cohort.id,
      subjectiveWeight: Number(formData.get("subjectiveWeight")),
      actuarialWeight: Number(formData.get("actuarialWeight")),
      maxScale: Number(formData.get("maxScale")),
      objectiveMode: String(formData.get("objectiveMode")),
      tolerancePerfect: Number(formData.get("tolerancePerfect")),
      toleranceZero: Number(formData.get("toleranceZero")),
    },
  });

  revalidatePath("/admin/config");
}

export async function addSkillAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const cohort = await getOrCreateActiveCohort();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const rubric = await prisma.rubricConfig.upsert({
    where: { cohortId: cohort.id },
    update: {},
    create: { cohortId: cohort.id },
  });

  await prisma.skill.create({ data: { rubricConfigId: rubric.id, name, weight: 1 } });
  revalidatePath("/admin/config");
}

export async function removeSkillAction(skillId: string): Promise<void> {
  await requireAdmin();
  await prisma.skill.delete({ where: { id: skillId } });
  revalidatePath("/admin/config");
}

export async function updateSkillWeightAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const skillId = String(formData.get("skillId"));
  const weight = Number(formData.get("weight"));
  if (!skillId || !Number.isFinite(weight)) return;
  await prisma.skill.update({ where: { id: skillId }, data: { weight } });
  revalidatePath("/admin/config");
}

export async function togglePublishedAction(teamSimResultId: string, day: number): Promise<void> {
  await requireAdmin();
  const current = await prisma.teamSimResult.findUnique({ where: { id: teamSimResultId } });
  if (!current) return;
  await prisma.teamSimResult.update({ where: { id: teamSimResultId }, data: { published: !current.published } });
  revalidatePath(`/admin/day/${day}`);
}

export async function publishAllAction(simulationRunId: string, day: number): Promise<void> {
  await requireAdmin();
  await prisma.teamSimResult.updateMany({ where: { simulationRunId }, data: { published: true } });
  revalidatePath(`/admin/day/${day}`);
}

/** Bulk-upserts one team's subjective Score per skill for a day (form fields named by skillId). */
export async function submitScoresAction(teamId: string, day: number, formData: FormData): Promise<void> {
  await requireAdmin();
  const cohort = await getOrCreateActiveCohort();
  const skills = await prisma.skill.findMany({ where: { rubricConfig: { cohortId: cohort.id } } });

  const rows: { skillId: string; value: number }[] = [];
  for (const skill of skills) {
    const raw = formData.get(skill.id);
    if (raw == null || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) rows.push({ skillId: skill.id, value });
  }

  await prisma.$transaction(
    rows.map((r) =>
      prisma.score.upsert({
        where: { teamId_skillId_day: { teamId, skillId: r.skillId, day } },
        update: { value: r.value },
        create: { teamId, skillId: r.skillId, day, value: r.value },
      })
    )
  );
  revalidatePath(`/admin/day/${day}`);
}

export async function toggleScoresPublishedAction(teamId: string, day: number): Promise<void> {
  await requireAdmin();
  const scores = await prisma.score.findMany({ where: { teamId, day } });
  if (scores.length === 0) return;
  const nextPublished = !scores[0].published;
  await prisma.score.updateMany({ where: { teamId, day }, data: { published: nextPublished } });
  revalidatePath(`/admin/day/${day}`);
}

export interface UploadRosterState {
  error?: string;
  success?: string;
}

export async function uploadRosterAction(_prev: UploadRosterState, formData: FormData): Promise<UploadRosterState> {
  await requireAdmin();
  const { parseCsv } = await import("./csv");
  const { rosterCsvSchema } = await import("./csvSchemas");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo CSV." };
  const text = await file.text();
  const { rows, errors } = parseCsv(text, rosterCsvSchema);
  if (rows.length === 0) return { error: errors[0]?.message ?? "No se reconoció ninguna fila válida." };

  const cohort = await getOrCreateActiveCohort();
  const teams = await prisma.team.findMany({ where: { cohortId: cohort.id } });
  const teamByLowerName = new Map(teams.map((t) => [t.name.toLowerCase(), t]));

  let created = 0;
  const unmatched: string[] = [];
  for (const row of rows) {
    const team = teamByLowerName.get(row.equipo.toLowerCase());
    if (!team) {
      unmatched.push(row.equipo);
      continue;
    }
    const existing = await prisma.teamMember.findFirst({ where: { teamId: team.id, name: row.nombre } });
    if (existing) continue;
    await prisma.teamMember.create({ data: { teamId: team.id, name: row.nombre } });
    created++;
  }

  revalidatePath("/admin/config");
  if (unmatched.length > 0) {
    return { success: `${created} integrante(s) creados. Equipos no encontrados: ${[...new Set(unmatched)].join(", ")}.` };
  }
  return { success: `${created} integrante(s) creados.` };
}

/** Bulk-upserts one member's subjective MemberScore per skill for a day (form fields named by skillId). */
export async function submitMemberScoresAction(teamMemberId: string, day: number, formData: FormData): Promise<void> {
  await requireAdmin();
  const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId }, include: { team: true } });
  if (!member) return;
  const skills = await prisma.skill.findMany({ where: { rubricConfig: { cohortId: member.team.cohortId } } });

  const rows: { skillId: string; value: number }[] = [];
  for (const skill of skills) {
    const raw = formData.get(skill.id);
    if (raw == null || raw === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) rows.push({ skillId: skill.id, value });
  }

  await prisma.$transaction(
    rows.map((r) =>
      prisma.memberScore.upsert({
        where: { teamMemberId_skillId_day: { teamMemberId, skillId: r.skillId, day } },
        update: { value: r.value },
        create: { teamMemberId, skillId: r.skillId, day, value: r.value },
      })
    )
  );
  revalidatePath(`/admin/day/${day}`);
}
