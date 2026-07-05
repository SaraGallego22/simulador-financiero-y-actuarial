"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/actions";

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
    <aside className="flex w-56 shrink-0 flex-col justify-between border-r border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue)] text-white">
      <div className="flex flex-col gap-6 overflow-y-auto px-4 py-6">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-white/50">{section.label}</div>
            <nav className="flex flex-col gap-0.5">
              {section.links.map((link) => {
                const active = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded px-2 py-1.5 font-[family-name:var(--font-condensed)] text-sm font-semibold uppercase tracking-wide transition-colors ${
                      active ? "bg-white text-[var(--color-brand-blue)]" : "text-white/80 hover:bg-white/10 hover:text-white"
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
      <form action={signOutAction} className="border-t border-white/10 px-4 py-4">
        <button type="submit" className="text-xs text-white/70 underline hover:text-white">
          Cerrar sesión
        </button>
      </form>
    </aside>
  );
}
