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
