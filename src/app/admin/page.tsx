import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { navSectionsForRole, type AdminNavLink, type AdminNavSection } from "@/lib/adminNavData";

function ShortBadge({ short }: { short: string }) {
  return (
    <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-brand-blue-light)] px-1.5 font-[family-name:var(--font-condensed)] text-[15px] font-bold text-[var(--color-brand-blue-accent)]">
      {short}
    </span>
  );
}

function MenuTile({ link }: { link: AdminNavLink }) {
  return (
    <Link href={link.href} className="block">
      <Card glass hoverable padding="sm" className="h-full">
        <div className="flex items-center gap-2">
          <ShortBadge short={link.short} />
          <p className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
            {link.label}
          </p>
        </div>
        <p className="mt-1.5 text-xs text-[var(--color-brand-text-secondary)]">{link.description}</p>
      </Card>
    </Link>
  );
}

function NavMenu({ sections }: { sections: AdminNavSection[] }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-widest text-[var(--color-brand-text-secondary)]">
        Menú de administración
      </p>
      {sections.map((section) => (
        <div key={section.label}>
          <h2 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
            {section.label}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.links.map((link) => (
              <MenuTile key={link.href} link={link} />
            ))}
          </div>
          {section.subgroup && (
            <div className="mt-4">
              <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                {section.subgroup.label}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.subgroup.links.map((link) => (
                  <MenuTile key={link.href} link={link} />
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PageHeader({ eyebrow, title, cohortName }: { eyebrow: string; title: string; cohortName: string }) {
  return (
    <div className="animate-fade-in-up">
      <p className="font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-brand-cyan)]">{eyebrow}</p>
      <h1 className="mt-1 font-[family-name:var(--font-condensed)] text-4xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)] sm:text-5xl">
        {title}
      </h1>
      <p className="mt-3 text-sm text-[var(--color-brand-text-secondary)]">
        Cohorte activa: <strong>{cohortName}</strong>
      </p>
    </div>
  );
}

async function AdminHome() {
  const cohort = await getOrCreateActiveCohort();
  const [teamCount, universeRuns] = await Promise.all([
    prisma.team.count({ where: { cohortId: cohort.id } }),
    prisma.universeRun.findMany({
      where: { cohortId: cohort.id },
      orderBy: { createdAt: "desc" },
      select: { kind: true, status: true },
    }),
  ]);

  const colombiaDone = universeRuns.find((r) => r.kind === "colombia")?.status === "DONE";
  const chileDone = universeRuns.find((r) => r.kind === "chile")?.status === "DONE";

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 p-8 sm:p-10">
      <PageHeader eyebrow="Panel del profesor" title="Administración" cohortName={cohort.name} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card glass padding="sm">
          <p className="text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">Equipos creados</p>
          <p className="mt-1 font-[family-name:var(--font-condensed)] text-2xl font-bold text-[var(--color-brand-blue-accent)]">{teamCount}</p>
        </Card>
        <Card glass padding="sm">
          <p className="text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">Universo Colombia</p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-foreground)]">{colombiaDone ? "Generado" : "Pendiente"}</p>
        </Card>
        <Card glass padding="sm">
          <p className="text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">Dataset Chile</p>
          <p className="mt-1 text-sm font-semibold text-[var(--color-foreground)]">{chileDone ? "Generado" : "Pendiente"}</p>
        </Card>
      </div>

      <NavMenu sections={navSectionsForRole("ADMIN")} />
    </main>
  );
}

const SOFT_SKILL_ACTIVITIES = [1, 2, 3] as const;

async function AdminTHHome() {
  const cohort = await getOrCreateActiveCohort();
  const [memberCount, interviewedCount, activityCounts] = await Promise.all([
    prisma.teamMember.count({ where: { team: { cohortId: cohort.id } } }),
    prisma.teamMember.count({ where: { team: { cohortId: cohort.id }, interviewSkillRatings: { some: {} } } }),
    Promise.all(
      SOFT_SKILL_ACTIVITIES.map((activity) =>
        prisma.teamMember.count({ where: { team: { cohortId: cohort.id }, softSkillEvaluations: { some: { activity } } } })
      )
    ),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 p-8 sm:p-10">
      <PageHeader eyebrow="Panel de Talento Humano" title="Talento Humano" cohortName={cohort.name} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card glass padding="sm">
          <p className="text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">Integrantes</p>
          <p className="mt-1 font-[family-name:var(--font-condensed)] text-2xl font-bold text-[var(--color-brand-blue-accent)]">{memberCount}</p>
        </Card>
        <Card glass padding="sm">
          <p className="text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">Entrevistados</p>
          <p className="mt-1 font-[family-name:var(--font-condensed)] text-2xl font-bold text-[var(--color-brand-blue-accent)]">
            {interviewedCount}/{memberCount}
          </p>
        </Card>
        {SOFT_SKILL_ACTIVITIES.map((activity, i) => (
          <Card glass padding="sm" key={activity}>
            <p className="text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">Actividad {activity} evaluada</p>
            <p className="mt-1 font-[family-name:var(--font-condensed)] text-2xl font-bold text-[var(--color-brand-blue-accent)]">
              {activityCounts[i]}/{memberCount}
            </p>
          </Card>
        ))}
      </div>

      <NavMenu sections={navSectionsForRole("ADMIN_TH")} />
    </main>
  );
}

export default async function AdminHomeRoute() {
  const session = await auth();
  if (!session || (session.user.role !== "ADMIN" && session.user.role !== "ADMIN_TH")) redirect("/login");
  return session.user.role === "ADMIN_TH" ? <AdminTHHome /> : <AdminHome />;
}
