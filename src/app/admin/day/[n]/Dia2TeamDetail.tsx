"use client";

import { useState } from "react";
import { INSTRUMENTS, INSTRUMENT_BY_ID } from "@/domain/finance/instruments";
import type { Allocation } from "@/domain/finance/instruments";
import { portfolioExpectedReturn, portfolioVariance } from "@/domain/finance/markowitz";

export interface Dia2TeamOption {
  id: string;
  name: string;
  color: string;
  pnl: {
    primaEmitida: number;
    rpndConstituida: number;
    rpndLiberada: number;
    primaDevengada: number;
    costo: number;
    ajusteSiniestralidad: number;
    gadq: number;
    gcom: number;
    rt: number;
  } | null;
  /** The team's month-0 schedule allocation (its starting investment decision) — see PortfolioDecisionV4's doc comment. */
  weights: Allocation | null;
}

const fmtM = (v: number) => `$${Math.round(v / 1e6).toLocaleString("es-CO")} M`;
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

function normalizedWeights(weights: Allocation): Allocation {
  const total = INSTRUMENTS.reduce((s, ins) => s + (weights[ins.id] ?? 0), 0);
  const out: Allocation = {};
  for (const ins of INSTRUMENTS) out[ins.id] = total > 0 ? (weights[ins.id] ?? 0) / total : 0;
  return out;
}

function heaviestInstrument(weights: Allocation): { id: string; weight: number } | null {
  let best: { id: string; weight: number } | null = null;
  for (const ins of INSTRUMENTS) {
    const w = weights[ins.id] ?? 0;
    if (!best || w > best.weight) best = { id: ins.id, weight: w };
  }
  return best && best.weight > 0 ? best : null;
}

/**
 * Día 2's per-team detail card: P&G Año 2 (2028) hasta RT, and a compact
 * summary of the team's starting investment allocation (retorno esperado,
 * varianza, instrumento más pesado) side by side. Same plain client-side
 * useState + ship-everything-down-at-once pattern as Día 1's Dia1TeamDetail
 * (see its doc comment for why: this is a Server Component page that
 * reruns its whole Promise.all on any searchParams-only navigation, so a
 * `?team=` query param would feel like a full reload).
 */
export function Dia2TeamDetail({ teams }: { teams: Dia2TeamOption[] }) {
  const [selectedId, setSelectedId] = useState(teams[0]?.id ?? "");
  const selected = teams.find((t) => t.id === selectedId) ?? teams[0];

  if (!selected) return null;

  const p2 = selected.pnl;
  const pnlRows = p2
    ? [
        { label: "Prima emitida", value: p2.primaEmitida },
        { label: "RPND constituida", value: -p2.rpndConstituida },
        { label: "RPND liberada", value: p2.rpndLiberada },
        { label: "Prima devengada", value: p2.primaDevengada, isTotal: true },
        { label: "Costo siniestros", value: -p2.costo },
        // ajusteSiniestralidad is itself negative (a release) — its
        // CONTRIBUTION to the running total is −ajuste, positive, since the
        // P&G formula subtracts it (RT = ... − ajusteSiniestralidad).
        { label: "Ajuste de siniestralidad (A1)", value: -p2.ajusteSiniestralidad },
        { label: "Gastos de adquisición", value: -p2.gadq },
        { label: "Gastos de comisión", value: -p2.gcom },
        { label: "RT (Resultado Técnico)", value: p2.rt, isTotal: true },
      ]
    : [];

  const weights = selected.weights ? normalizedWeights(selected.weights) : null;
  const heaviest = weights ? heaviestInstrument(weights) : null;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          P&amp;G 2028 y portafolio por equipo
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

      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex-1">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">P&amp;G hasta RT — 2028</p>
          {!p2 ? (
            <p className="text-sm text-[var(--color-brand-text-secondary)]">Sin resultados de simulación todavía para este equipo.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {pnlRows.map((r) => (
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

        <div className="flex-1 sm:border-l sm:border-[var(--color-brand-gray-light)] sm:pl-12">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">Portafolio (asignación inicial)</p>
          {!weights ? (
            <p className="text-sm text-[var(--color-brand-text-secondary)]">Sin portafolio cargado todavía para este equipo.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-t border-[var(--color-brand-gray-light)]">
                  <td className="py-1.5 pr-4">Retorno esperado</td>
                  <td className="py-1.5 text-right tabular-nums font-semibold text-[var(--color-brand-blue-accent)]">
                    {fmtPct(portfolioExpectedReturn(weights))}
                  </td>
                </tr>
                <tr className="border-t border-[var(--color-brand-gray-light)]">
                  <td className="py-1.5 pr-4">Varianza</td>
                  <td className="py-1.5 text-right tabular-nums">{portfolioVariance(weights).toFixed(6)}</td>
                </tr>
                <tr className="border-t border-[var(--color-brand-gray-light)]">
                  <td className="py-1.5 pr-4">Volatilidad</td>
                  <td className="py-1.5 text-right tabular-nums">{fmtPct(Math.sqrt(portfolioVariance(weights)))}</td>
                </tr>
                <tr className="border-t border-[var(--color-brand-gray-light)]">
                  <td className="py-1.5 pr-4">Instrumento más pesado</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {heaviest ? `${INSTRUMENT_BY_ID[heaviest.id]?.nombre ?? heaviest.id} (${fmtPct(heaviest.weight)})` : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
