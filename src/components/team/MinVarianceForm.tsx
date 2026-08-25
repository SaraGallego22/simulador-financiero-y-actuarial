"use client";

import { useActionState, useMemo, useState } from "react";
import { submitMinVarianceAction, type SubmitMinVarianceState } from "@/lib/teamActions";
import { INSTRUMENTS } from "@/domain/finance/instruments";
import { TARGET_RETURN } from "@/domain/finance/markowitz";
import { Button } from "@/components/ui/button";
import { LockIcon } from "@/components/ui/icons";

function emptyWeights(): Record<string, number> {
  const w: Record<string, number> = {};
  for (const ins of INSTRUMENTS) w[ins.id] = 0;
  return w;
}

export function MinVarianceForm({
  initialWeights,
  locked = false,
}: {
  initialWeights: Record<string, number> | null;
  /** True once a later day is open — this exercise can no longer be resubmitted. */
  locked?: boolean;
}) {
  const [state, formAction, pending] = useActionState<SubmitMinVarianceState, FormData>(submitMinVarianceAction, {});
  const [weights, setWeights] = useState<Record<string, number>>(() => initialWeights ?? emptyWeights());

  const { total, meetsTarget } = useMemo(() => {
    const total = Object.values(weights).reduce((s, w) => s + (w || 0), 0);
    if (total <= 0) return { total, meetsTarget: false };
    const expectedReturn = INSTRUMENTS.reduce((s, ins) => s + ((weights[ins.id] || 0) / total) * ins.yield, 0);
    return { total, meetsTarget: expectedReturn >= TARGET_RETURN - 1e-6 };
  }, [weights]);

  return (
    <form
      action={formAction}
      className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5"
    >
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Portafolio de mínima varianza — Día 1
      </h3>
      <p className="mb-4 text-sm text-[var(--color-brand-text-secondary)]">
        Antes de escribir una sola póliza, presenta al regulador el portafolio de <strong>menor varianza posible</strong>{" "}
        que aún alcance un rendimiento esperado de al menos <strong>{(TARGET_RETURN * 100).toFixed(0)}%</strong> anual —
        la volatilidad de cada instrumento sale de la diagonal de la matriz de covarianza (guía del pasante, sección
        5.1). Este portafolio es una decisión aparte del calendario de inversión
        real, que se somete en Día 2 junto con tus cifras reales de prima y siniestros.
      </p>

      {locked && (
        <p className="mb-3 flex items-center gap-2 rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2 text-xs text-[var(--color-brand-text-secondary)]">
          <LockIcon className="h-4 w-4 shrink-0" /> Día bloqueado — el evaluador habilitó un día posterior, ya no puedes cambiar este portafolio.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {INSTRUMENTS.map((ins) => (
          <label key={ins.id} className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
            {ins.id}
            <input
              type="number"
              min="0"
              step="0.001"
              name={`w-${ins.id}`}
              value={weights[ins.id] || ""}
              onChange={(e) => setWeights((w) => ({ ...w, [ins.id]: Number(e.target.value) }))}
              disabled={locked}
              className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm disabled:opacity-50"
            />
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-1 text-xs">
        <p className={Math.abs(total - 100) < 0.001 ? "text-[var(--color-brand-green)]" : "text-[var(--color-brand-text-secondary)]"}>
          Total: {total.toFixed(3)}% {Math.abs(total - 100) >= 0.001 && "(se normaliza automáticamente a 100%)"}
        </p>
        <p className={meetsTarget ? "text-[var(--color-brand-green)]" : "text-[var(--color-brand-red)]"}>
          {meetsTarget ? "Cumple con el rendimiento mínimo" : "No cumple con el rendimiento mínimo"}
        </p>
      </div>

      {!locked && (
        <Button type="submit" variant="primary" loading={pending} loadingText="Guardando…" className="mt-4">
          Guardar portafolio de mínima varianza
        </Button>
      )}

      {state.error && <p className="mt-3 text-sm text-[var(--color-brand-red)]">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm text-[var(--color-brand-green)]">Portafolio guardado.</p>}
    </form>
  );
}
