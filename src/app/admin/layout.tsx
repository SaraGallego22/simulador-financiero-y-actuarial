import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TopBar } from "@/components/TopBar";
import { AdminNav } from "./AdminNav";

/**
 * Defense-in-depth: proxy.ts already blocks non-admins from /admin/*, but
 * per CLAUDE.md §8 every team-scoped/role-scoped boundary should also be
 * enforced at the data-access layer, not just in the request gate.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
  return (
    <div className="flex flex-1 flex-col">
      <TopBar subtitle="Panel del Profesor · Seguros de Automóviles · 4 días / 2 años simulados" badge="Admin" />
      <div className="flex flex-1">
        <AdminNav />
        <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
