"use client";

import { useActionState, useState } from "react";
import { submitPortfolioAction, type SubmitPortfolioState } from "@/lib/teamActions";
import { INSTRUMENTS, INSTRUMENT_BY_ID, isBondLike, trancheDurationM } from "@/domain/finance/instruments";
import type { PortfolioDecisionV3, Tranche, MaturityDecision } from "@/domain/finance/instruments";
import { BUILD_MONTHS, HORIZON } from "@/domain/reserving/constants";
import { PortfolioTreeView } from "@/components/AlmLadderTable";
import { Button } from "@/components/ui/button";

const TOTAL_MONTHS = BUILD_MONTHS + HORIZON;

type GridRow = { weight: number; durationM?: number };
type GridRows = Record<string, GridRow>;

/** Indices into the tree: [] at the top level, or nested into a "reallocate" node's own tranches array — e.g. [1, 0] means decision.tranches[1].onMaturity.tranches[0]. */
type Path = number[];

interface PendingDecision {
  path: Path;
  instrumentId: string;
  weight: number;
  durationM?: number;
  maturityMonth: number;
}

type WizardPhase = "base" | "decision" | "review";

function emptyGridRows(): GridRows {
  const rows: GridRows = {};
  for (const ins of INSTRUMENTS) rows[ins.id] = { weight: 0 };
  return rows;
}

function rowsToTranches(rows: GridRows): Tranche[] {
  const tranches: Tranche[] = [];
  for (const ins of INSTRUMENTS) {
    const row = rows[ins.id];
    if (!row || row.weight <= 0) continue;
    const t: Tranche = { instrumentId: ins.id, weight: row.weight, onMaturity: { action: "cash" } };
    if (!isBondLike(ins)) t.durationM = Math.max(1, row.durationM || 1);
    tranches.push(t);
  }
  return tranches;
}

/** Immutable update: returns a new tranches array with the tranche at `path` given a new onMaturity — never mutates the input. */
function setOnMaturityAtPath(tranches: Tranche[], path: Path, action: MaturityDecision): Tranche[] {
  const [index, ...rest] = path;
  return tranches.map((t, i) => {
    if (i !== index) return t;
    if (rest.length === 0) return { ...t, onMaturity: action };
    if (t.onMaturity.action !== "reallocate") return t;
    return { ...t, onMaturity: { action: "reallocate", tranches: setOnMaturityAtPath(t.onMaturity.tranches, rest, action) } };
  });
}

function AllocationStepGrid({ rows, onChange }: { rows: GridRows; onChange: (id: string, patch: Partial<GridRow>) => void }) {
  const total = Object.values(rows).reduce((a, r) => a + (r?.weight || 0), 0);
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {INSTRUMENTS.map((ins) => (
          <div key={ins.id} className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
              {ins.id}
              <input
                type="number"
                min="0"
                step="1"
                value={rows[ins.id]?.weight || ""}
                onChange={(e) => onChange(ins.id, { weight: Number(e.target.value) })}
                className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
              />
            </label>
            {!isBondLike(ins) && (rows[ins.id]?.weight ?? 0) > 0 && (
              <label className="flex flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
                Vencimiento personalizado (meses)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={rows[ins.id]?.durationM || ""}
                  onChange={(e) => onChange(ins.id, { durationM: Number(e.target.value) })}
                  className="rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
                />
              </label>
            )}
          </div>
        ))}
      </div>
      <p className={`mt-1 text-xs ${Math.round(total) === 100 ? "text-[var(--color-brand-green)]" : "text-[var(--color-brand-text-secondary)]"}`}>
        Total: {total.toFixed(0)}% {Math.round(total) !== 100 && "(se normaliza automáticamente a 100%)"}
      </p>
    </div>
  );
}

