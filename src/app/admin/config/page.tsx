import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { updateRubricWeightsAction, updateOpenDayAction } from "@/lib/adminActions";
import { memberPhotoDataUri } from "@/lib/memberPhoto";
import { MemberPhoto } from "@/components/MemberPhoto";
import { CreateTeamForm } from "./CreateTeamForm";
import { DeleteTeamButton } from "./DeleteTeamButton";
import { RosterUpload } from "./RosterUpload";
import { MemberPhotoUpload } from "./MemberPhotoUpload";

export default async function ConfigPage() {
  const cohort = await getOrCreateActiveCohort();

  const [teams, rubric, membersByTeam] = await Promise.all([
    prisma.team.findMany({
      where: { cohortId: cohort.id },
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.rubricConfig.upsert({
      where: { cohortId: cohort.id },
      update: {},
      create: { cohortId: cohort.id },
    }),
    prisma.team.findMany({
      where: { cohortId: cohort.id },
      select: { id: true, name: true, color: true, members: { orderBy: { name: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Configuración
        </h1>
        <p className="text-sm text-[var(--color-brand-text-secondary)]">
          Cohorte activa: <strong>{cohort.name}</strong>
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-condensed)] text-lg font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Equipos
        </h2>

        <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-brand-blue)] text-left text-white">
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Usuario</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {teams.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-4 text-center text-[var(--color-brand-text-secondary)]">
                    Aún no hay equipos creados.
                  </td>
                </tr>
              )}
              {teams.map((team) => (
                <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                  <td className="px-4 py-2">
                    <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                    {team.name}
                  </td>
                  <td className="px-4 py-2 text-[var(--color-brand-text-secondary)]">{team.user?.username ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <DeleteTeamButton teamId={team.id} teamName={team.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CreateTeamForm />
        <RosterUpload />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-condensed)] text-lg font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Integrantes
        </h2>
        <p className="text-sm text-[var(--color-brand-text-secondary)]">
          Foto de cada integrante — se muestra junto a su nombre en la calificación subjetiva y en las actividades de habilidades blandas.
        </p>

        <div className="flex flex-col gap-4">
          {membersByTeam.map((team) => (
            <div key={team.id} className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-4">
              <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                {team.name}
              </h3>
              {team.members.length === 0 ? (
                <p className="text-sm text-[var(--color-brand-text-secondary)]">Sin integrantes cargados aún.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {team.members.map((member) => (
                    <div key={member.id} className="flex flex-wrap items-center gap-3">
                      <MemberPhoto dataUri={memberPhotoDataUri(member.photo, member.photoMimeType)} name={member.name} size={48} />
                      <span className="min-w-[120px] text-sm text-[var(--color-foreground)]">{member.name}</span>
                      <MemberPhotoUpload teamMemberId={member.id} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-condensed)] text-lg font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Progreso del reto
        </h2>
        <p className="text-sm text-[var(--color-brand-text-secondary)]">
          Los equipos solo ven los días hasta este número. Súbelo a medida que avanza el reto.
        </p>

        <form action={updateOpenDayAction} className="flex items-end gap-3 rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
          <label className="flex flex-col gap-1 text-sm text-[var(--color-foreground)]">
            Día visible para los equipos
            <select name="openDay" defaultValue={cohort.openDay} className="rounded border border-[var(--color-brand-gray-light)] px-3 py-2 text-sm">
              <option value={1}>Día 1</option>
              <option value={2}>Día 2</option>
              <option value={3}>Día 3</option>
              <option value={4}>Día 4</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded bg-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-blue-dark)]"
          >
            Guardar
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-condensed)] text-lg font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Rúbrica de evaluación
        </h2>

        <form action={updateRubricWeightsAction} className="grid grid-cols-1 gap-4 rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-[var(--color-foreground)]">
            Peso subjetivo (0-1)
            <input
              name="subjectiveWeight"
              type="number"
              step="0.01"
              min="0"
              max="1"
              defaultValue={rubric.subjectiveWeight}
              className="rounded border border-[var(--color-brand-gray-light)] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--color-foreground)]">
            Peso actuarial dentro de lo objetivo (0-1)
            <input
              name="actuarialWeight"
              type="number"
              step="0.01"
              min="0"
              max="1"
              defaultValue={rubric.actuarialWeight}
              className="rounded border border-[var(--color-brand-gray-light)] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--color-foreground)]">
            Modo de normalización objetiva
            <select name="objectiveMode" defaultValue={rubric.objectiveMode} className="rounded border border-[var(--color-brand-gray-light)] px-3 py-2 text-sm">
              <option value="relative">Relativa (percentil 10-90)</option>
              <option value="ranking">Ranking (posición)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--color-foreground)]">
            Tolerancia para 100 (error ≤)
            <input
              name="tolerancePerfect"
              type="number"
              step="0.01"
              min="0"
              max="1"
              defaultValue={rubric.tolerancePerfect}
              className="rounded border border-[var(--color-brand-gray-light)] px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--color-foreground)]">
            Tolerancia para 0 (error ≥)
            <input
              name="toleranceZero"
              type="number"
              step="0.01"
              min="0"
              max="1"
              defaultValue={rubric.toleranceZero}
              className="rounded border border-[var(--color-brand-gray-light)] px-3 py-2 text-sm"
            />
          </label>

          <div className="sm:col-span-2">
            <button
              type="submit"
              className="rounded bg-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-blue-dark)]"
            >
              Guardar pesos
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
