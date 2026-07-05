import Image from "next/image";
import { signOutAction } from "@/lib/actions";

/**
 * Matches the legacy prototype's `.topbar` (line ~221): blue bar, SURA logo,
 * title + subtitle, a highlighted pill, and a sign-out action on the right.
 * The pill/subtitle content is the one thing that differs by role — an
 * admin sees "Panel del Profesor" / an ADMIN badge, a team sees "Panel del
 * Equipo" / their own team name as the badge.
 */
export function TopBar({ subtitle, badge }: { subtitle: string; badge: string }) {
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between bg-[var(--color-brand-blue)] px-8 shadow-[0_2px_12px_rgba(0,51,160,0.3)]">
      <div className="flex items-center gap-5">
        <Image src="/logo_sura.png" alt="Seguros SURA" width={140} height={55} className="h-7 w-auto" priority />
        <div>
          <div className="font-[family-name:var(--font-condensed)] text-lg font-bold tracking-wide text-white">
            Pasantía Técnica
          </div>
          <div className="mt-0.5 text-xs text-white/60">{subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded-full bg-[var(--color-brand-yellow)] px-3 py-1 font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
          {badge}
        </span>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded border border-white/30 px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/10"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
