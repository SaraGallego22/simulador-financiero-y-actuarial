"use client";

import { useActionState } from "react";
import { uploadPortfolioAction, type UploadPortfolioState } from "@/lib/teamActions";

export function PortfolioUpload({ day, hasAllocation }: { day: number; hasAllocation: boolean }) {
  const [state, formAction, pending] = useActionState<UploadPortfolioState, FormData>(
    uploadPortfolioAction.bind(null, day),
    {}
  );

  return (
    <div className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue)] bg-white p-5">
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
        Portafolio de inversión — Día {day}
      </h3>
      <p className="mb-3 text-sm text-gray-600">
        Sube un CSV con columnas <code>instrumento_id,asignacion</code> definiendo cómo distribuyes tu portafolio
        entre los instrumentos disponibles.
      </p>
      <form action={formAction} className="flex items-center gap-3">
        <input type="file" name="file" accept=".csv" required disabled={pending} className="text-sm" />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-blue-dark)] disabled:opacity-50"
        >
          {pending ? "Subiendo…" : "Subir"}
        </button>
      </form>
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="mt-2 text-sm text-green-700">Portafolio guardado.</p>}
      {!state.error && !state.success && hasAllocation && (
        <p className="mt-2 text-sm text-green-700">Ya tienes un portafolio guardado para este día.</p>
      )}
    </div>
  );
}
