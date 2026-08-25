"use client";

import { useActionState, useState } from "react";
import { submitPortfolioAction, type SubmitPortfolioState } from "@/lib/teamActions";
import { INSTRUMENTS, MAX_SCHEDULE_ENTRIES } from "@/domain/finance/instruments";
import type { PortfolioDecisionV4, MonthlyAllocationEntry, Allocation } from "@/domain/finance/instruments";
import { BUILD_MONTHS, HORIZON } from "@/domain/reserving/constants";
import { PortfolioScheduleView } from "@/components/AlmLadderTable";
import { Button } from "@/components/ui/button";
import { LockIcon } from "@/components/ui/icons";

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

function AllocationStepGrid({
  rows,
  onChange,
  disabled = false,
}: {
  rows: GridRows;
  onChange: (id: string, weight: number) => void;
  disabled?: boolean;
}) {
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
              step="0.001"
              value={rows[ins.id] || ""}
              onChange={(e) => onChange(ins.id, Number(e.target.value))}
              disabled={disabled}
              className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm disabled:opacity-50"
            />
          </label>
        ))}
      </div>
      <p className={`mt-1 text-xs ${Math.abs(total - 100) < 0.001 ? "text-[var(--color-brand-green)]" : "text-[var(--color-brand-text-secondary)]"}`}>
        Total: {total.toFixed(3)}% {Math.abs(total - 100) >= 0.001 && "(se normaliza automáticamente a 100%)"}
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

export function PortfolioForm({
  day,
  initialDecision,
  title,
  showCapitalSocial = true,
  locked = false,
}: {
  day: number;
  initialDecision: PortfolioDecisionV4 | null;
  /** Overrides the default "Portafolio de inversión — Día {day}" header — used for Día 3's optional "Portafolio 2028" resubmission, whose own schedule (see finBenchHelper.ts's year2Decision) fully replaces Día 2's for Año 2's real ALM. */
  title?: string;
  /**
   * Hides the Capital Social block — for Día 3's "Portafolio 2028" form,
   * where it would be misleading: Capital Social is only ever funded once,
   * at Año 1's month 0 (almSimRealYear), so a Día 3 resubmission's own
   * capitalSocialAllocation is never read. Still submitted (isPortfolioDecisionV4
   * requires the field structurally) via a fixed all-in-first-instrument
   * default, just not shown or editable.
   */
  showCapitalSocial?: boolean;
  /** True once a later day is open — this day's portfolio can no longer be resubmitted. */
  locked?: boolean;
}) {
  const [state, formAction, pending] = useActionState<SubmitPortfolioState, FormData>(submitPortfolioAction.bind(null, day), {});

  const [capitalSocialRows, setCapitalSocialRows] = useState<GridRows>(() => {
    if (initialDecision) return allocationToRows(initialDecision.capitalSocialAllocation);
    if (!showCapitalSocial) {
      const rows = emptyGridRows();
      rows[INSTRUMENTS[0].id] = 100;
      return rows;
    }
    return emptyGridRows();
  });
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
  const capitalSocialAllocation = rowsToAllocation(capitalSocialRows);
  const capitalSocialHasWeight = Object.values(capitalSocialAllocation).reduce((s, w) => s + (Number(w) || 0), 0) > 0;
  const canSubmit = !locked && !hasDuplicateMonths && everyCheckpointHasWeight && capitalSocialHasWeight && sorted[0]?.month === 0;

  return (
    <form
      action={formAction}
      className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5"
    >
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        {title ?? `Portafolio de inversión — Día ${day}`}
      </h3>
      <p className="mb-4 text-sm text-[var(--color-brand-text-secondary)]">
        Decides cómo invertir cada mes: la asignación que definas para un mes se mantiene fija — incluyendo
        cualquier vencimiento que vaya llegando mes a mes — hasta que agregues un cambio de estrategia en un mes
        posterior.
      </p>

      {locked && (
        <p className="mb-4 flex items-center gap-2 rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-cyan-light)] px-3 py-2 text-xs text-[var(--color-brand-text-secondary)]">
          <LockIcon className="h-4 w-4 shrink-0" /> Día bloqueado — el evaluador habilitó un día posterior, ya no puedes cambiar este portafolio.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {showCapitalSocial && (
          <div className="rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] p-3">
            <p className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">Capital Social — asignación inicial</p>
            <p className="mb-2 text-xs text-[var(--color-brand-text-secondary)]">
              Decisión aparte de tu calendario de abajo: cómo se invierte tu Capital Social desde el mes 0 del 2027. Una vez invertido, sigue el mismo
              calendario que la prima; lo único propio es su punto de partida.
            </p>
            <AllocationStepGrid rows={capitalSocialRows} onChange={(id, w) => setCapitalSocialRows((prev) => ({ ...prev, [id]: w }))} disabled={locked} />
          </div>
        )}

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
                      disabled={locked}
                      className="w-20 rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm disabled:opacity-50"
                    />
                  </label>
                )}
                {!isFirst && !locked && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => removeCheckpoint(originalIndex)}>
                    Quitar
                  </Button>
                )}
              </div>
              <AllocationStepGrid rows={checkpoint.rows} onChange={(id, w) => updateCheckpointWeight(originalIndex, id, w)} disabled={locked} />
            </div>
          );
        })}

        {hasDuplicateMonths && (
          <p className="text-xs text-[var(--color-brand-red)]">Dos cambios de estrategia no pueden caer en el mismo mes.</p>
        )}

        {checkpoints.length < MAX_SCHEDULE_ENTRIES && !locked && (
          <Button type="button" variant="secondary" onClick={addCheckpoint} className="w-fit">
            Agregar cambio de estrategia
          </Button>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--color-foreground)]">Vista previa de tu calendario</p>
          <PortfolioScheduleView schedule={schedule} />
        </div>

        <input type="hidden" name="decisionSchedule" value={JSON.stringify({ capitalSocialAllocation, schedule })} />
        <Button type="submit" variant="primary" loading={pending} loadingText="Guardando…" disabled={!canSubmit} className="w-fit">
          Guardar portafolio
        </Button>
      </div>

      {state.error && <p className="mt-3 text-sm text-[var(--color-brand-red)]">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm text-[var(--color-brand-green)]">Portafolio guardado.</p>}
    </form>
  );
}
