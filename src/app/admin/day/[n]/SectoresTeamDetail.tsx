"use client";

import { useState } from "react";

interface PickRow {
  /** Sector nombrado por el equipo, ya formateado (`sectorLabel`). `null` si no llenó esa posición. */
  label: string | null;
  /** Posición del sector en el ranking real (1-based); `null` si el sector no aparece en él. */
  truePosition: number | null;
  trueMultiplier: number | null;
  estimatedMultiplier: number | null;
}

export interface SectoresTeamOption {
  id: string;
  name: string;
  color: string;
  score: number | null;
  crecer: PickRow[];
  disminuir: PickRow[];
}

const LIST_LABELS = { crecer: "Crecer", disminuir: "Disminuir" } as const;

function PickTable({ rows }: { rows: PickRow[] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-[var(--color-brand-gray-light)]">
            <td className={`py-1 pr-2 ${r.label ? "" : "text-[var(--color-brand-text-secondary)]"}`}>{i + 1}º</td>
            <td className="py-1">
              {r.label == null ? (
                <span className="text-[var(--color-brand-text-secondary)]">—</span>
              ) : (
                <>
                  {r.label}
                  <span className="ml-1 text-[var(--color-brand-text-secondary)]">
                    —{" "}
                    {r.truePosition == null
                      ? "no está en el ranking real"
                      : `real: #${r.truePosition} (${r.trueMultiplier!.toFixed(2)}×)`}
                    {" · estimado: "}
                    {r.estimatedMultiplier != null ? `${r.estimatedMultiplier.toFixed(2)}×` : "sin estimar"}
                  </span>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Día 4's "Recomendación sectorial por equipo" as a single-team dropdown,
 * same pattern as ReportesTeamDetail/Dia1TeamDetail (see the latter's doc
 * comment for why everything is precomputed server-side and shipped down at
 * once).
 */
export function SectoresTeamDetail({ day, teams }: { day: number; teams: SectoresTeamOption[] }) {
  const [selectedId, setSelectedId] = useState(teams[0]?.id ?? "");
  const selected = teams.find((t) => t.id === selectedId) ?? teams[0];
  if (!selected) return null;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          Recomendación sectorial por equipo — Día {day}
        </h3>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
          Equipo
          <select
            value={selected.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="min-w-56 rounded border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] px-3 py-2 text-sm font-semibold text-[var(--color-foreground)]"
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id} style={{ color: t.color }}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mb-2 text-sm font-semibold text-[var(--color-brand-blue-accent)]">
        {selected.score != null ? `Nota: ${selected.score.toFixed(0)}` : "Sin recomendación aún"}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(["crecer", "disminuir"] as const).map((listKey) => (
          <div key={listKey}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">{LIST_LABELS[listKey]}</p>
            <PickTable rows={selected[listKey]} />
          </div>
        ))}
      </div>
    </div>
  );
}
