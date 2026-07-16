"use client";

import { useActionState, useMemo, useState } from "react";
import { submitMinVarianceAction, type SubmitMinVarianceState } from "@/lib/teamActions";
import { INSTRUMENTS, displayYield } from "@/domain/finance/instruments";
import { TARGET_RETURN } from "@/domain/finance/markowitz";
import { Button } from "@/components/ui/button";

function emptyWeights(): Record<string, number> {
  const w: Record<string, number> = {};
  for (const ins of INSTRUMENTS) w[ins.id] = 0;
  return w;
}

export function MinVarianceForm({ initialWeights }: { initialWeights: Record<string, number> | null }) {
  const [state, formAction, pending] = useActionState<SubmitMinVarianceState, FormData>(submitMinVarianceAction, {});
  const [weights, setWeights] = useState<Record<string, number>>(() => initialWeights ?? emptyWeights());

  const { total, expectedReturn, meetsTarget } = useMemo(() => {
    const total = Object.values(weights).reduce((s, w) => s + (w || 0), 0);
    if (total <= 0) return { total, expectedReturn: 0, meetsTarget: false };
    const expectedReturn = INSTRUMENTS.reduce((s, ins) => s + ((weights[ins.id] || 0) / total) * ins.yield, 0);
    return { total, expectedReturn, meetsTarget: expectedReturn >= TARGET_RETURN - 1e-6 };
  }, [weights]);

  return (
    <form
      action={formAction}
      className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue-accent)] bg-[var(--color-brand-surface)] p-5"
    >
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Portafolio de mínima varianza — Día 1
      </h3>
      <p className="mb-4 text-sm text-[var(--color-brand-text-secondary)]">
        Antes de escribir una sola póliza, presenta al regulador el portafolio de <strong>menor varianza posible</strong>{" "}
        que aún alcance un rendimiento esperado de al menos <strong>{(TARGET_RETURN * 100).toFixed(0)}%</strong> anual —
        usa la matriz de covarianza (pestaña de instrumentos) para razonar el trade-off, no solo la volatilidad
        individual de cada instrumento. Este portafolio es una decisión aparte del árbol de inversión real, que se
        somete en Día 2 junto con tus cifras reales de prima y siniestros.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {INSTRUMENTS.map((ins) => (
          <label key={ins.id} className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
            {ins.id}{" "}
            <span className="font-normal">
              (rendimiento {(displayYield(ins) * 100).toFixed(1)}% · volatilidad {(ins.volAnual * 100).toFixed(1)}%)
            </span>
            <input
              type="number"
              min="0"
              step="1"
              name={`w-${ins.id}`}
              value={weights[ins.id] || ""}
              onChange={(e) => setWeights((w) => ({ ...w, [ins.id]: Number(e.target.value) }))}
              className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
            />
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-1 text-xs">
        <p className={Math.round(total) === 100 ? "text-[var(--color-brand-green)]" : "text-[var(--color-brand-text-secondary)]"}>
          Total: {total.toFixed(0)}% {Math.round(total) !== 100 && "(se normaliza automáticamente a 100%)"}
        </p>
        <p className={meetsTarget ? "text-[var(--color-brand-green)]" : "text-[var(--color-brand-red)]"}>
          Rendimiento esperado: {(expectedReturn * 100).toFixed(2)}% {!meetsTarget && `(falta llegar a ${(TARGET_RETURN * 100).toFixed(0)}%)`}
        </p>
      </div>

      <Button type="submit" variant="primary" loading={pending} loadingText="Guardando…" className="mt-4">
        Guardar portafolio de mínima varianza
      </Button>

      {state.error && <p className="mt-3 text-sm text-[var(--color-brand-red)]">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm text-[var(--color-brand-green)]">Portafolio guardado.</p>}
    </form>
  );
}
