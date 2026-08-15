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

function sectionHasActive(section: NavSection, pathname: string): boolean {
  return section.links.some((l) => l.href === pathname) || (section.subgroup?.links.some((l) => l.href === pathname) ?? false);
}

/** Admin's sidebar links (11 across 4 former flat groups) as collapsible disclosures — each section opens/closes independently, defaulting open only when it contains the current page. */
export function AdminNav({ subtitle, badge }: { subtitle: string; badge: string }) {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();

  if (collapsed) {
    const allLinks = SECTIONS.flatMap((s) => [...s.links, ...(s.subgroup?.links ?? [])]);
    return (
      <SidebarShell subtitle={subtitle} badge={badge}>
        {allLinks.map((link) => (
          <NavItem key={link.href} link={link} active={pathname === link.href} collapsed />
        ))}
      </SidebarShell>
    );
  }

  return (
    <SidebarShell subtitle={subtitle} badge={badge}>
      {SECTIONS.map((section) => (
        <NavAccordion key={section.label} label={section.label} defaultOpen={sectionHasActive(section, pathname)}>
          {section.links.map((link) => (
            <NavItem key={link.href} link={link} active={pathname === link.href} collapsed={false} />
          ))}
          {section.subgroup && (
            <>
              <div className="mb-1 mt-2 px-2.5 text-[9px] font-bold uppercase tracking-wider text-white/40">{section.subgroup.label}</div>
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
        className="flex w-full items-center justify-between gap-1 rounded-[var(--radius-sm)] px-2.5 py-1 text-left text-[10px] font-bold uppercase tracking-wider text-white/50 transition-colors hover:bg-white/5 hover:text-white/80"
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
      className={`rounded-[var(--radius-sm)] border-l-2 px-2.5 py-1 font-[family-name:var(--font-condensed)] text-sm font-semibold uppercase tracking-wide transition-colors ${
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
