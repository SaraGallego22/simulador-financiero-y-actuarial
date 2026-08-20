"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { auth } from "./auth";
import { getOrCreateActiveCohort } from "./cohort";
import { SOFT_SKILL_COMPETENCIES, SOFT_SKILL_RATINGS, isValidSoftSkillActivity } from "./softSkills";
import { INTERVIEW_SKILLS } from "./interview";

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

/** For actions behind the "Talento Humano" nav section (entrevista + habilidades blandas) — reachable by both ADMIN and ADMIN_TH, unlike everything else in this file. */
async function requireAdminOrTH() {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "ADMIN_TH")) throw new Error("No autorizado");
  return session;
}

export async function createTeamAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || password.length < 8) {
    return { error: "Usuario y una contraseña de al menos 8 caracteres son obligatorios." };
  }

  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) return { error: `El usuario "${username}" ya existe.` };

  const cohort = await getOrCreateActiveCohort();
  const teamCount = await prisma.team.count({ where: { cohortId: cohort.id } });

  // The admin only sets up login credentials — the team picks its own name later (see updateTeamNameAction).
  let suffix = teamCount + 1;
  let name = `Equipo ${suffix}`;
  while (await prisma.team.findUnique({ where: { cohortId_name: { cohortId: cohort.id, name } } })) {
    suffix++;
    name = `Equipo ${suffix}`;
  }

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
      objectiveMode: String(formData.get("objectiveMode")),
      tolerancePerfect: Number(formData.get("tolerancePerfect")),
      toleranceZero: Number(formData.get("toleranceZero")),
    },
    create: {
      cohortId: cohort.id,
      subjectiveWeight: Number(formData.get("subjectiveWeight")),
      actuarialWeight: Number(formData.get("actuarialWeight")),
      objectiveMode: String(formData.get("objectiveMode")),
      tolerancePerfect: Number(formData.get("tolerancePerfect")),
      toleranceZero: Number(formData.get("toleranceZero")),
    },
  });

  revalidatePath("/admin/config");
}

/**
 * Sets how many days teams can currently see (Cohort.openDay, 1-4) — the
 * gate TeamNav/dashboard/day pages check before rendering a day's content
 * for a TEAM session, and the sole gate on when that day's results/grades
 * become visible to teams.
 */
export async function updateOpenDayAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const cohort = await getOrCreateActiveCohort();
  const openDay = Math.max(1, Math.min(4, Number(formData.get("openDay")) || 1));
  await prisma.cohort.update({ where: { id: cohort.id }, data: { openDay } });
  revalidatePath("/admin/config");
  revalidatePath("/dashboard");
  revalidatePath("/day/[n]", "page");
}

export interface UploadRosterState {
  error?: string;
  success?: string;
}

export async function uploadRosterAction(_prev: UploadRosterState, formData: FormData): Promise<UploadRosterState> {
  await requireAdmin();
  const { parseCsv, decodeCsvText } = await import("./csv");
  const { rosterCsvSchema } = await import("./csvSchemas");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo CSV." };
  const text = decodeCsvText(await file.arrayBuffer());
  const { rows, errors } = parseCsv(text, rosterCsvSchema);
  if (rows.length === 0) return { error: errors[0]?.message ?? "No se reconoció ninguna fila válida." };

  const cohort = await getOrCreateActiveCohort();
  const teams = await prisma.team.findMany({ where: { cohortId: cohort.id } });
  const teamByLowerName = new Map(teams.map((t) => [t.name.toLowerCase(), t]));

  let created = 0;
  let updated = 0;
  const unmatched: string[] = [];
  for (const row of rows) {
    const team = teamByLowerName.get(row.equipo.toLowerCase());
    if (!team) {
      unmatched.push(row.equipo);
      continue;
    }
    // Blank cells stay null rather than overwriting a previously-set value with "" —
    // lets a re-upload that only fills in some rows' academic background not wipe others.
    const academicData = {
      ...(row.carrera && { carrera: row.carrera }),
      ...(row.universidad && { universidad: row.universidad }),
      ...(row.semestre && { semestre: row.semestre }),
    };
    const existing = await prisma.teamMember.findFirst({ where: { teamId: team.id, name: row.nombre } });
    if (existing) {
      if (Object.keys(academicData).length > 0) {
        await prisma.teamMember.update({ where: { id: existing.id }, data: academicData });
        updated++;
      }
      continue;
    }
    await prisma.teamMember.create({ data: { teamId: team.id, name: row.nombre, ...academicData } });
    created++;
  }

  revalidatePath("/admin/config");
  revalidatePath("/admin/entrevista");
  const parts = [`${created} integrante(s) creados.`];
  if (updated > 0) parts.push(`${updated} actualizados.`);
  if (unmatched.length > 0) parts.push(`Equipos no encontrados: ${[...new Set(unmatched)].join(", ")}.`);
  return { success: parts.join(" ") };
}

