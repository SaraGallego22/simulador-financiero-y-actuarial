"use client";

import Image from "next/image";
import { type ReactNode } from "react";
import { signOutAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ChevronIcon, LogoutIcon } from "@/components/ui/icons";
import { useSidebarCollapsed, toggleSidebarCollapsed } from "@/lib/sidebarCollapse";

/**
 * The single left-hand panel that replaces the old TopBar + sidebar pair —
 * brand header, nav (passed as children by TeamNav/AdminNav, which read the
 * same collapsed state independently via useSidebarCollapsed), role badge,
 * theme toggle and sign-out all live here now. Collapses to a narrow icon
 * rail; state persists the same way ThemeToggle's does (localStorage +
 * custom event, see src/lib/sidebarCollapse.ts).
 */
export function SidebarShell({ subtitle, badge, children }: { subtitle: string; badge: string; children: ReactNode }) {
  const collapsed = useSidebarCollapsed();

  return (
    <aside
      title={collapsed ? badge : undefined}
      className={`flex shrink-0 flex-col overflow-y-auto bg-[image:var(--gradient-brand-sidebar)] text-white transition-[width] duration-200 print:hidden ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <div className={`flex items-center gap-2 px-3 py-4 ${collapsed ? "justify-center" : ""}`}>
        <Image src="/logo_sura.png" alt="Seguros SURA" width={140} height={55} className="h-7 w-auto shrink-0" priority />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-wide">Pasantía Técnica</p>
            <p className="truncate text-[10px] text-white/60">{subtitle}</p>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-1">{children}</nav>

      <div className="flex flex-col gap-2 border-t border-white/10 px-3 py-3">
        {!collapsed && (
          <span className="self-start rounded-full bg-[var(--color-brand-yellow)] px-2.5 py-0.5 font-[family-name:var(--font-condensed)] text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
            {badge}
          </span>
        )}
        <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "justify-between"}`}>
          <ThemeToggle onDark />
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-brand-blue)]"
          >
            <ChevronIcon className={`h-4 w-4 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} />
          </button>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" onDark size="sm" className="w-full justify-center" title="Cerrar sesión">
            {collapsed ? <LogoutIcon className="h-4 w-4" /> : "Cerrar sesión"}
          </Button>
        </form>
      </div>
    </aside>
  );
}
