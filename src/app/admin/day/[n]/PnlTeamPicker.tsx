"use client";

import { useState } from "react";

export interface PnlTeamOption {
  id: string;
  name: string;
  color: string;
  pnl: {
    primaEmitida: number;
    rpndConstituida: number;
    rpndLiberada: number;
    primaDevengada: number;
    costo: number;
    gadq: number;
    gcom: number;
    rt: number;
  } | null;
}

const fmtM = (v: number) => `$${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} M`;

/**
 * Día 1's "P&G hasta RT" team picker — plain client-side `useState`, not a
 * `?team=` query param + TeamSelect/router.push like the "subj" tab uses.
 * This page is a Server Component that reruns its entire Promise.all (every
 * table, every finBench/consolidado computation) on any navigation,
 * including a searchParams-only one — switching teams via router.push felt
 * like a full page reload because it effectively was one. Every team's PnL
 * is a handful of numbers, cheap enough to ship all of them down at once and
 * switch between them with zero network round-trip.
 */
export function PnlTeamPicker({ teams }: { teams: PnlTeamOption[] }) {
  const [selectedId, setSelectedId] = useState(teams[0]?.id ?? "");
  const selected = teams.find((t) => t.id === selectedId) ?? teams[0];

  if (!selected) return null;

  const p1 = selected.pnl;
  const rows = p1
    ? [
        { label: "Prima emitida", value: p1.primaEmitida },
        { label: "RPND constituida", value: -p1.rpndConstituida },
        { label: "RPND liberada", value: p1.rpndLiberada },
        { label: "Prima devengada", value: p1.primaDevengada, isTotal: true },
        { label: "Costo siniestros", value: -p1.costo },
        { label: "Gastos de adquisición", value: -p1.gadq },
        { label: "Gastos de comisión", value: -p1.gcom },
        { label: "RT (Resultado Técnico)", value: p1.rt, isTotal: true },
      ]
    : [];

  return (
    <div className="max-w-md rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          P&amp;G hasta RT
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
      {!p1 ? (
        <p className="text-sm text-[var(--color-brand-text-secondary)]">Sin resultados de simulación todavía para este equipo.</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.label}
                className={`border-t border-[var(--color-brand-gray-light)] ${r.isTotal ? "font-semibold text-[var(--color-brand-blue-accent)]" : ""}`}
              >
                <td className="py-1.5 pr-4">{r.label}</td>
                <td className="py-1.5 text-right tabular-nums">{fmtM(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
