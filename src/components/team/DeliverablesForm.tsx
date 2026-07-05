"use client";

import { useActionState } from "react";
import { submitDeliverablesAction, type SubmitDeliverablesState } from "@/lib/teamActions";

/**
 * Deliberately not the full `Concepto` type — that includes a `get`
 * function (used server-side to score against finBench), and Client
 * Components can't receive function props from a Server Component. Only
 * the serializable fields this form actually renders.
 */
export interface ConceptoSummary {
  id: string;
  label: string;
  unit: "COP" | "score" | "x";
}

export function DeliverablesForm({
  day,
  concepts,
  initialValues,
}: {
  day: number;
  concepts: ConceptoSummary[];
  initialValues: Record<string, number>;
}) {
  const [state, formAction, pending] = useActionState<SubmitDeliverablesState, FormData>(
    submitDeliverablesAction.bind(null, day),
    {}
  );

  if (concepts.length === 0) return null;

  return (
    <form action={formAction} className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Reporte financiero/actuarial — Día {day}
      </h3>
      <p className="mb-3 text-sm text-[var(--color-brand-text-secondary)]">
        Reporta los valores que calculaste. Se comparan contra el motor con una banda de tolerancia — no tienen que
        ser exactos, pero sí razonablemente cercanos.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {concepts.map((c) => (
          <label key={c.id} className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
            {c.label} {c.unit === "COP" ? "($)" : c.unit === "x" ? "(veces)" : ""}
            <input
              type="number"
              step="any"
              name={c.id}
              defaultValue={initialValues[c.id] ?? ""}
              disabled={pending}
              className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
            />
          </label>
        ))}
      </div>
      {state.error && <p className="mt-3 text-sm text-[var(--color-brand-red)]">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm text-[var(--color-brand-green)]">Reporte guardado.</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded bg-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-blue-dark)] disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar reporte"}
      </button>
    </form>
  );
}
