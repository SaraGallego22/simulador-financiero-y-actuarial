import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TopBar } from "@/components/TopBar";
import { TeamNav } from "./TeamNav";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "TEAM") redirect("/login");

  const team = session.user.teamId
    ? await prisma.team.findUnique({ where: { id: session.user.teamId }, select: { name: true } })
    : null;

  return (
    <div className="flex flex-1 flex-col">
      <TopBar
        subtitle="Panel del Equipo · Seguros de Automóviles · 4 días / 2 años simulados"
        badge={team?.name ?? "Equipo"}
      />
      <div className="flex flex-1">
        <TeamNav />
        <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
