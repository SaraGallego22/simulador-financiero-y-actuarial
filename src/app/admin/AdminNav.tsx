"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  {
    label: "Preparación",
    links: [
      { href: "/admin/universo", label: "Universo y dataset Chile" },
      { href: "/admin/modelo", label: "Modelo técnico" },
    ],
  },
  {
    label: "Evaluación (reto por días)",
    links: [
      { href: "/admin/config", label: "Configuración" },
      { href: "/admin/day/1", label: "Día 1" },
      { href: "/admin/day/2", label: "Día 2" },
      { href: "/admin/day/3", label: "Día 3" },
      { href: "/admin/day/4", label: "Día 4" },
      { href: "/admin/standings", label: "Consolidado final" },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <aside className="flex w-44 shrink-0 flex-col overflow-y-auto border-r border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue)] text-white">
      <div className="flex flex-col gap-5 px-3 py-5">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-wider text-white/50">{section.label}</div>
            <nav className="flex flex-col gap-1">
              {section.links.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-md border-l-2 px-2.5 py-1.5 font-[family-name:var(--font-condensed)] text-sm font-semibold uppercase tracking-wide transition-colors ${
                      active
                        ? "border-[var(--color-brand-yellow)] bg-white/10 text-white"
                        : "border-transparent text-white/70 hover:border-white/30 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
    </aside>
  );
}
