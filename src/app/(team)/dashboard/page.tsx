import { auth } from "@/lib/auth";
import { signOutAction } from "@/lib/actions";
import { prisma } from "@/lib/prisma";
import { TariffUpload } from "./TariffUpload";

const DAY = 1;

export default async function TeamDashboard() {
  const session = await auth();
  const teamId = session?.user.teamId ?? null;

  const [team, submission] = await Promise.all([
    teamId ? prisma.team.findUnique({ where: { id: teamId } }) : null,
    teamId
      ? prisma.tariffSubmission.findUnique({
          where: { teamId_day: { teamId, day: DAY } },
          select: { meanPremium: true },
        })
      : null,
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          {team?.name ?? "Equipo"}
        </h1>
        <form action={signOutAction}>
          <button type="submit" className="text-sm text-gray-500 underline hover:text-gray-700">
            Cerrar sesión
          </button>
        </form>
      </div>
      <p className="text-sm text-gray-600">
        Descarga el universo de pólizas, define tu tarifa por póliza y sube el resultado. Tus resultados objetivos y
        la calificación subjetiva aparecerán aquí una vez que el evaluador corra la simulación y los publique.
      </p>

      <a
        href="/api/universe/public-csv"
        className="w-fit rounded border border-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-[var(--color-brand-blue)] hover:bg-[var(--color-brand-blue-light)]"
      >
        Descargar CSV público del universo
      </a>

      <TariffUpload day={DAY} initialComplete={submission?.meanPremium != null} initialMeanPremium={submission?.meanPremium ?? null} />
    </main>
  );
}
