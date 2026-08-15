"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarShell } from "@/components/SidebarShell";
import { useSidebarCollapsed } from "@/lib/sidebarCollapse";

const SECTIONS = [
  {
    label: "Preparación",
    links: [
      { href: "/admin/universo", label: "Universo y dataset Chile", short: "UNI" },
      { href: "/admin/modelo", label: "Modelo técnico", short: "MOD" },
    ],
  },
  {
    label: "Evaluación (reto por días)",
    links: [
      { href: "/admin/config", label: "Configuración", short: "CFG" },
      { href: "/admin/day/1", label: "Día 1", short: "D1" },
      { href: "/admin/day/2", label: "Día 2", short: "D2" },
      { href: "/admin/day/3", label: "Día 3", short: "D3" },
      { href: "/admin/day/4", label: "Día 4", short: "D4" },
      { href: "/admin/standings", label: "Consolidado final", short: "CON" },
    ],
  },
  {
    label: "Habilidades blandas",
    links: [
      { href: "/admin/actividad/1", label: "Actividad 1", short: "A1" },
      { href: "/admin/actividad/2", label: "Actividad 2", short: "A2" },
      { href: "/admin/actividad/3", label: "Actividad 3", short: "A3" },
    ],
  },
  {
    label: "TH",
    links: [{ href: "/admin/entrevista", label: "Entrevista individual", short: "ENT" }],
  },
];

export function AdminNav({ subtitle, badge }: { subtitle: string; badge: string }) {
  const pathname = usePathname();
  const collapsed = useSidebarCollapsed();

  return (
    <SidebarShell subtitle={subtitle} badge={badge}>
      {SECTIONS.map((section, i) => (
        <div key={section.label} className={i > 0 ? (collapsed ? "mt-2 border-t border-white/10 pt-2" : "mt-4") : ""}>
          {!collapsed && <div className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-wider text-white/50">{section.label}</div>}
          <div className="flex flex-col gap-1">
            {section.links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  title={collapsed ? link.label : undefined}
                  className={`rounded-[var(--radius-sm)] border-l-2 px-2.5 py-1.5 font-[family-name:var(--font-condensed)] text-sm font-semibold uppercase tracking-wide transition-colors ${
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
            })}
          </div>
        </div>
      ))}
    </SidebarShell>
  );
}
