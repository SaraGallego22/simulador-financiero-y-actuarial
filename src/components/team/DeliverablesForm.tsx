"use client";

import { useActionState } from "react";
import { submitDeliverablesAction, type SubmitDeliverablesState } from "@/lib/teamActions";
import { GROUP_LABELS } from "@/domain/grading/concepts";
import type { ConceptGroup } from "@/domain/grading/concepts";
import { LockIcon } from "@/components/ui/icons";

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
  /** Set only on concepts that belong to a full P&G/Balance statement — see ConceptGroup. Ungrouped concepts render in a flat fallback section. */
  group?: ConceptGroup;
}

/** Lines whose label should render bold/emphasized — subtotal/total rows of a real financial statement, so the vertical layout reads like one instead of a flat list. */
const EMPHASIZED_ID_SUFFIXES = ["_rt", "_uai", "_uneta", "_activos", "_pasivoPatrim"];
function isEmphasized(id: string): boolean {
  return EMPHASIZED_ID_SUFFIXES.some((suffix) => id.endsWith(suffix));
}

function StatementRow({ c, initialValue, disabled }: { c: ConceptoSummary; initialValue: number | undefined; disabled: boolean }) {
  const emphasized = isEmphasized(c.id);
  return (
    <label
      className={`flex items-center justify-between gap-3 border-t border-[var(--color-brand-gray-light)] px-3 py-1.5 text-sm ${emphasized ? "font-semibold" : ""}`}
    >
      <span className="text-[var(--color-foreground)]">{c.label}</span>
      <input
        type="number"
        step="any"
        name={c.id}
        defaultValue={initialValue ?? ""}
        disabled={disabled}
        className="w-40 rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-right text-sm disabled:opacity-50"
      />
    </label>
  );
}

export function DeliverablesForm({
  day,
  concepts,
  initialValues,
  locked = false,
}: {
  day: number;
  concepts: ConceptoSummary[];
  initialValues: Record<string, number>;
  /** True once a later day is open — this day's report can no longer be resubmitted. */
  locked?: boolean;
}) {
  const [state, formAction, pending] = useActionState<SubmitDeliverablesState, FormData>(
    submitDeliverablesAction.bind(null, day),
    {}
  );

  if (concepts.length === 0) return null;
  const disabled = pending || locked;

  const grouped = new Map<ConceptGroup, ConceptoSummary[]>();
  const ungrouped: ConceptoSummary[] = [];
  for (const c of concepts) {
    if (c.group) {
      if (!grouped.has(c.group)) grouped.set(c.group, []);
      grouped.get(c.group)!.push(c);
    } else {
      ungrouped.push(c);
    }
  }

  return (
    <form action={formAction} className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Reporte financiero/actuarial — Día {day}
      </h3>
      <p className="mb-4 text-sm text-[var(--color-brand-text-secondary)]">
        Reporta los valores que calculaste, línea por línea, como en un estado financiero real. Se comparan contra el
        motor con una banda de tolerancia — no tienen que ser exactos, pero sí razonablemente cercanos.
      </p>

      {locked && (
        <p className="mb-4 flex items-center gap-2 rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2 text-xs text-[var(--color-brand-text-secondary)]">
          <LockIcon className="h-4 w-4 shrink-0" /> Día bloqueado — el evaluador habilitó un día posterior, ya no puedes cambiar este reporte.
        </p>
      )}

      <div className="flex flex-col gap-5">
        {[...grouped.entries()].map(([group, groupConcepts]) => (
          <div key={group} className="overflow-hidden rounded border border-[var(--color-brand-gray-light)]">
            <p className="bg-[var(--color-brand-blue-light)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              {GROUP_LABELS[group]}
            </p>
            <div>
              {groupConcepts.map((c) => (
                <StatementRow key={c.id} c={c} initialValue={initialValues[c.id]} disabled={disabled} />
              ))}
            </div>
          </div>
        ))}

        {ungrouped.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ungrouped.map((c) => (
              <label key={c.id} className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
                {c.label} {c.unit === "COP" ? "($)" : c.unit === "x" ? "(veces)" : ""}
                <input
                  type="number"
                  step="any"
                  name={c.id}
                  defaultValue={initialValues[c.id] ?? ""}
                  disabled={disabled}
                  className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm disabled:opacity-50"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {state.error && <p className="mt-3 text-sm text-[var(--color-brand-red)]">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm text-[var(--color-brand-green)]">Reporte guardado.</p>}
      {!locked && (
        <button
          type="submit"
          disabled={pending}
          className="mt-4 rounded-full bg-[var(--color-brand-blue)] shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 active:translate-y-0 hover:shadow-[var(--shadow-md)] px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar reporte"}
        </button>
      )}
    </form>
  );
}
