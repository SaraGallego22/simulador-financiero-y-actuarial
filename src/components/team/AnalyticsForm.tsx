"use client";

import { useActionState, useState } from "react";
import { submitAnalyticsAction, type SubmitAnalyticsState } from "@/lib/teamActions";
import { SECTOR_DIMENSIONS } from "@/domain/grading/sectors";
import { Button } from "@/components/ui/button";

interface SlotValue {
  dimA: string;
  valA: string;
  dimB: string;
  valB: string;
  multiplier: string;
}
const EMPTY_SLOT: SlotValue = { dimA: "", valA: "", dimB: "", valB: "", multiplier: "" };
const LISTS = [
  { key: "crecer", label: "Top 3 sectores para crecer" },
  { key: "disminuir", label: "Top 3 sectores para disminuir" },
] as const;
const RANKS = [1, 2, 3] as const;

function levelsFor(dim: string): readonly string[] {
  return SECTOR_DIMENSIONS.find((d) => d.dim === dim)?.levels ?? [];
}

function SectorSlotFields({
  list,
  rank,
  value,
  onChange,
}: {
  list: string;
  rank: number;
  value: SlotValue;
  onChange: (v: SlotValue) => void;
}) {
  const prefix = `${list}-${rank}`;
  const selectClass = "rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm disabled:opacity-50";
  return (
    <div className="flex items-center gap-2 rounded border border-[var(--color-brand-gray-light)] p-2">
      <span className="w-5 shrink-0 font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue-accent)]">{rank}º</span>
      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
        <select
          name={`${prefix}-dimA`}
          value={value.dimA}
          onChange={(e) => onChange({ ...value, dimA: e.target.value, valA: "" })}
          className={selectClass}
        >
          <option value="">Dimensión A</option>
          {SECTOR_DIMENSIONS.map((d) => (
            <option key={d.dim} value={d.dim} disabled={d.dim === value.dimB}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          name={`${prefix}-valA`}
          value={value.valA}
          onChange={(e) => onChange({ ...value, valA: e.target.value })}
          disabled={!value.dimA}
          className={selectClass}
        >
          <option value="">Valor</option>
          {levelsFor(value.dimA).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <select
          name={`${prefix}-dimB`}
          value={value.dimB}
          onChange={(e) => onChange({ ...value, dimB: e.target.value, valB: "" })}
          className={selectClass}
        >
          <option value="">Dimensión B</option>
          {SECTOR_DIMENSIONS.map((d) => (
            <option key={d.dim} value={d.dim} disabled={d.dim === value.dimA}>
              {d.label}
            </option>
          ))}
        </select>
        <select
          name={`${prefix}-valB`}
          value={value.valB}
          onChange={(e) => onChange({ ...value, valB: e.target.value })}
          disabled={!value.dimB}
          className={selectClass}
        >
          <option value="">Valor</option>
          {levelsFor(value.dimB).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <label className="flex shrink-0 flex-col gap-1 text-xs text-[var(--color-brand-text-secondary)]">
        Multiplicador estimado
        <input
          type="number"
          min="0"
          step="0.01"
          name={`${prefix}-multiplier`}
          value={value.multiplier}
          onChange={(e) => onChange({ ...value, multiplier: e.target.value })}
          placeholder="ej. 1.35"
          className="w-24 rounded border border-[var(--color-brand-gray-light)] px-2 py-1 text-sm"
        />
      </label>
    </div>
  );
}

export function AnalyticsForm({ day, initialPicks }: { day: number; initialPicks: Record<string, SlotValue> }) {
  const [state, formAction, pending] = useActionState<SubmitAnalyticsState, FormData>(submitAnalyticsAction.bind(null, day), {});
  const [values, setValues] = useState<Record<string, SlotValue>>(() => {
    const v: Record<string, SlotValue> = {};
    for (const { key: list } of LISTS) for (const rank of RANKS) v[`${list}-${rank}`] = initialPicks[`${list}-${rank}`] ?? { ...EMPTY_SLOT };
    return v;
  });

  return (
    <form action={formAction} className="rounded-lg border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] p-5">
      <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        Recomendación sectorial — Día {day}
      </h3>
      <p className="mb-4 text-sm text-[var(--color-brand-text-secondary)]">
        Nombra hasta 3 <strong>sectores</strong> — cada uno cruzando dos variables (ej. Zona: urbana × Uso: comercial) — que priorizarías para{" "}
        <strong>crecer</strong>, en orden de prioridad, y hasta 3 para <strong>disminuir</strong>. Todo lo que no nombres queda implícitamente en
        &ldquo;mantener&rdquo;. Para cada sector que nombres, estima también su <strong>multiplicador</strong> (pérdida agregada del sector ÷ pérdida
        agregada de todo el mercado — 1.0 es el promedio) — nombrar el sector correcto sin estimar su multiplicador solo te da la mitad del puntaje de
        esa posición. Se califica contra el ranking real de sectores del mercado completo, que no ves directamente — tu propia cartera y el CSV público
        del universo son tu única evidencia.
      </p>
      <div className="flex flex-col gap-5">
        {LISTS.map(({ key: list, label }) => (
          <div key={list}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">{label}</p>
            <div className="flex flex-col gap-2">
              {RANKS.map((rank) => (
                <SectorSlotFields
                  key={rank}
                  list={list}
                  rank={rank}
                  value={values[`${list}-${rank}`]}
                  onChange={(v) => setValues((prev) => ({ ...prev, [`${list}-${rank}`]: v }))}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {state.error && <p className="mt-3 text-sm text-[var(--color-brand-red)]">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm text-[var(--color-brand-green)]">Recomendación guardada.</p>}
      <Button type="submit" disabled={pending} className="mt-4">
        {pending ? "Guardando…" : "Guardar recomendación"}
      </Button>
    </form>
  );
}
