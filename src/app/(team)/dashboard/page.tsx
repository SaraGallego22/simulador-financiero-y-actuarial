import { auth } from "@/lib/auth";
import { signOutAction } from "@/lib/actions";
import { prisma } from "@/lib/prisma";

export default async function TeamDashboard() {
  const session = await auth();
  const team = session?.user.teamId
    ? await prisma.team.findUnique({ where: { id: session.user.teamId } })
    : null;

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
        Aquí verás el día habilitado, tus formularios de tarifas/portafolio/entregables, y tus resultados una vez
        publicados por el evaluador. (Vistas en construcción.)
      </p>
    </main>
  );
}
