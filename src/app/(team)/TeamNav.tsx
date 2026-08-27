"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChartIcon, HomeIcon, LockIcon } from "@/components/ui/icons";
import { SidebarShell } from "@/components/SidebarShell";
import { useSidebarCollapsed } from "@/lib/sidebarCollapse";
import { TEAM_DAY_LINKS } from "@/lib/teamNavData";
import { type ReactNode } from "react";

const DAY_LINKS = TEAM_DAY_LINKS;

// Same reasoning as AdminNav's NAV_ICON_BY_HREF: only links with a clear,
// distinct real-world icon get one when the sidebar collapses to icons —
// Día 1-4 keep their short codes since a calendar glyph can't tell them apart.
const NAV_ICON_BY_HREF: Record<string, ReactNode> = {
  "/dashboard": <HomeIcon className="h-4 w-4 shrink-0" />,
  "/standings": <BarChartIcon className="h-4 w-4 shrink-0" />,
};

/** Days beyond the cohort's openDay (admin-controlled, see updateOpenDayAction) render locked, not linked. */
export function TeamNav({ openDay, badge }: { openDay: number; badge: string }) {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();

  return (
    <SidebarShell badge={badge} homeHref="/dashboard">
      <NavItem href="/dashboard" label="Resumen" short="RES" active={pathname === "/dashboard"} collapsed={collapsed} />
      {DAY_LINKS.map((link) =>
        link.day <= openDay ? (
          <NavItem
            key={link.href}
            href={link.href}
            label={link.label}
            short={link.short}
            active={pathname === link.href}
            collapsed={collapsed}
          />
        ) : (
          <span
            key={link.href}
            title="Aún no disponible"
            className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] border-l-2 border-transparent px-2.5 py-1 font-[family-name:var(--font-condensed)] text-sm font-semibold uppercase tracking-wide text-white/40 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <LockIcon className="h-3.5 w-3.5 shrink-0" /> {!collapsed && link.label}
          </span>
        )
      )}
      <NavItem href="/mercado" label="Resultados del mercado" short="MK" active={pathname === "/mercado"} collapsed={collapsed} />
      <NavItem href="/standings" label="Ranking" short="RK" active={pathname === "/standings"} collapsed={collapsed} />
    </SidebarShell>
  );
}

function NavItem({
  href,
  label,
  short,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  short: string;
  active: boolean;
  collapsed: boolean;
}) {
  const icon = NAV_ICON_BY_HREF[href];
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] border-l-2 px-2.5 py-1 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide transition-colors ${
        collapsed ? "justify-center text-center" : ""
      } ${
        active
          ? "border-[var(--color-brand-yellow)] bg-white/10 text-white"
          : "border-transparent text-white/70 hover:border-white/30 hover:bg-white/10 hover:text-white"
      }`}
    >
      {collapsed ? (icon ?? short) : (
        <>
          {icon}
          {label}
        </>
      )}
    </Link>
  );
}
