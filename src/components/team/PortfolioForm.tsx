"use client";

import { useActionState, useState } from "react";
import { submitPortfolioAction, type SubmitPortfolioState } from "@/lib/teamActions";
import { INSTRUMENTS, MAX_SCHEDULE_ENTRIES } from "@/domain/finance/instruments";
import type { PortfolioDecisionV4, MonthlyAllocationEntry, Allocation } from "@/domain/finance/instruments";
import { BUILD_MONTHS, HORIZON } from "@/domain/reserving/constants";
import { PortfolioScheduleView } from "@/components/AlmLadderTable";
import { Button } from "@/components/ui/button";

const TOTAL_MONTHS = BUILD_MONTHS + HORIZON;

type GridRows = Record<string, number>;

function emptyGridRows(): GridRows {
  const rows: GridRows = {};
  for (const ins of INSTRUMENTS) rows[ins.id] = 0;
  return rows;
}

function rowsToAllocation(rows: GridRows): Allocation {
  const allocation: Allocation = {};
  for (const ins of INSTRUMENTS) allocation[ins.id] = rows[ins.id] || 0;
  return allocation;
}

function allocationToRows(allocation: Allocation): GridRows {
  const rows = emptyGridRows();
  for (const ins of INSTRUMENTS) rows[ins.id] = Number(allocation[ins.id]) || 0;
  return rows;
}

function AllocationStepGrid({ rows, onChange }: { rows: GridRows; onChange: (id: string, weight: number) => void }) {
  const total = Object.values(rows).reduce((a, w) => a + (w || 0), 0);
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {INSTRUMENTS.map((ins) => (
          <label key={ins.id} className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
            {ins.id}
            <input
              type="number"
              min="0"
              step="1"
              value={rows[ins.id] || ""}
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

interface Checkpoint {
  month: number;
  rows: GridRows;
}

function decisionToCheckpoints(decision: PortfolioDecisionV4 | null): Checkpoint[] {
  if (!decision || decision.schedule.length === 0) return [{ month: 0, rows: emptyGridRows() }];
  return decision.schedule.map((e) => ({ month: e.month, rows: allocationToRows(e.allocation) }));
}

export function PortfolioForm({ day, initialDecision }: { day: number; initialDecision: PortfolioDecisionV4 | null }) {
  const [state, formAction, pending] = useActionState<SubmitPortfolioState, FormData>(submitPortfolioAction.bind(null, day), {});

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>(() => decisionToCheckpoints(initialDecision));

  function updateCheckpointWeight(index: number, instrumentId: string, weight: number) {
    setCheckpoints((prev) => prev.map((c, i) => (i === index ? { ...c, rows: { ...c.rows, [instrumentId]: weight } } : c)));
  }

  function updateCheckpointMonth(index: number, month: number) {
    setCheckpoints((prev) => prev.map((c, i) => (i === index ? { ...c, month } : c)));
  }

  function addCheckpoint() {
    if (checkpoints.length >= MAX_SCHEDULE_ENTRIES) return;
    const lastMonth = checkpoints.reduce((m, c) => Math.max(m, c.month), 0);
    const nextMonth = Math.min(TOTAL_MONTHS - 1, lastMonth + 1);
    setCheckpoints((prev) => [...prev, { month: nextMonth, rows: emptyGridRows() }]);
  }

  function removeCheckpoint(index: number) {
    setCheckpoints((prev) => prev.filter((_, i) => i !== index));
  }

  const sorted = [...checkpoints].sort((a, b) => a.month - b.month);
  const months = sorted.map((c) => c.month);
  const hasDuplicateMonths = new Set(months).size !== months.length;
  const schedule: MonthlyAllocationEntry[] = sorted.map((c) => ({ month: c.month, allocation: rowsToAllocation(c.rows) }));
  const everyCheckpointHasWeight = schedule.every((e) => Object.values(e.allocation).reduce((s, w) => s + (Number(w) || 0), 0) > 0);
  const canSubmit = !hasDuplicateMonths && everyCheckpointHasWeight && sorted[0]?.month === 0;

  return (
    <form
      action={formAction}
      className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5"
    >
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Portafolio de inversión — Día {day}
      </h3>
      <p className="mb-4 text-sm text-[var(--color-brand-text-secondary)]">
        Decides cómo invertir cada mes: la asignación que definas para un mes se mantiene fija — incluyendo
        cualquier vencimiento que vaya llegando mes a mes — hasta que agregues un cambio de estrategia en un mes
        posterior. La nota de rendimiento está ajustada por riesgo: un instrumento con mayor volatilidad exige un
        rendimiento más alto para que valga la pena — perseguir el rendimiento nominal más alto (acciones) sin
        cuidar la volatilidad puede darte una nota peor que un portafolio más balanceado. La volatilidad de cada
        instrumento no se muestra aquí directamente — puedes deducirla de la diagonal de la matriz de covarianza
        (pestaña de instrumentos, arriba). Si te falta caja en algún mes, el sistema cubre la diferencia vendiendo
        LIQ primero (gratis, es su función) y, si no alcanza, vendiendo el resto de tu portafolio empezando por lo
        menos volátil — pero verte obligado a vender es un castigo aparte en la nota, y vender acciones bajo
        presión pesa mucho más que vender un CDT o un TES.
      </p>

      <div className="flex flex-col gap-4">
        {sorted.map((checkpoint) => {
          const originalIndex = checkpoints.indexOf(checkpoint);
          const isFirst = checkpoint === sorted[0];
          return (
            <div key={originalIndex} className="rounded border border-[var(--color-brand-gray-light)] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                {isFirst ? (
                  <p className="text-sm font-semibold text-[var(--color-foreground)]">Desde el mes 0 (asignación inicial)</p>
                ) : (
                  <label className="flex items-center gap-2 text-sm text-[var(--color-foreground)]">
                    Desde el mes
                    <input
                      type="number"
                      min="1"
                      max={TOTAL_MONTHS - 1}
                      step="1"
                      value={checkpoint.month}
                      onChange={(e) => updateCheckpointMonth(originalIndex, Number(e.target.value))}
                      className="w-20 rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
                    />
                  </label>
                )}
                {!isFirst && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => removeCheckpoint(originalIndex)}>
                    Quitar
                  </Button>
                )}
              </div>
              <AllocationStepGrid rows={checkpoint.rows} onChange={(id, w) => updateCheckpointWeight(originalIndex, id, w)} />
            </div>
          );
        })}

        {hasDuplicateMonths && (
          <p className="text-xs text-[var(--color-brand-red)]">Dos cambios de estrategia no pueden caer en el mismo mes.</p>
        )}

        {checkpoints.length < MAX_SCHEDULE_ENTRIES && (
          <Button type="button" variant="secondary" onClick={addCheckpoint} className="w-fit">
            Agregar cambio de estrategia
          </Button>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">Vista previa de tu calendario</p>
          <PortfolioScheduleView schedule={schedule} />
        </div>

        <input type="hidden" name="decisionSchedule" value={JSON.stringify({ schedule })} />
        <Button type="submit" variant="primary" loading={pending} loadingText="Guardando…" disabled={!canSubmit} className="w-fit">
          Guardar portafolio
        </Button>
      </div>

      {state.error && <p className="mt-3 text-sm text-[var(--color-brand-red)]">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm text-[var(--color-brand-green)]">Portafolio guardado.</p>}
    </form>
  );
}
