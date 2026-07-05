"use client";

import { useActionState } from "react";
import { submitAnalyticsAction, type SubmitAnalyticsState } from "@/lib/teamActions";
import { SEGMENTS } from "@/domain/grading/analytics";
import type { Recommendation } from "@/domain/grading/analytics";

const OPTIONS: { value: Recommendation; label: string }[] = [
  { value: "crecer", label: "Crecer" },
  { value: "mantener", label: "Mantener" },
  { value: "disminuir", label: "Disminuir" },
];

export function AnalyticsForm({
  day,
  initialRecommendations,
}: {
  day: number;
  initialRecommendations: Record<string, Recommendation>;
}) {
  const [state, formAction, pending] = useActionState<SubmitAnalyticsState, FormData>(
    submitAnalyticsAction.bind(null, day),
    {}
  );

  return (
    <form action={formAction} className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Recomendación sectorial — Día {day}
      </h3>
      <p className="mb-3 text-sm text-[var(--color-brand-text-secondary)]">
        Para cada segmento, recomienda si la aseguradora debería crecer, mantener o disminuir su exposición, en
        vista del Año 3. Se califica contra el loss ratio real observado en ese segmento.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SEGMENTS.map((seg) => (
          <label key={seg.key} className="flex items-center justify-between gap-2 text-sm text-[var(--color-foreground)]">
            {seg.label}
            <select
              name={seg.key}
              defaultValue={initialRecommendations[seg.key] ?? ""}
              disabled={pending}
              className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
            >
              <option value="">—</option>
              {OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {state.error && <p className="mt-3 text-sm text-[var(--color-brand-red)]">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm text-[var(--color-brand-green)]">Recomendación guardada.</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded bg-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-blue-dark)] disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar recomendación"}
      </button>
    </form>
  );
}
