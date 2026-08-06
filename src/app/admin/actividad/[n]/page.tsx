import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_TITLES, isValidSoftSkillActivity } from "@/lib/softSkills";
import type { SoftSkillCompetency, SoftSkillRating } from "@/lib/softSkills";
import { memberPhotoDataUri } from "@/lib/memberPhoto";
import { MemberPhoto } from "@/components/MemberPhoto";
import { SoftSkillEvaluationForm } from "./SoftSkillEvaluationForm";
import { SoftSkillComments } from "./SoftSkillComments";
import { TeamActivityNoteForm } from "./TeamActivityNoteForm";
import { notFound } from "next/navigation";

// Never statically prerender — see admin/standings/page.tsx.
export const dynamic = "force-dynamic";

export default async function AdminActivityPage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const activity = Number(n);
  if (!isValidSoftSkillActivity(activity)) notFound();

  const cohort = await getOrCreateActiveCohort();

  const [teams, evaluations, comments, notes] = await Promise.all([
    prisma.team.findMany({
      where: { cohortId: cohort.id },
      include: { members: true },
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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          {ACTIVITY_TITLES[activity]} — Habilidades blandas
        </h1>
        <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">
          Evaluación cualitativa por integrante en 8 competencias, uso interno de Equipo TH.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {teams.map((team) => {
          const noteText = noteByTeamId.get(team.id) ?? "";
          return (
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
                    const ratings = ratingsByMemberId.get(member.id) ?? {};
                    return (
                      <div key={member.id} className="flex gap-3">
                        <MemberPhoto dataUri={memberPhotoDataUri(member.photo, member.photoMimeType)} name={member.name} size={72} />
                        <div className="flex flex-1 flex-col gap-2">
                          <p className="text-xs font-semibold text-[var(--color-brand-text-secondary)]">{member.name}</p>
                          <SoftSkillEvaluationForm
                            // Same remount trick as MemberEvaluationForm — see its doc comment.
                            key={`${member.id}:${Object.values(ratings).join(",")}`}
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

              <div className="mt-3 border-t border-[var(--color-brand-gray-light)] pt-3">
                <TeamActivityNoteForm key={`${team.id}:${noteText}`} teamId={team.id} activity={activity} initialText={noteText} />
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