const EVALUATION_PROFILES = ["ACTUARIAL", "FINANCIERO", "GENERALISTA"] as const;

/**
 * Upserts one member's subjective evaluation for a day — Nota general (1-5,
 * clamped), Aprobó (independent checkbox), Perfil (categorical). Comments are
 * tracked separately (see addMemberCommentAction) — several evaluators can
 * each leave their own, instead of one field the next save overwrites. Día 1
 * has no subjective grade (see MemberDayEvaluation's doc comment) — rejected
 * here, not just hidden in the UI.
 */
export async function submitMemberEvaluationAction(teamMemberId: string, day: number, formData: FormData): Promise<void> {
  await requireAdmin();
  if (day < 2 || day > 4) return;
  const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
  if (!member) return;

  const rawNota = formData.get("notaGeneral");
  const notaGeneral =
    rawNota != null && rawNota !== "" && Number.isFinite(Number(rawNota))
      ? Math.max(1, Math.min(5, Number(rawNota)))
      : null;
  const rawAprobado = String(formData.get("aprobado") ?? "");
  const aprobado = rawAprobado === "true" ? true : rawAprobado === "false" ? false : null;
  const rawPerfil = String(formData.get("perfil") ?? "");
  const perfil = (EVALUATION_PROFILES as readonly string[]).includes(rawPerfil)
    ? (rawPerfil as (typeof EVALUATION_PROFILES)[number])
    : null;

  await prisma.memberDayEvaluation.upsert({
    where: { teamMemberId_day: { teamMemberId, day } },
    update: { notaGeneral, aprobado, perfil },
    create: { teamMemberId, day, notaGeneral, aprobado, perfil },
  });
  revalidatePath(`/admin/day/${day}`);
}

/** Standalone checkpoint, independent of the nota/aprobado/perfil form above — one click toggles it, no separate "Guardar" (see MemberDayEvaluation.aptitudesRiesgos's doc comment). */
export async function toggleAptitudesRiesgosAction(teamMemberId: string, day: number): Promise<void> {
  await requireAdmin();
  if (day < 2 || day > 4) return;
  const existing = await prisma.memberDayEvaluation.findUnique({ where: { teamMemberId_day: { teamMemberId, day } } });
  await prisma.memberDayEvaluation.upsert({
    where: { teamMemberId_day: { teamMemberId, day } },
    update: { aptitudesRiesgos: !(existing?.aptitudesRiesgos ?? false) },
    create: { teamMemberId, day, aptitudesRiesgos: true },
  });
  revalidatePath(`/admin/day/${day}`);
}

/**
 * Adds one dated, authored comment for a member/day — never overwrites an
 * existing one, so multiple evaluators can weigh in independently. Also
 * upserts a bare MemberDayEvaluation row if none exists yet, so a
 * comment-only member still shows up alongside members who already have a
 * scored evaluation for this day.
 */
export async function addMemberCommentAction(teamMemberId: string, day: number, formData: FormData): Promise<void> {
  await requireAdmin();
  if (day < 2 || day > 4) return;

  const author = String(formData.get("author") ?? "").trim();
  const text = String(formData.get("text") ?? "").trim();
  if (!author || !text) return;

  await prisma.memberDayEvaluation.upsert({
    where: { teamMemberId_day: { teamMemberId, day } },
    update: {},
    create: { teamMemberId, day },
  });
  await prisma.memberComment.create({ data: { teamMemberId, day, author, text } });
  revalidatePath(`/admin/day/${day}`);
}

export async function deleteMemberCommentAction(commentId: string, day: number): Promise<void> {
  await requireAdmin();
  await prisma.memberComment.delete({ where: { id: commentId } });
  revalidatePath(`/admin/day/${day}`);
}

/**
 * Removes a participant who dropped out of the challenge. Deletes the
 * TeamMember row, cascading to their MemberDayEvaluation and MemberComment
 * rows (see schema's onDelete: Cascade) — since notaSubjetivaEquipo
 * (consolidado.ts) averages live over `team.members` on every read, this is
 * enough for them to stop being counted in the team's subjective grade, for
 * every day, immediately.
 */
export async function deleteTeamMemberAction(teamMemberId: string, day: number): Promise<void> {
  await requireAdmin();
  await prisma.teamMember.delete({ where: { id: teamMemberId } });
  revalidatePath(`/admin/day/${day}`);
  revalidatePath("/admin/config");
}

/**
 * Upserts one member's 8 competency ratings for a soft-skills activity in one
 * submit — a blank/unrecognized select clears that competency's row instead
 * of writing a null rating (SoftSkillRating has no "sin definir" value).
 */
