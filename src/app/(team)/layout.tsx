import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { TeamNav } from "./TeamNav";
import { DashboardHero } from "@/components/backgrounds/DashboardHero";
import { FloatingThemeToggle } from "@/components/FloatingThemeToggle";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "TEAM") redirect("/login");

  const [team, cohort] = await Promise.all([
    session.user.teamId
      ? prisma.team.findUnique({ where: { id: session.user.teamId }, select: { name: true } })
      : null,
    getOrCreateActiveCohort(),
  ]);

  return (
    <div className="flex min-h-0 flex-1 print:h-auto print:min-h-full">
      <FloatingThemeToggle />
      <TeamNav openDay={cohort.openDay} badge={team?.name ?? "Equipo"} />
      {/* print:h-auto + print:overflow-visible: without this, printing a page
          taller than one screen (the Guía del pasante) silently truncates —
          Chromium's print layout clips an overflow-y-auto container to its
          flex-computed height instead of growing to fit content. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto print:h-auto print:overflow-visible">
        <DashboardHero />
        {children}
      </div>
    </div>
  );
}
