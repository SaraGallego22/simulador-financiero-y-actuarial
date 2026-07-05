"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Resumen" },
  { href: "/day/1", label: "Día 1" },
  { href: "/day/2", label: "Día 2" },
  { href: "/day/3", label: "Día 3" },
  { href: "/day/4", label: "Día 4" },
  { href: "/standings", label: "Ranking" },
  { href: "/model-docs", label: "Modelo técnico" },
];

export function TeamNav() {
  const pathname = usePathname();

  return (
    <aside className="flex w-44 shrink-0 flex-col overflow-y-auto border-r border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue)] text-white">
      <div className="flex flex-col gap-1 px-3 py-5">
        {LINKS.map((link) => {
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
      </div>
    </aside>
  );
}
