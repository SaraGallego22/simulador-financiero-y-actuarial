import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminNav } from "./AdminNav";
import { AdminHero } from "@/components/backgrounds/AdminHero";

/**
 * Defense-in-depth: proxy.ts already blocks non-admins from /admin/*, but
 * per CLAUDE.md §8 every team-scoped/role-scoped boundary should also be
 * enforced at the data-access layer, not just in the request gate.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
  return (
    <div className="flex flex-1">
      <AdminNav subtitle="Panel del Profesor · Seguros de Automóviles · 4 días / 2 años simulados" badge="Admin" />
      <div className="relative flex flex-1 flex-col overflow-y-auto">
        <AdminHero />
        {children}
      </div>
    </div>
  );
}
