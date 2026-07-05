import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TeamNav } from "./TeamNav";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "TEAM") redirect("/login");
  return (
    <div className="flex flex-1">
      <TeamNav />
      <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
    </div>
  );
}
