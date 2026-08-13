import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { memberPhotoDataUri } from "@/lib/memberPhoto";
import { MemberPhoto } from "@/components/MemberPhoto";
import { TeamSelect } from "@/components/TeamSelect";
import type { InterviewSkill } from "@/lib/interview";
import type { SoftSkillRating } from "@/lib/softSkills";
import { InterviewSkillsForm } from "./InterviewSkillsForm";
import { InterviewComments } from "./InterviewComments";

// Never statically prerender — see admin/standings/page.tsx.
export const dynamic = "force-dynamic";

export default async function AdminInterviewPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const { team: selectedTeamId } = await searchParams;
  const cohort = await getOrCreateActiveCohort();

  const [teams, ratings, comments] = await Promise.all([
    prisma.team.findMany({
      where: { cohortId: cohort.id },
      include: { members: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.interviewSkillRating.findMany({ where: { teamMember: { team: { cohortId: cohort.id } } } }),
    prisma.interviewComment.findMany({
      where: { teamMember: { team: { cohortId: cohort.id } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const ratingsByMemberId = new Map<string, Partial<Record<InterviewSkill, SoftSkillRating>>>();
  for (const r of ratings) {
    if (!ratingsByMemberId.has(r.teamMemberId)) ratingsByMemberId.set(r.teamMemberId, {});
    ratingsByMemberId.get(r.teamMemberId)![r.skill as InterviewSkill] = r.rating as SoftSkillRating;
  }

  const commentsByMemberId = new Map<string, (typeof comments)[number][]>();
  for (const c of comments) {
    if (!commentsByMemberId.has(c.teamMemberId)) commentsByMemberId.set(c.teamMemberId, []);
    commentsByMemberId.get(c.teamMemberId)!.push(c);
  }

  // One team at a time (see TeamSelect's doc comment) — falls back to the
  // first team when no ?team= is selected or it doesn't match.
  const selectedTeam = teams.find((t) => t.id === selectedTeamId) ?? teams[0];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Entrevista individual
        </h1>
        <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">
          Espacio de TH para la conversación uno a uno con cada pasante: calificación en Excel y programación, y comentarios de la entrevista.
        </p>
      </div>

      {teams.length === 0 ? (
        <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5 text-sm text-[var(--color-brand-text-secondary)]">
          Este cohorte todavía no tiene equipos.
        </div>
      ) : (
        selectedTeam && (
          <>
            <TeamSelect teams={teams} selectedTeamId={selectedTeam.id} basePath="/admin/entrevista" />

            <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-8">
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
                    const memberRatings = ratingsByMemberId.get(member.id) ?? {};
                    const academic = [member.carrera, member.universidad, member.semestre && `${member.semestre} semestre`]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <div key={member.id} className="flex flex-col gap-4 rounded-lg border border-[var(--color-brand-gray-light)] p-5 sm:flex-row">
                        <div className="flex shrink-0 flex-col items-center gap-2 sm:w-40">
                          <MemberPhoto dataUri={memberPhotoDataUri(member.photo, member.photoMimeType)} name={member.name} size={120} />
                          <div className="text-center">
                            <p className="text-sm font-semibold text-[var(--color-foreground)]">{member.name}</p>
                            {academic && <p className="text-xs text-[var(--color-brand-text-secondary)]">{academic}</p>}
                          </div>
                        </div>
                        <div className="flex flex-1 flex-col gap-3">
                          <InterviewSkillsForm
                            // Same remount trick as SoftSkillEvaluationForm — see its doc comment.
                            key={`${member.id}:${Object.values(memberRatings).join(",")}`}
                            id={member.id}
                            initial={memberRatings}
                          />
                          <InterviewComments teamMemberId={member.id} comments={commentsByMemberId.get(member.id) ?? []} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )
      )}
    </main>
  );
}
