"use client";

import { useActionState, useMemo, useState } from "react";
import { submitPortfolioAction, type SubmitPortfolioState } from "@/lib/teamActions";
import { INSTRUMENTS, INSTRUMENT_BY_ID, isBondLike } from "@/domain/finance/instruments";
import type { PortfolioDecisionV2 } from "@/domain/finance/instruments";

type MaturityChoice = { mode: "cash" | "reinvest"; target: string };

function AllocationGrid({
  values,
  onChange,
}: {
  values: Record<string, number>;
  onChange: (id: string, value: number) => void;
}) {
  const total = Object.values(values).reduce((a, b) => a + (Number(b) || 0), 0);
  return (
    <div>
      <p className="mb-1 text-sm font-semibold text-[var(--color-foreground)]">Asignación (nueva liquidez)</p>
      <p className="mb-2 text-xs text-[var(--color-brand-text-secondary)]">
        Cómo inviertes cualquier plata nueva que tengas que poner a trabajar — el fondeo mensual, y cualquier
        vencimiento que no tenga una regla propia más abajo.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {INSTRUMENTS.map((ins) => (
          <label key={ins.id} className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
            {ins.id}
            <input
              type="number"
              min="0"
              step="1"
              name={`alloc_${ins.id}`}
              value={values[ins.id] || ""}
              onChange={(e) => onChange(ins.id, Number(e.target.value))}
              className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
            />
          </label>
        ))}
      </div>
      <p className={`mt-1 text-xs ${Math.round(total) === 100 ? "text-[var(--color-brand-green)]" : "text-[var(--color-brand-text-secondary)]"}`}>
        Total: {total.toFixed(0)}% {Math.round(total) !== 100 && "(se normaliza automáticamente a 100%)"}
      </p>
    </div>
  );
}

function MaturityRuleRow({
  instrumentId,
  choice,
  onChange,
}: {
  instrumentId: string;
  choice: MaturityChoice;
  onChange: (id: string, next: MaturityChoice) => void;
}) {
  const ins = INSTRUMENT_BY_ID[instrumentId];
  return (
    <div className="rounded border border-[var(--color-brand-gray-light)] p-2">
      <p className="mb-1 text-xs font-semibold text-[var(--color-foreground)]">
        {ins.nombre} <span className="text-[var(--color-brand-text-secondary)]">— vence a {ins.plazoM} meses</span>
      </p>
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-brand-text-secondary)]">
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={choice.mode === "cash"}
            onChange={() => onChange(instrumentId, { mode: "cash", target: instrumentId })}
          />
          Mantener en caja
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            checked={choice.mode === "reinvest"}
            onChange={() => onChange(instrumentId, { mode: "reinvest", target: choice.mode === "reinvest" ? choice.target : instrumentId })}
          />
          Reinvertir en:
          <select
            value={choice.mode === "reinvest" ? choice.target : instrumentId}
            onChange={(e) => onChange(instrumentId, { mode: "reinvest", target: e.target.value })}
            disabled={choice.mode !== "reinvest"}
            className="rounded border border-[var(--color-brand-gray-light)] px-1 py-0.5 text-xs disabled:opacity-50"
          >
            {INSTRUMENTS.map((target) => (
              <option key={target.id} value={target.id}>
                {target.id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <input type="hidden" name={`maturity_${instrumentId}`} value={choice.mode === "cash" ? "cash" : choice.target} />
    </div>
  );
}

export function PortfolioForm({ day, initialDecision }: { day: number; initialDecision: PortfolioDecisionV2 | null }) {
  const [state, formAction, pending] = useActionState<SubmitPortfolioState, FormData>(submitPortfolioAction.bind(null, day), {});

  const [allocation, setAllocation] = useState<Record<string, number>>(() => {
    const v: Record<string, number> = {};
    for (const ins of INSTRUMENTS) v[ins.id] = initialDecision?.allocation[ins.id] ?? 0;
    return v;
  });

  const [maturity, setMaturity] = useState<Record<string, MaturityChoice>>(() => {
    const v: Record<string, MaturityChoice> = {};
    for (const ins of INSTRUMENTS) {
      if (!isBondLike(ins)) continue;
      const rule = initialDecision?.maturityRules[ins.id];
      if (rule?.action === "cash") v[ins.id] = { mode: "cash", target: ins.id };
      else if (rule?.action === "reinvest") v[ins.id] = { mode: "reinvest", target: rule.instrumentId };
      else v[ins.id] = { mode: "cash", target: ins.id };
    }
    return v;
  });

  // Which instruments actually need a maturity rule shown: anything held in
  // the allocation with a real maturity, plus anything reachable by
  // following "reinvertir en X" chains from there. Grows monotonically and
  // is bounded by INSTRUMENTS.length, so a self-referential rule (e.g.
  // "CDT90 -> reinvertir en CDT90", a rolling ladder) can't loop forever —
  // it just stops adding names once everything reachable is already in.
  const reachable = useMemo(() => {
    const set = new Set<string>();
    for (const ins of INSTRUMENTS) {
      if (isBondLike(ins) && (allocation[ins.id] ?? 0) > 0) set.add(ins.id);
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const [sourceId, choice] of Object.entries(maturity)) {
        if (!set.has(sourceId) || choice.mode !== "reinvest") continue;
        const targetIns = INSTRUMENT_BY_ID[choice.target];
        if (targetIns && isBondLike(targetIns) && !set.has(choice.target)) {
          set.add(choice.target);
          changed = true;
        }
      }
    }
    return set;
  }, [allocation, maturity]);

  return (
    <form
      action={formAction}
      className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue-accent)] bg-[var(--color-brand-surface)] p-5"
    >
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Portafolio de inversión — Día {day}
      </h3>
      <p className="mb-4 text-sm text-[var(--color-brand-text-secondary)]">
        Define dos cosas: cómo inviertes la plata nueva de cada mes, y qué le pasa a cada instrumento cuando vence —
        mantenerlo en caja, o reinvertirlo (y si reinviertes en otro instrumento con vencimiento propio, también
        eliges su regla). El cumplimiento de la caja mínima se califica en todo el horizonte, no solo en el momento
        inicial.
      </p>

      <div className="flex flex-col gap-5">
        <AllocationGrid values={allocation} onChange={(id, value) => setAllocation((v) => ({ ...v, [id]: value }))} />

        <div>
          <p className="mb-1 text-sm font-semibold text-[var(--color-foreground)]">Reglas de vencimiento</p>
          <p className="mb-2 text-xs text-[var(--color-brand-text-secondary)]">
            Se aplican en cada vencimiento futuro de ese instrumento hasta que las cambies.
          </p>
          <div className="flex flex-col gap-2">
            {INSTRUMENTS.filter((ins) => reachable.has(ins.id)).map((ins) => (
              <MaturityRuleRow
                key={ins.id}
                instrumentId={ins.id}
                choice={maturity[ins.id] ?? { mode: "cash", target: ins.id }}
                onChange={(id, next) => setMaturity((m) => ({ ...m, [id]: next }))}
              />
            ))}
            {INSTRUMENTS.filter((ins) => reachable.has(ins.id)).length === 0 && (
              <p className="text-xs text-[var(--color-brand-text-secondary)]">
                Asigna peso a un instrumento con vencimiento (no LIQ ni acciones) para definir su regla.
              </p>
            )}
          </div>
        </div>
      </div>

      {state.error && <p className="mt-3 text-sm text-[var(--color-brand-red)]">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm text-[var(--color-brand-green)]">Portafolio guardado.</p>}
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
