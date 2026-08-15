"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { SidebarShell } from "@/components/SidebarShell";
import { useSidebarCollapsed } from "@/lib/sidebarCollapse";
import { ChevronIcon } from "@/components/ui/icons";
import { ADMIN_NAV_SECTIONS, type AdminNavLink, type AdminNavSection } from "@/lib/adminNavData";

type NavLink = AdminNavLink;
type NavSection = AdminNavSection;

const SECTIONS = ADMIN_NAV_SECTIONS;

// Configuración is pinned in the sidebar footer (above "Cerrar sesión") instead
// of living inside the scrollable accordion — it's used every session and
// shouldn't require opening/scrolling a section to reach. Still listed in
// ADMIN_NAV_SECTIONS itself, so the admin home menu grid keeps showing it.
const CONFIG_HREF = "/admin/config";
const CONFIG_LINK = SECTIONS.flatMap((s) => s.links).find((l) => l.href === CONFIG_HREF)!;

const HOME_HREF = "/admin";
const HOME_LINK: NavLink = { href: HOME_HREF, label: "Resumen", short: "RES", description: "Panel del profesor." };

function withoutConfig(links: NavLink[]): NavLink[] {
  return links.filter((l) => l.href !== CONFIG_HREF);
}

function sectionHasActive(section: NavSection, pathname: string): boolean {
  return section.links.some((l) => l.href === pathname) || (section.subgroup?.links.some((l) => l.href === pathname) ?? false);
}

/** Admin's sidebar links (11 across 4 former flat groups) as collapsible disclosures — each section opens/closes independently, defaulting open only when it contains the current page. */
export function AdminNav({ badge }: { badge: string }) {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();
  const footerExtra = <NavItem link={CONFIG_LINK} active={pathname === CONFIG_HREF} collapsed={collapsed} />;

  if (collapsed) {
    const allLinks = SECTIONS.flatMap((s) => withoutConfig([...s.links, ...(s.subgroup?.links ?? [])]));
    return (
      <SidebarShell badge={badge} homeHref={HOME_HREF} footerExtra={footerExtra}>
        <NavItem link={HOME_LINK} active={pathname === HOME_HREF} collapsed />
        {allLinks.map((link) => (
          <NavItem key={link.href} link={link} active={pathname === link.href} collapsed />
        ))}
      </SidebarShell>
    );
  }

  return (
    <SidebarShell badge={badge} homeHref={HOME_HREF} footerExtra={footerExtra}>
      <NavItem link={HOME_LINK} active={pathname === HOME_HREF} collapsed={false} />
      {SECTIONS.map((section) => (
        <NavAccordion key={section.label} label={section.label} defaultOpen={sectionHasActive(section, pathname)}>
          {withoutConfig(section.links).map((link) => (
            <NavItem key={link.href} link={link} active={pathname === link.href} collapsed={false} />
          ))}
          {section.subgroup && (
            <>
              <div className="mb-1 mt-2 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/60">{section.subgroup.label}</div>
              {section.subgroup.links.map((link) => (
                <NavItem key={link.href} link={link} active={pathname === link.href} collapsed={false} />
              ))}
            </>
          )}
        </NavAccordion>
      ))}
    </SidebarShell>
  );
}

function NavAccordion({ label, defaultOpen, children }: { label: string; defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  // Auto-open (never auto-close) when navigation brings the active page into
  // this section, without discarding a manual expand/collapse of siblings.
  // Adjusting state during render (React's documented alternative to an
  // effect for "sync state to a changed prop") instead of useEffect, which
  // would call setState after commit and force an extra render pass.
  const [prevDefaultOpen, setPrevDefaultOpen] = useState(defaultOpen);
  if (defaultOpen !== prevDefaultOpen) {
    setPrevDefaultOpen(defaultOpen);
    if (defaultOpen) setOpen(true);
  }

  return (
    <div className="mt-1 first:mt-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-1 rounded-[var(--radius-sm)] px-2.5 py-1 text-left text-[11px] font-semibold uppercase tracking-wider text-white/60 transition-colors hover:bg-white/5 hover:text-white/80"
      >
        <span className="truncate">{label}</span>
        <ChevronIcon className={`h-3 w-3 shrink-0 transition-transform duration-200 ${open ? "-rotate-90" : "rotate-180"}`} />
      </button>
      {open && <div className="flex flex-col gap-0.5 pb-1 pt-0.5">{children}</div>}
    </div>
  );
}

function NavItem({ link, active, collapsed }: { link: NavLink; active: boolean; collapsed: boolean }) {
  return (
    <Link
      href={link.href}
      title={collapsed ? link.label : undefined}
      className={`rounded-[var(--radius-sm)] border-l-2 px-2.5 py-1 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide transition-colors ${
        collapsed ? "text-center" : ""
      } ${
        active
          ? "border-[var(--color-brand-yellow)] bg-white/10 text-white"
          : "border-transparent text-white/70 hover:border-white/30 hover:bg-white/10 hover:text-white"
      }`}
    >
      {collapsed ? link.short : link.label}
    </Link>
  );
}
