import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { memberPhotoDataUri } from "@/lib/memberPhoto";
import { MemberPhoto } from "@/components/MemberPhoto";
import type { InterviewSkill } from "@/lib/interview";
import type { SoftSkillRating } from "@/lib/softSkills";
import { InterviewSkillsForm } from "./InterviewSkillsForm";
import { InterviewComments } from "./InterviewComments";

// Never statically prerender — see admin/standings/page.tsx.
export const dynamic = "force-dynamic";

export default async function AdminInterviewPage() {
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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Entrevista individual
        </h1>
        <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">
          Espacio de TH para la conversación uno a uno con cada pasante: calificación en Excel y programación, y comentarios de la entrevista.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {teams.map((team) => (
          <div key={team.id} className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
            <h3 className="mb-3 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
              {team.name}
            </h3>

            {team.members.length === 0 ? (
              <p className="text-sm text-[var(--color-brand-text-secondary)]">
                Este equipo no tiene integrantes cargados. Sube el{" "}
                <a href="/admin/config" className="text-[var(--color-brand-blue-accent)] underline">
                  roster
                </a>{" "}
                primero.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {team.members.map((member) => {
                  const memberRatings = ratingsByMemberId.get(member.id) ?? {};
                  const academic = [member.carrera, member.universidad, member.semestre && `${member.semestre} semestre`]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div key={member.id} className="flex gap-3">
                      <MemberPhoto dataUri={memberPhotoDataUri(member.photo, member.photoMimeType)} name={member.name} size={72} />
                      <div className="flex flex-1 flex-col gap-2">
                        <div>
                          <p className="text-xs font-semibold text-[var(--color-brand-text-secondary)]">{member.name}</p>
                          {academic && <p className="text-xs text-[var(--color-brand-text-secondary)]">{academic}</p>}
                        </div>
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
        ))}
      </div>
    </main>
  );
}
