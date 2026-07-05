"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/actions";

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
    <aside className="flex w-56 shrink-0 flex-col justify-between border-r border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue)] text-white">
      <div className="flex flex-col gap-0.5 overflow-y-auto px-4 py-6">
        {LINKS.map((link) => {
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
      </div>
      <form action={signOutAction} className="border-t border-white/10 px-4 py-4">
        <button type="submit" className="text-xs text-white/70 underline hover:text-white">
          Cerrar sesión
        </button>
      </form>
    </aside>
  );
}
