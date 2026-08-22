"use client";

import { useState } from "react";
import { INSTRUMENTS } from "@/domain/finance/instruments";
import type { Allocation } from "@/domain/finance/instruments";
import { portfolioExpectedReturn, portfolioVariance } from "@/domain/finance/markowitz";

export interface Dia1TeamOption {
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
  weights: Allocation | null;
}

const fmtM = (v: number) => `$${Math.round(v / 1e6).toLocaleString("es-CO")} M`;
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

/** Normalized so weights that don't sum to exactly 100 aren't shown misleadingly — same rule scoreMinVariance() itself applies before grading. */
function normalizedWeights(weights: Allocation): Allocation {
  const total = INSTRUMENTS.reduce((s, ins) => s + (weights[ins.id] ?? 0), 0);
  const out: Allocation = {};
  for (const ins of INSTRUMENTS) out[ins.id] = total > 0 ? (weights[ins.id] ?? 0) / total : 0;
  return out;
}

/**
 * Día 1's per-team detail card: P&G hasta RT and the mínima varianza
 * portfolio (vs. the reference/optimal one), side by side for whichever
 * team is selected. Plain client-side `useState`, not a `?team=` query
 * param + TeamSelect/router.push like the "subj" tab uses — this page is a
 * Server Component that reruns its entire Promise.all (every table, every
 * finBench/consolidado computation) on any navigation, including a
 * searchParams-only one, so switching teams that way felt like (and was) a
 * full page reload. Every team's PnL + weights is a handful of numbers,
 * cheap enough to ship all of them down at once.
 */
export function Dia1TeamDetail({
  teams,
  referenceWeights,
}: {
  teams: Dia1TeamOption[];
  referenceWeights: Allocation;
}) {
  const [selectedId, setSelectedId] = useState(teams[0]?.id ?? "");
  const selected = teams.find((t) => t.id === selectedId) ?? teams[0];

  if (!selected) return null;

  const p1 = selected.pnl;
  const pnlRows = p1
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

  const teamWeights = selected.weights ? normalizedWeights(selected.weights) : null;
  const referenceReturn = portfolioExpectedReturn(referenceWeights);
  const referenceVariance = portfolioVariance(referenceWeights);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
          P&amp;G y portafolio por equipo
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
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">P&amp;G hasta RT</p>
          {!p1 ? (
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
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">Portafolio de mínima varianza</p>
          {!teamWeights ? (
            <p className="text-sm text-[var(--color-brand-text-secondary)]">Sin portafolio cargado todavía para este equipo.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                  <th className="py-1 pr-2">Instrumento</th>
                  <th className="py-1 pr-2 text-right">Equipo</th>
                  <th className="py-1 text-right">Referencia</th>
                </tr>
              </thead>
              <tbody>
                {INSTRUMENTS.map((ins) => (
                  <tr key={ins.id} className="border-t border-[var(--color-brand-gray-light)]">
                    <td className="py-1 pr-2">{ins.id}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{fmtPct(teamWeights[ins.id] ?? 0)}</td>
                    <td className="py-1 text-right tabular-nums text-[var(--color-brand-text-secondary)]">{fmtPct(referenceWeights[ins.id] ?? 0)}</td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--color-brand-gray-light)] font-semibold text-[var(--color-brand-blue-accent)]">
                  <td className="py-1 pr-2">Retorno logrado</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{fmtPct(portfolioExpectedReturn(selected.weights!))}</td>
                  <td className="py-1 text-right tabular-nums text-[var(--color-brand-text-secondary)]">{fmtPct(referenceReturn)}</td>
                </tr>
                <tr className="font-semibold text-[var(--color-brand-blue-accent)]">
                  <td className="py-1 pr-2">Volatilidad lograda</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{fmtPct(Math.sqrt(portfolioVariance(selected.weights!)))}</td>
                  <td className="py-1 text-right tabular-nums text-[var(--color-brand-text-secondary)]">{fmtPct(Math.sqrt(referenceVariance))}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
