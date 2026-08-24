"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { SidebarShell } from "@/components/SidebarShell";
import { useSidebarCollapsed } from "@/lib/sidebarCollapse";
import { CohortSwitcher } from "@/components/CohortSwitcher";
import { BarChartIcon, ChatIcon, ChevronIcon, FlaskIcon, GlobeIcon, HomeIcon, SettingsIcon } from "@/components/ui/icons";
import { navSectionsForRole, type AdminNavLink, type AdminNavSection } from "@/lib/adminNavData";

type NavLink = AdminNavLink;
type NavSection = AdminNavSection;
type AdminRole = "ADMIN" | "ADMIN_TH";

// Configuración is pinned in the sidebar footer (above "Cerrar sesión") instead
// of living inside the scrollable accordion — it's used every session and
// shouldn't require opening/scrolling a section to reach. Also listed inside
// ADMIN_NAV_SECTIONS' "Reto por días" (ADMIN-only), so the admin home menu
// grid still shows it as a tile there — but pinned here as a plain constant,
// independent of that role-filtered section, so ADMIN_TH also gets it (its
// own admin/page.tsx home renders a Talento-Humano-only menu grid without
// a Configuración tile, yet still gets the pinned link, which opens a
// read-only render of the same page — see admin/config/page.tsx).
const CONFIG_HREF = "/admin/config";
const CONFIG_LINK: NavLink = { href: CONFIG_HREF, label: "Configuración", short: "CFG", description: "Equipos, rúbrica y qué día está abierto para el cohorte." };

const HOME_HREF = "/admin";
const HOME_LINK: NavLink = { href: HOME_HREF, label: "Resumen", short: "RES", description: "Panel general." };

// A collapsed sidebar showing "UNI"/"MOD"/"ENT" reads as a wall of similar
// abbreviations — a per-link icon is far more scannable. Only links with a
// clear, distinct real-world icon get one (day/activity numbers don't gain
// anything from an icon, since a calendar glyph can't tell Día 1 from Día 4);
// those keep their short code as-is.
const NAV_ICON_BY_HREF: Record<string, ReactNode> = {
  [HOME_HREF]: <HomeIcon className="h-4 w-4 shrink-0" />,
  "/admin/universo": <GlobeIcon className="h-4 w-4 shrink-0" />,
  "/admin/modelo": <FlaskIcon className="h-4 w-4 shrink-0" />,
  "/admin/standings": <BarChartIcon className="h-4 w-4 shrink-0" />,
  "/admin/entrevista": <ChatIcon className="h-4 w-4 shrink-0" />,
  [CONFIG_HREF]: <SettingsIcon className="h-4 w-4 shrink-0" />,
};

function withoutConfig(links: NavLink[]): NavLink[] {
  return links.filter((l) => l.href !== CONFIG_HREF);
}

function sectionHasActive(section: NavSection, pathname: string): boolean {
  return section.links.some((l) => l.href === pathname) || (section.subgroup?.links.some((l) => l.href === pathname) ?? false);
}

function defaultOpenMap(sections: NavSection[], pathname: string): Record<string, boolean> {
  return Object.fromEntries(sections.map((s) => [s.label, sectionHasActive(s, pathname)]));
}

/**
 * Admin's sidebar links (11 across 4 former flat groups) as collapsible
 * disclosures — each section opens/closes independently, defaulting open
 * only when it contains the current page. Open/closed state lives here
 * (not inside each accordion) so the collapsed icon rail can mirror it:
 * only sections the admin actually has open show their links there too,
 * instead of dumping every link from every section into one flat list.
 *
 * `role` narrows which sections render at all — ADMIN_TH only ever gets
 * "Talento Humano" (see navSectionsForRole()), rendered flat without the
 * accordion since it's the only section that role has, plus the pinned
 * Resumen/Configuración links both roles share (Configuración renders
 * read-only for ADMIN_TH — see admin/config/page.tsx). ADMIN no longer
 * sees "Talento Humano" at all — that section is TH's own view now.
 */
