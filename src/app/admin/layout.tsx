import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminNav } from "./AdminNav";
import { AdminHero } from "@/components/backgrounds/AdminHero";
import { FloatingThemeToggle } from "@/components/FloatingThemeToggle";

/**
 * Defense-in-depth: proxy.ts already blocks non-admins from /admin/*, but
 * per CLAUDE.md §8 every team-scoped/role-scoped boundary should also be
 * enforced at the data-access layer, not just in the request gate.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") redirect("/login");
  return (
    <div className="flex min-h-0 flex-1 print:h-auto print:min-h-full">
      <FloatingThemeToggle />
      <AdminNav badge="Admin" />
      {/* print:h-auto + print:overflow-visible: same fix as (team)/layout.tsx —
          without it, printing the Guía del pasante from the admin view (now
          linked from every admin/day/[n] page) silently truncates, since
          Chromium's print layout clips an overflow-y-auto container to its
          flex-computed height instead of growing to fit content. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto print:h-auto print:overflow-visible">
        <AdminHero />
        {children}
      </div>
    </div>
  );
}
