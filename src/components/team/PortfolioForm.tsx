"use client";

import { useActionState, useState } from "react";
import { submitPortfolioAction, type SubmitPortfolioState } from "@/lib/teamActions";
import { INSTRUMENTS } from "@/domain/finance/instruments";
import type { Allocation } from "@/domain/finance/instruments";

function AllocationSection({
  prefix,
  title,
  help,
  initialValues,
}: {
  prefix: "initial" | "reinvest";
  title: string;
  help: string;
  initialValues: Allocation;
}) {
  const [values, setValues] = useState<Record<string, number>>(() => {
    const v: Record<string, number> = {};
    for (const ins of INSTRUMENTS) v[ins.id] = initialValues[ins.id] ?? 0;
    return v;
  });
  const total = Object.values(values).reduce((a, b) => a + (Number(b) || 0), 0);

  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-gray-700">{title}</p>
      <p className="mb-2 text-xs text-gray-500">{help}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {INSTRUMENTS.map((ins) => (
          <label key={ins.id} className="flex flex-col gap-1 text-xs text-gray-600">
            {ins.id}
            <input
              type="number"
              min="0"
              step="1"
              name={`${prefix}_${ins.id}`}
              value={values[ins.id] || ""}
              onChange={(e) => setValues((v) => ({ ...v, [ins.id]: Number(e.target.value) }))}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
        ))}
      </div>
      <p className={`mt-1 text-xs ${Math.round(total) === 100 ? "text-green-700" : "text-gray-500"}`}>
        Total: {total.toFixed(0)}% {Math.round(total) !== 100 && "(se normaliza automáticamente a 100%)"}
      </p>
    </div>
  );
}

export function PortfolioForm({
  day,
  initialDecision,
}: {
  day: number;
  initialDecision: { initial: Allocation; reinvest: Allocation } | null;
}) {
  const [state, formAction, pending] = useActionState<SubmitPortfolioState, FormData>(
    submitPortfolioAction.bind(null, day),
    {}
  );

  return (
    <form action={formAction} className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue)] bg-white p-5">
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue)]">
        Portafolio de inversión — Día {day}
      </h3>
      <p className="mb-4 text-sm text-gray-600">
        Define dos decisiones, no una: cómo inviertes el fondeo del Año 1, y qué política sigues para reinvertir
        cada vez que uno de esos instrumentos venza. La nota de calce evalúa el match en <em>todo</em> el horizonte,
        no solo el peor mes — una buena asignación inicial sin un plan de reinversión no basta.
      </p>

      <div className="flex flex-col gap-5">
        <AllocationSection
          prefix="initial"
          title="1 · Asignación inicial (fondeo Año 1)"
          help="Cómo inviertes los aportes mensuales que financian la reserva durante el primer año."
          initialValues={initialDecision?.initial ?? {}}
        />
        <AllocationSection
          prefix="reinvest"
          title="2 · Política de reinversión (post Año 1)"
          help="Cómo reinviertes cada vez que un instrumento vence, una vez termina el fondeo inicial — puede ser distinta de la inicial."
          initialValues={initialDecision?.reinvest ?? {}}
        />
      </div>

      {state.error && <p className="mt-3 text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm text-green-700">Portafolio guardado.</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded bg-[var(--color-brand-blue)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-brand-blue-dark)] disabled:opacity-50"
      >
        {pending ? "Guardando…" : "Guardar portafolio"}
      </button>
    </form>
  );
}