export function AdminNav({
  badge,
  role,
  cohorts,
  selectedCohortId,
}: {
  badge: string;
  role: AdminRole;
  cohorts: { id: string; name: string }[];
  selectedCohortId: string;
}) {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();
  const SECTIONS = navSectionsForRole(role);
  const footerExtra = (
    <>
      <CohortSwitcher cohorts={cohorts} selectedId={selectedCohortId} />
      <NavItem link={CONFIG_LINK} active={pathname === CONFIG_HREF} collapsed={collapsed} />
    </>
  );

  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => defaultOpenMap(SECTIONS, pathname));
  // Auto-open (never auto-close) a section when navigation brings the active
  // page into it, without discarding sections the admin opened/closed by
  // hand. Adjusting state during render (React's documented alternative to
  // an effect for "sync state to a changed prop") instead of useEffect,
  // which would call setState after commit and force an extra render pass.
  const [prevDefaults, setPrevDefaults] = useState(openMap);
  const defaults = defaultOpenMap(SECTIONS, pathname);
  if (SECTIONS.some((s) => defaults[s.label] !== prevDefaults[s.label])) {
    setPrevDefaults(defaults);
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const s of SECTIONS) {
        if (defaults[s.label] && !prevDefaults[s.label]) next[s.label] = true;
      }
      return next;
    });
  }

  // ADMIN_TH only ever has one section ("Talento Humano" — see navSectionsForRole()),
  // so wrapping it in a collapsible accordion just adds a click for no grouping
  // benefit. Render its links directly instead.
  if (role === "ADMIN_TH") {
    const section = SECTIONS[0];
    const allLinks = withoutConfig([...section.links, ...(section.subgroup?.links ?? [])]);
    return (
      <SidebarShell badge={badge} homeHref={HOME_HREF} footerExtra={footerExtra}>
        <NavItem link={HOME_LINK} active={pathname === HOME_HREF} collapsed={collapsed} />
        {collapsed
          ? allLinks.map((link) => <NavItem key={link.href} link={link} active={pathname === link.href} collapsed />)
          : (
            <>
              {withoutConfig(section.links).map((link) => (
                <NavItem key={link.href} link={link} active={pathname === link.href} collapsed={false} nested />
              ))}
              {section.subgroup && (
                <>
                  <div className="mb-1 mt-2 pl-5 pr-2.5 font-[family-name:var(--font-condensed)] text-base font-bold uppercase tracking-wide text-white/80">{section.subgroup.label}</div>
                  {section.subgroup.links.map((link) => (
                    <NavItem key={link.href} link={link} active={pathname === link.href} collapsed={false} nested />
                  ))}
                </>
              )}
            </>
          )}
      </SidebarShell>
    );
  }

  if (collapsed) {
    const openLinks = SECTIONS.filter((s) => openMap[s.label]).flatMap((s) =>
      withoutConfig([...s.links, ...(s.subgroup?.links ?? [])])
    );
    return (
      <SidebarShell badge={badge} homeHref={HOME_HREF} footerExtra={footerExtra}>
        <NavItem link={HOME_LINK} active={pathname === HOME_HREF} collapsed />
        {openLinks.map((link) => (
          <NavItem key={link.href} link={link} active={pathname === link.href} collapsed />
        ))}
      </SidebarShell>
    );
  }

  return (
    <SidebarShell badge={badge} homeHref={HOME_HREF} footerExtra={footerExtra}>
      <NavItem link={HOME_LINK} active={pathname === HOME_HREF} collapsed={false} />
      {SECTIONS.map((section) => (
        <NavAccordion
          key={section.label}
          label={section.label}
          open={openMap[section.label]}
          onToggle={() => setOpenMap((m) => ({ ...m, [section.label]: !m[section.label] }))}
        >
          {withoutConfig(section.links).map((link) => (
            <NavItem key={link.href} link={link} active={pathname === link.href} collapsed={false} nested />
          ))}
          {section.subgroup && (
            <>
              <div className="mb-1 mt-2 pl-5 pr-2.5 font-[family-name:var(--font-condensed)] text-base font-bold uppercase tracking-wide text-white/80">{section.subgroup.label}</div>
              {section.subgroup.links.map((link) => (
                <NavItem key={link.href} link={link} active={pathname === link.href} collapsed={false} nested />
              ))}
            </>
          )}
        </NavAccordion>
      ))}
    </SidebarShell>
  );
}

function NavAccordion({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="mt-1 first:mt-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-1 rounded-[var(--radius-sm)] px-2.5 py-1 text-left font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-white/80 transition-colors hover:bg-white/5 hover:text-white/80"
      >
        <span>{label}</span>
        <ChevronIcon className={`h-3 w-3 shrink-0 transition-transform duration-200 ${open ? "-rotate-90" : "rotate-180"}`} />
      </button>
      {open && <div className="flex flex-col gap-0.5 pb-1 pt-0.5">{children}</div>}
    </div>
  );
}

function NavItem({
  link,
  active,
  collapsed,
  nested = false,
}: {
  link: NavLink;
  active: boolean;
  collapsed: boolean;
  /** Items living inside an accordion section — indented and a step smaller than
      the section title above them, so the title/subitem hierarchy reads clearly
      instead of both sitting at the same visual weight. */
  nested?: boolean;
}) {
  const icon = NAV_ICON_BY_HREF[link.href];
  return (
    <Link
      href={link.href}
      title={collapsed ? link.label : undefined}
      className={`flex items-center gap-1.5 rounded-[var(--radius-sm)] border-l-2 py-1 font-[family-name:var(--font-condensed)] font-bold uppercase tracking-wide transition-colors ${
        nested && !collapsed ? "pl-5 pr-2.5 text-xs" : "px-2.5 text-sm"
      } ${collapsed ? "justify-center text-center" : ""} ${
        active
          ? "border-[var(--color-brand-yellow)] bg-white/10 text-white"
          : "border-transparent text-white/70 hover:border-white/30 hover:bg-white/10 hover:text-white"
      }`}
    >
      {collapsed ? (icon ?? link.short) : (
        <>
          {icon}
          {link.label}
        </>
      )}
    </Link>
  );
}
