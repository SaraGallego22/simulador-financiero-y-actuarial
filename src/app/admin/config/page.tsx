import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { addSkillAction, removeSkillAction, updateRubricWeightsAction, updateSkillWeightAction } from "@/lib/adminActions";
import { CreateTeamForm } from "./CreateTeamForm";
import { DeleteTeamButton } from "./DeleteTeamButton";

export default async function ConfigPage() {
  const cohort = await getOrCreateActiveCohort();

  const [teams, rubric] = await Promise.all([
    prisma.team.findMany({
      where: { cohortId: cohort.id },
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.rubricConfig.upsert({
      where: { cohortId: cohort.id },
      update: {},
      create: { cohortId: cohort.id },
      include: { skills: { orderBy: { name: "asc" } } },
    }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-8">
      <div>
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          Configuración
        </h1>
        <p className="text-sm text-gray-600">
          Cohorte activa: <strong>{cohort.name}</strong>
        </p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-condensed)] text-lg font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          Equipos
        </h2>

        <div className="overflow-x-auto rounded-lg border border-[var(--color-brand-gray-light)] bg-white">
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
                  <td colSpan={3} className="px-4 py-4 text-center text-gray-500">
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
                  <td className="px-4 py-2 text-gray-600">{team.user?.username ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <DeleteTeamButton teamId={team.id} teamName={team.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CreateTeamForm />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-[family-name:var(--font-condensed)] text-lg font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          Rúbrica de evaluación
        </h2>

        <form action={updateRubricWeightsAction} className="grid grid-cols-1 gap-4 rounded-lg border border-[var(--color-brand-gray-light)] bg-white p-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            Peso subjetivo (0-1)
            <input
              name="subjectiveWeight"
              type="number"
              step="0.01"
              min="0"
              max="1"
              defaultValue={rubric.subjectiveWeight}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            Peso actuarial dentro de lo objetivo (0-1)
            <input
              name="actuarialWeight"
              type="number"
              step="0.01"
              min="0"
              max="1"
              defaultValue={rubric.actuarialWeight}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            Escala máxima de la rúbrica
            <input
              name="maxScale"
              type="number"
              step="1"
              min="1"
              defaultValue={rubric.maxScale}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            Modo de normalización objetiva
            <select name="objectiveMode" defaultValue={rubric.objectiveMode} className="rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="relative">Relativa (percentil 10-90)</option>
              <option value="ranking">Ranking (posición)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            Tolerancia para 100 (error ≤)
            <input
              name="tolerancePerfect"
              type="number"
              step="0.01"
              min="0"
              max="1"
              defaultValue={rubric.tolerancePerfect}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            Tolerancia para 0 (error ≥)
            <input
              name="toleranceZero"
              type="number"
              step="0.01"
              min="0"
              max="1"
              defaultValue={rubric.toleranceZero}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
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

        <div className="rounded-lg border border-[var(--color-brand-gray-light)] bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Habilidades blandas</h3>
          <div className="flex flex-col gap-2">
            {rubric.skills.map((skill) => (
              <div key={skill.id} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-gray-800">{skill.name}</span>
                <form action={updateSkillWeightAction} className="flex items-center gap-2">
                  <input type="hidden" name="skillId" value={skill.id} />
                  <input
                    name="weight"
                    type="number"
                    step="0.1"
                    min="0"
                    defaultValue={skill.weight}
                    className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <button type="submit" className="text-xs text-[var(--color-brand-blue)] underline">
                    Guardar
                  </button>
                </form>
                <form action={removeSkillAction.bind(null, skill.id)}>
                  <button type="submit" className="text-xs text-red-600 underline">
                    Eliminar
                  </button>
                </form>
              </div>
            ))}
            {rubric.skills.length === 0 && <p className="text-sm text-gray-500">Sin habilidades configuradas.</p>}
          </div>

          <form action={addSkillAction} className="mt-4 flex gap-2">
            <input
              name="name"
              placeholder="Nueva habilidad (ej. Trabajo en equipo)"
              required
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded border border-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-[var(--color-brand-blue)] hover:bg-[var(--color-brand-blue-light)]"
            >
              Añadir
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
