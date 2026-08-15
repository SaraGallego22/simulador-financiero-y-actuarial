"use client";

import Image from "next/image";
import { type ReactNode } from "react";
import { signOutAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { ChevronIcon, LogoutIcon } from "@/components/ui/icons";
import { useSidebarCollapsed, toggleSidebarCollapsed } from "@/lib/sidebarCollapse";

/**
 * The single left-hand panel that replaces the old TopBar + sidebar pair —
 * brand header, nav (passed as children by TeamNav/AdminNav, which read the
 * same collapsed state independently via useSidebarCollapsed), role badge
 * and sign-out all live here now. Collapses to a narrow icon rail; state
 * persists the same way ThemeToggle's does (localStorage + custom event,
 * see src/lib/sidebarCollapse.ts). The theme toggle itself floats in the
 * top-right corner instead (see FloatingThemeToggle, mounted per layout) —
 * it doesn't belong to this panel.
 */
export function SidebarShell({ subtitle, badge, children }: { subtitle: string; badge: string; children: ReactNode }) {
  const collapsed = useSidebarCollapsed();

  return (
    <aside
      title={collapsed ? badge : undefined}
      className={`flex shrink-0 flex-col bg-[image:var(--gradient-brand-sidebar)] text-white transition-[width] duration-200 print:hidden ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <div className={`flex shrink-0 items-center gap-2 px-3 py-3 ${collapsed ? "justify-center" : ""}`}>
        <Image src="/logo_sura.png" alt="Seguros SURA" width={140} height={55} className="h-6 w-auto shrink-0" priority />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-wide">Pasantía Técnica</p>
            <p className="truncate text-[10px] text-white/60">{subtitle}</p>
          </div>
        )}
      </div>

      {/* Only this middle section scrolls — header and footer (sign-out,
          collapse toggle) must always stay in view without hunting through a
          long nav list, so they can't be inside the same scroll container. */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-1">{children}</nav>

      <div className="flex shrink-0 flex-col gap-1.5 border-t border-white/10 px-3 py-2.5">
        {!collapsed && (
          <span className="self-start rounded-full bg-[var(--color-brand-yellow)] px-2.5 py-0.5 font-[family-name:var(--font-condensed)] text-[10px] font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
            {badge}
          </span>
        )}
        <button
          type="button"
          onClick={toggleSidebarCollapsed}
          title={collapsed ? "Expandir menú" : "Colapsar menú"}
          className={`flex h-8 items-center justify-center gap-1.5 rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-brand-blue)] ${
            collapsed ? "w-8" : "w-full"
          }`}
        >
          <ChevronIcon className={`h-4 w-4 shrink-0 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && <span className="font-[family-name:var(--font-condensed)] text-xs font-semibold uppercase tracking-wide">Colapsar</span>}
        </button>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" onDark size="sm" className="w-full justify-center" title="Cerrar sesión">
            {collapsed ? <LogoutIcon className="h-4 w-4" /> : "Cerrar sesión"}
          </Button>
        </form>
      </div>
    </aside>
  );
}
