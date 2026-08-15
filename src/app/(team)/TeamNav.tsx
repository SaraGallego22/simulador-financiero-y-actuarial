"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockIcon } from "@/components/ui/icons";

const DAY_LINKS = [
  { href: "/day/1", label: "Día 1", day: 1 },
  { href: "/day/2", label: "Día 2", day: 2 },
  { href: "/day/3", label: "Día 3", day: 3 },
  { href: "/day/4", label: "Día 4", day: 4 },
];

/** Days beyond the cohort's openDay (admin-controlled, see updateOpenDayAction) render locked, not linked. */
export function TeamNav({ openDay }: { openDay: number }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-44 shrink-0 flex-col overflow-y-auto border-r border-[var(--color-brand-gray-light)] bg-[image:var(--gradient-brand-sidebar)] text-white print:hidden">
      <div className="flex flex-col gap-1 px-3 py-5">
        <NavItem href="/dashboard" label="Resumen" active={pathname === "/dashboard"} />
        {DAY_LINKS.map((link) =>
          link.day <= openDay ? (
            <NavItem key={link.href} href={link.href} label={link.label} active={pathname === link.href} />
          ) : (
            <span
              key={link.href}
              title="Aún no disponible"
              className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border-l-2 border-transparent px-2.5 py-1.5 font-[family-name:var(--font-condensed)] text-sm font-semibold uppercase tracking-wide text-white/40"
            >
              <LockIcon className="h-3.5 w-3.5 shrink-0" /> {link.label}
            </span>
          )
        )}
        <NavItem href="/standings" label="Ranking" active={pathname === "/standings"} />
      </div>
    </aside>
  );
}

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-[var(--radius-sm)] border-l-2 px-2.5 py-1.5 font-[family-name:var(--font-condensed)] text-sm font-semibold uppercase tracking-wide transition-colors ${
        active
          ? "border-[var(--color-brand-yellow)] bg-white/10 text-white"
          : "border-transparent text-white/70 hover:border-white/30 hover:bg-white/10 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );
}
