import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InstrumentsPanel } from "@/components/team/InstrumentsPanel";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { Card } from "@/components/ui/card";
import { LockIcon } from "@/components/ui/icons";
import { TEAM_DAY_LINKS } from "@/lib/teamNavData";

function ShortBadge({ short }: { short: string }) {
  return (
    <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-blue-light)] px-1.5 font-[family-name:var(--font-condensed)] text-[15px] font-bold text-[var(--color-brand-blue-accent)]">
      {short}
    </span>
  );
}

export default async function TeamDashboard() {
  const session = await auth();
  const teamId = session?.user.teamId ?? null;

  const [team, submissions, cohort] = await Promise.all([
    teamId ? prisma.team.findUnique({ where: { id: teamId } }) : null,
    teamId
      ? prisma.tariffSubmission.findMany({ where: { teamId }, select: { day: true, meanPremium: true } })
      : [],
    getOrCreateActiveCohort(),
  ]);
  const completeByDay = new Map(submissions.map((s) => [s.day, s.meanPremium != null]));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 p-8 sm:p-10">
      <div className="animate-fade-in-up">
        <p className="font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-brand-cyan)]">
          Pasantía técnica
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-condensed)] text-4xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)] sm:text-5xl">
          {team?.name ?? "Equipo"}
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-[var(--color-brand-text-secondary)]">
          El reto simula 4 días de trabajo repartidos en 2 años de operación de una aseguradora de autos. Tu equipo
          compite contra los demás equipos del cohorte por una porción de un mercado sintético de 1.000.000 de pólizas
          en Colombia, tomando decisiones actuariales (tarifa, reservas, recomendaciones sectoriales) y financieras
          (portafolio de inversión, P&G, Balance, solvencia). Cada día se califica de forma objetiva, contra un motor
          de referencia, y de forma subjetiva, según la rúbrica del evaluador.
        </p>
      </div>

      <div>
        <p className="mb-3 font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-widest text-[var(--color-brand-text-secondary)]">
          Menú del reto
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TEAM_DAY_LINKS.map((d) => {
            const locked = d.day > cohort.openDay;
            const card = (
              <>
                <div className="flex items-center gap-2">
                  <ShortBadge short={d.short} />
                  <p className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                    {d.label}
                  </p>
                </div>
                <p className="mt-2 text-xs text-[var(--color-brand-text-secondary)]">
                  <span className="font-semibold text-[var(--color-brand-blue-accent)]">Actuarial — </span>
                  {d.actuarial}
                </p>
                <p className="mt-1 text-xs text-[var(--color-brand-text-secondary)]">
                  <span className="font-semibold text-[var(--color-brand-blue-accent)]">Financiero — </span>
                  {d.financiero}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-xs italic text-[var(--color-brand-text-secondary)]">
                  {locked ? (
                    <>
                      <LockIcon className="h-3 w-3 shrink-0" /> Aún no disponible
                    </>
                  ) : completeByDay.get(d.day) ? (
                    "Tarifa cargada"
                  ) : (
                    "Tarifa pendiente"
                  )}
                </p>
              </>
            );
            return locked ? (
              <Card key={d.day} accent="gray" glass className="opacity-60">
                {card}
              </Card>
            ) : (
              <Link key={d.day} href={d.href} className="block">
                <Card accent="blue" glass hoverable>
                  {card}
                </Card>
              </Link>
            );
          })}

          <Link href="/standings" className="block">
            <Card accent="blue" glass hoverable className="flex h-full flex-col justify-center">
              <div className="flex items-center gap-2">
                <ShortBadge short="RK" />
                <p className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                  Ranking
                </p>
              </div>
              <p className="mt-2 text-xs text-[var(--color-brand-text-secondary)]">
                Nota final de todos los equipos del cohorte.
              </p>
            </Card>
          </Link>
        </div>
      </div>

      <InstrumentsPanel />
    </main>
  );
}
