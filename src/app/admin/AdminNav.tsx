"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/actions";

const LINKS = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/universo", label: "Universo" },
  { href: "/admin/config", label: "Configuración" },
  { href: "/admin/day/1", label: "Día 1" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue)]">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-8 py-3">
        <nav className="flex gap-1">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded px-3 py-1.5 font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-wide transition-colors ${
                  active ? "bg-white text-[var(--color-brand-blue)]" : "text-white/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <form action={signOutAction}>
          <button type="submit" className="text-xs text-white/70 underline hover:text-white">
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
