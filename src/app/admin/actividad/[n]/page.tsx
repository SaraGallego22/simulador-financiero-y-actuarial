import { auth } from "@/lib/auth";
import { getCohortForSession, getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_TITLES, isValidSoftSkillActivity, SOFT_SKILL_COMPETENCIES } from "@/lib/softSkills";
import type { SoftSkillCompetency, SoftSkillRating } from "@/lib/softSkills";
import { memberPhotoDataUri } from "@/lib/memberPhoto";
import { MemberPhoto } from "@/components/MemberPhoto";
import { TeamSelect } from "@/components/TeamSelect";
import { SoftSkillEvaluationForm } from "./SoftSkillEvaluationForm";
import { SoftSkillComments } from "./SoftSkillComments";
import { TeamActivityNoteForm } from "./TeamActivityNoteForm";
import { notFound } from "next/navigation";

// Never statically prerender — see admin/standings/page.tsx.
export const dynamic = "force-dynamic";

export default async function AdminActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ n: string }>;
  searchParams: Promise<{ team?: string }>;
}) {
  const { n } = await params;
  const activity = Number(n);
  if (!isValidSoftSkillActivity(activity)) notFound();

  const { team: selectedTeamId } = await searchParams;
  const session = await auth();
  const cohort = session ? await getCohortForSession(session) : await getOrCreateActiveCohort();

  const [teams, evaluations, comments, notes] = await Promise.all([
    prisma.team.findMany({
      where: { cohortId: cohort.id },
      include: {
        // Explicitly WITHOUT the `photo`/`photoMimeType` bytea columns: only
        // the selected team's headshots are rendered, so they're fetched
        // separately below instead of for all ~12 teams on every load (same
        // reason as admin/day/[n]).
        members: { select: { id: true, name: true, carrera: true, universidad: true, semestre: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.softSkillEvaluation.findMany({
      where: { activity, teamMember: { team: { cohortId: cohort.id } } },
    }),
    prisma.softSkillComment.findMany({
      where: { activity, teamMember: { team: { cohortId: cohort.id } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.teamActivityNote.findMany({ where: { activity, team: { cohortId: cohort.id } } }),
  ]);

  const ratingsByMemberId = new Map<string, Partial<Record<SoftSkillCompetency, SoftSkillRating>>>();
  for (const e of evaluations) {
    if (!ratingsByMemberId.has(e.teamMemberId)) ratingsByMemberId.set(e.teamMemberId, {});
    ratingsByMemberId.get(e.teamMemberId)![e.competency as SoftSkillCompetency] = e.rating as SoftSkillRating;
  }

  const commentsByMemberId = new Map<string, (typeof comments)[number][]>();
  for (const c of comments) {
    if (!commentsByMemberId.has(c.teamMemberId)) commentsByMemberId.set(c.teamMemberId, []);
    commentsByMemberId.get(c.teamMemberId)!.push(c);
  }

  const noteByTeamId = new Map(notes.map((note) => [note.teamId, note.text]));

  // One team at a time (see TeamSelect's doc comment) — falls back to the
  // first team when no ?team= is selected or it doesn't match.
  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? teams[0];
  // Headshots for just that one team — the cohort-wide `teams` query above
  // deliberately omits the `photo` bytea (see its comment). Keyed by member id.
  const photoByMemberId = new Map<string, string | null>(
    selectedTeam
      ? (
          await prisma.teamMember.findMany({
            where: { teamId: selectedTeam.id },
            select: { id: true, photo: true, photoMimeType: true },
          })
        ).map((m) => [m.id, memberPhotoDataUri(m.photo, m.photoMimeType)])
      : []
  );
  // Plain fields only — see TeamSelect's doc comment on why the full `teams`
  // query result (nested members' Bytes photo columns) can't cross into a
  // Client Component prop.
  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name, color: t.color }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          {ACTIVITY_TITLES[activity]} — Habilidades blandas
        </h1>
        <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">
          Evaluación cualitativa por integrante en 8 competencias, uso interno de Equipo TH.
        </p>
      </div>

      {teams.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5 text-sm text-[var(--color-brand-text-secondary)]">
          Este cohorte todavía no tiene equipos.
        </div>
      ) : (
        selectedTeam && (
          <>
            <TeamSelect teams={teamOptions} selectedTeamId={selectedTeam.id} basePath={`/admin/actividad/${activity}`} />

            <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-8">
              <h3 className="mb-6 font-[family-name:var(--font-condensed)] text-lg font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: selectedTeam.color }} />
                {selectedTeam.name}
              </h3>

              {selectedTeam.members.length === 0 ? (
                <p className="text-sm text-[var(--color-brand-text-secondary)]">
                  Este equipo no tiene integrantes cargados. Sube el{" "}
                  <a href="/admin/config" className="text-[var(--color-brand-blue-accent)] underline">
                    roster
                  </a>{" "}
                  primero.
                </p>
              ) : (
                <div className="flex flex-col gap-6">
                  {selectedTeam.members.map((member) => {
                    const ratings = ratingsByMemberId.get(member.id) ?? {};
                    // Same line as the entrevista view — any of the three roster
                    // columns can be missing.
                    const academic = [member.carrera, member.universidad, member.semestre && `Prácticas en ${member.semestre}`]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div key={member.id} className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] p-5 sm:flex-row">
                        <div className="flex shrink-0 flex-col items-center gap-2 sm:w-40">
                          <MemberPhoto dataUri={photoByMemberId.get(member.id) ?? null} name={member.name} size={120} />
                          <div className="text-center">
                            <p className="text-sm font-semibold text-[var(--color-foreground)]">{member.name}</p>
                            {academic && <p className="text-xs text-[var(--color-brand-text-secondary)]">{academic}</p>}
                          </div>
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-3">
                          <SoftSkillEvaluationForm
                            // Same remount trick as MemberEvaluationForm — see its doc comment.
                            // Built from SOFT_SKILL_COMPETENCIES (a fixed order), not
                            // Object.values(ratings): the evaluations query below has no
                            // orderBy, so Postgres can return a member's own rows in a
                            // different order between requests even with no writes at all —
                            // that flipped this key for members who weren't being saved,
                            // remounting their form and wiping their in-progress (unsaved)
                            // selections back to whatever was last persisted.
                            key={`${member.id}:${SOFT_SKILL_COMPETENCIES.map((c) => ratings[c] ?? "").join(",")}`}
                            id={member.id}
                            activity={activity}
                            initial={ratings}
                          />
                          <SoftSkillComments teamMemberId={member.id} activity={activity} comments={commentsByMemberId.get(member.id) ?? []} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-6 border-t border-[var(--color-brand-gray-light)] pt-4">
                <TeamActivityNoteForm
                  key={`${selectedTeam.id}:${noteByTeamId.get(selectedTeam.id) ?? ""}`}
                  teamId={selectedTeam.id}
                  activity={activity}
                  initialText={noteByTeamId.get(selectedTeam.id) ?? ""}
                />
              </div>
            </div>
          </>
        )
      )}
    </main>
  );
}