export async function submitSoftSkillEvaluationAction(teamMemberId: string, activity: number, formData: FormData): Promise<void> {
  await requireAdminOrTH();
  if (!isValidSoftSkillActivity(activity)) return;
  const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
  if (!member) return;

  await Promise.all(
    SOFT_SKILL_COMPETENCIES.map((competency) => {
      const raw = String(formData.get(`rating_${competency}`) ?? "");
      const rating = (SOFT_SKILL_RATINGS as readonly string[]).includes(raw) ? (raw as (typeof SOFT_SKILL_RATINGS)[number]) : null;
      return rating
        ? prisma.softSkillEvaluation.upsert({
            where: { teamMemberId_activity_competency: { teamMemberId, activity, competency } },
            update: { rating },
            create: { teamMemberId, activity, competency, rating },
          })
        : prisma.softSkillEvaluation.deleteMany({ where: { teamMemberId, activity, competency } });
    })
  );
  revalidatePath(`/admin/actividad/${activity}`);
}

/** Adds one dated remark for a member/activity — author is always "Equipo TH" (see softSkills.ts), never taken from the form. */
export async function addSoftSkillCommentAction(teamMemberId: string, activity: number, formData: FormData): Promise<void> {
  await requireAdminOrTH();
  if (!isValidSoftSkillActivity(activity)) return;
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  await prisma.softSkillComment.create({ data: { teamMemberId, activity, text } });
  revalidatePath(`/admin/actividad/${activity}`);
}

export async function deleteSoftSkillCommentAction(commentId: string, activity: number): Promise<void> {
  await requireAdminOrTH();
  await prisma.softSkillComment.delete({ where: { id: commentId } });
  revalidatePath(`/admin/actividad/${activity}`);
}

/**
 * Upserts one member's Excel/Programación ratings from the TH interview in
 * one submit — same blank-clears-the-row behavior as
 * submitSoftSkillEvaluationAction (SoftSkillRating has no "sin definir" value).
 */
export async function submitInterviewSkillsAction(teamMemberId: string, formData: FormData): Promise<void> {
  await requireAdminOrTH();
  const member = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
  if (!member) return;

  await Promise.all(
    INTERVIEW_SKILLS.map((skill) => {
      const raw = String(formData.get(`rating_${skill}`) ?? "");
      const rating = (SOFT_SKILL_RATINGS as readonly string[]).includes(raw) ? (raw as (typeof SOFT_SKILL_RATINGS)[number]) : null;
      return rating
        ? prisma.interviewSkillRating.upsert({
            where: { teamMemberId_skill: { teamMemberId, skill } },
            update: { rating },
            create: { teamMemberId, skill, rating },
          })
        : prisma.interviewSkillRating.deleteMany({ where: { teamMemberId, skill } });
    })
  );
  revalidatePath("/admin/entrevista");
}

/** Adds one dated remark from the TH interview — author is always "Equipo TH" (see interview.ts), never taken from the form. */
export async function addInterviewCommentAction(teamMemberId: string, formData: FormData): Promise<void> {
  await requireAdminOrTH();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  await prisma.interviewComment.create({ data: { teamMemberId, text } });
  revalidatePath("/admin/entrevista");
}

export async function deleteInterviewCommentAction(commentId: string): Promise<void> {
  await requireAdminOrTH();
  await prisma.interviewComment.delete({ where: { id: commentId } });
  revalidatePath("/admin/entrevista");
}

export interface UploadMemberPhotoState {
  error?: string;
  success?: string;
}

// Keeps bytea reads fast — see CLAUDE.md's ~0.4-0.5 MB/s ceiling on Neon's free tier; a headshot has no reason to approach this anyway.
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

/** Stores a member's headshot directly as bytea (see TeamMember.photo's doc comment) — no resizing/cropping, uploaded as-is. */
export async function uploadMemberPhotoAction(teamMemberId: string, _prev: UploadMemberPhotoState, formData: FormData): Promise<UploadMemberPhotoState> {
  await requireAdmin();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona una imagen." };
  if (!file.type.startsWith("image/")) return { error: "El archivo debe ser una imagen." };
  if (file.size > MAX_PHOTO_BYTES) return { error: "La imagen no puede superar 2 MB." };

  const buffer = Buffer.from(await file.arrayBuffer());
  await prisma.teamMember.update({ where: { id: teamMemberId }, data: { photo: buffer, photoMimeType: file.type } });

  revalidatePath("/admin/config");
  revalidatePath("/admin/day/[n]", "page");
  revalidatePath("/admin/actividad/[n]", "page");
  return { success: "Foto actualizada." };
}

/** Single note per team/activity — each save overwrites the previous text (see TeamActivityNote's doc comment). */
export async function upsertTeamActivityNoteAction(teamId: string, activity: number, formData: FormData): Promise<void> {
  await requireAdminOrTH();
  if (!isValidSoftSkillActivity(activity)) return;
  const text = String(formData.get("text") ?? "").trim();
  await prisma.teamActivityNote.upsert({
    where: { teamId_activity: { teamId, activity } },
    update: { text },
    create: { teamId, activity, text },
  });
  revalidatePath(`/admin/actividad/${activity}`);
}
