import Link from "next/link";
import { PrintButton } from "@/components/PrintButton";
import { GuiaPasanteDia1 } from "@/components/team/GuiaPasanteDia1";
import { GuiaPasanteDia2 } from "@/components/team/GuiaPasanteDia2";
import { GuiaPasanteDia3 } from "@/components/team/GuiaPasanteDia3";
import { GuiaPasanteDia4 } from "@/components/team/GuiaPasanteDia4";
import { getOrCreateActiveCohort } from "@/lib/cohort";
import { LockIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export default async function GuiaPasantePage({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const day = Number(n);
  const cohort = await getOrCreateActiveCohort();
  if (day > cohort.openDay) {
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-6 sm:p-8">
        <Link href="/dashboard" className="text-sm text-[var(--color-brand-blue-accent)] underline">
          ← Volver al resumen
        </Link>
        <p className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5 text-sm text-[var(--color-brand-text-secondary)]">
          <LockIcon className="h-4 w-4 shrink-0" /> Este día todavía no está disponible. El evaluador lo habilita a medida que avanza el reto.
        </p>
      </main>
    );
  }

  return (
    <main className="print-light mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 bg-[var(--color-background)] p-6 print:bg-white print:p-0 sm:p-8">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/day/${day}`} className="text-sm text-[var(--color-brand-blue-accent)] underline">
          ← Volver al Día {day}
        </Link>
        <PrintButton />
      </div>

      {day === 1 ? (
        <GuiaPasanteDia1 />
      ) : day === 2 ? (
        <GuiaPasanteDia2 />
      ) : day === 3 ? (
        <GuiaPasanteDia3 />
      ) : day === 4 ? (
        <GuiaPasanteDia4 />
      ) : (
        <p className="text-sm text-[var(--color-brand-text-secondary)]">La guía del pasante para este día todavía no está disponible.</p>
      )}
    </main>
  );
}