export function PortfolioForm({ day, initialDecision }: { day: number; initialDecision: PortfolioDecisionV3 | null }) {
  const [state, formAction, pending] = useActionState<SubmitPortfolioState, FormData>(submitPortfolioAction.bind(null, day), {});

  const [tree, setTree] = useState<PortfolioDecisionV3 | null>(initialDecision);
  const [phase, setPhase] = useState<WizardPhase>(initialDecision ? "review" : "base");
  const [queue, setQueue] = useState<PendingDecision[]>([]);
  const [baseRows, setBaseRows] = useState<GridRows>(emptyGridRows);
  const [reallocateRows, setReallocateRows] = useState<GridRows>(emptyGridRows);
  const [showReallocateGrid, setShowReallocateGrid] = useState(false);

  function startWizard() {
    const tranches = rowsToTranches(baseRows);
    if (tranches.length === 0) return;
    setTree({ tranches });
    const initial: PendingDecision[] = tranches
      .map((t, i) => ({ path: [i], instrumentId: t.instrumentId, weight: t.weight, durationM: t.durationM, maturityMonth: trancheDurationM(t) }))
      .filter((p) => p.maturityMonth < TOTAL_MONTHS);
    setQueue(initial);
    setPhase(initial.length > 0 ? "decision" : "review");
  }

  function answerCurrent(action: MaturityDecision, spawnedChildren: Tranche[] = []) {
    const [current, ...rest] = queue;
    setTree((prev) => (prev ? { tranches: setOnMaturityAtPath(prev.tranches, current.path, action) } : prev));
    const spawned: PendingDecision[] = spawnedChildren
      .map((child, i) => ({
        path: [...current.path, i],
        instrumentId: child.instrumentId,
        weight: child.weight,
        durationM: child.durationM,
        maturityMonth: current.maturityMonth + trancheDurationM(child),
      }))
      .filter((p) => p.maturityMonth < TOTAL_MONTHS);
    const next = [...rest, ...spawned];
    setQueue(next);
    setShowReallocateGrid(false);
    setReallocateRows(emptyGridRows());
    if (next.length === 0) setPhase("review");
  }

  function confirmReallocate() {
    const children = rowsToTranches(reallocateRows);
    if (children.length === 0) return;
    answerCurrent({ action: "reallocate", tranches: children }, children);
  }

  function restart() {
    setTree(null);
    setBaseRows(emptyGridRows());
    setQueue([]);
    setPhase("base");
  }

  const current = queue[0];

  return (
    <form
      action={formAction}
      className="rounded-lg border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-blue-accent)] bg-[var(--color-brand-surface)] p-5"
    >
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Portafolio de inversión — Día {day}
      </h3>
      <p className="mb-4 text-sm text-[var(--color-brand-text-secondary)]">
        Arma tu portafolio y decide, para cada instrumento, qué pasa cuando venza — mantenerlo en caja, repetirlo
        indefinidamente, o reasignarlo entre nuevos instrumentos (que a su vez tendrán su propia decisión). LIQ y
        acciones también necesitan un vencimiento personalizado: por cuántos meses los dejas ahí antes de decidir de
        nuevo. La nota de rendimiento está ajustada por riesgo: un instrumento con mayor volatilidad exige un
        rendimiento más alto para que valga la pena — perseguir el rendimiento nominal más alto (acciones) sin
        cuidar la volatilidad puede darte una nota peor que un portafolio más balanceado. La volatilidad de cada
        instrumento no se muestra aquí directamente — puedes deducirla de la diagonal de la matriz de covarianza
        (pestaña de instrumentos, arriba). Si te falta caja en algún
        mes, el sistema cubre la diferencia vendiendo LIQ primero (gratis, es su función) y, si no alcanza, vendiendo
        el resto de tu portafolio empezando por lo menos volátil — pero verte obligado a vender es un castigo aparte
        en la nota, y vender acciones bajo presión pesa mucho más que vender un CDT o un TES.
      </p>

      {phase === "base" && (
        <div className="flex flex-col gap-4">
          <AllocationStepGrid rows={baseRows} onChange={(id, patch) => setBaseRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }))} />
          <Button type="button" variant="primary" onClick={startWizard} className="w-fit">
            Siguiente
          </Button>
        </div>
      )}

      {phase === "decision" && current && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--color-foreground)]">
            Invertiste <strong>{current.weight.toFixed(1)}%</strong> en{" "}
            <strong>{INSTRUMENT_BY_ID[current.instrumentId]?.nombre}</strong>
            {current.durationM ? ` por ${current.durationM} meses` : ""} — vence en el mes {current.maturityMonth}. ¿Qué
            haces?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => answerCurrent({ action: "cash" })}>
              Mantener en caja
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => answerCurrent({ action: "repeat" })}>
              Repetir siempre
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowReallocateGrid(true)}>
              Reasignar
            </Button>
          </div>
          {showReallocateGrid && (
            <div className="rounded border border-[var(--color-brand-gray-light)] p-3">
              <AllocationStepGrid
                rows={reallocateRows}
                onChange={(id, patch) => setReallocateRows((r) => ({ ...r, [id]: { ...r[id], ...patch } }))}
              />
              <Button type="button" variant="primary" size="sm" onClick={confirmReallocate} className="mt-2">
                Confirmar reasignación
              </Button>
            </div>
          )}
          <p className="text-xs text-[var(--color-brand-text-secondary)]">{queue.length} decisión(es) pendiente(s).</p>
        </div>
      )}

      {phase === "review" && tree && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-[var(--color-foreground)]">Árbol de decisión de tu portafolio</p>
          <PortfolioTreeView tranches={tree.tranches} />
          <input type="hidden" name="decisionTree" value={JSON.stringify(tree)} />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={pending} loadingText="Guardando…">
              Guardar portafolio
            </Button>
            <Button type="button" variant="secondary" onClick={restart}>
              Rehacer desde cero
            </Button>
          </div>
        </div>
      )}

      {state.error && <p className="mt-3 text-sm text-[var(--color-brand-red)]">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm text-[var(--color-brand-green)]">Portafolio guardado.</p>}
    </form>
  );
}
