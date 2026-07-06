import { INSTRUMENT_BY_ID, MAX_TRANCHE_DEPTH, trancheDurationM } from "@/domain/finance/instruments";
import type { Tranche, MaturityDecision } from "@/domain/finance/instruments";
import type { FinancialScore, AlmSimRow } from "@/domain/finance/alm";

function maturityLabel(action: MaturityDecision): string {
  if (action.action === "cash") return "mantener en caja";
  if (action.action === "repeat") return "repetir indefinidamente";
  return "reasignar a:";
}

/**
 * Recursively renders a decision tree (Tranche[]) as an indented list —
 * instrument + weight + maturity/duration + what happens at maturity,
 * recursing into a "reallocate" node's children. Bounded by
 * MAX_TRANCHE_DEPTH (a legitimate tree from the wizard never nests this
 * deep — the horizon-based pruning caps realistic depth around 5-6 — this
 * is just a display-side safety net, matching the same cap the server-side
 * validator uses).
 */
export function PortfolioTreeView({ tranches, depth = 0 }: { tranches: Tranche[]; depth?: number }) {
  if (depth > MAX_TRANCHE_DEPTH) return <li className="text-xs text-[var(--color-brand-text-secondary)]">…</li>;
  return (
    <ul className={depth === 0 ? "flex flex-col gap-1" : "ml-4 flex flex-col gap-1 border-l border-[var(--color-brand-gray-light)] pl-3"}>
      {tranches.map((t, i) => {
        const ins = INSTRUMENT_BY_ID[t.instrumentId];
        const dur = trancheDurationM(t);
        return (
          <li key={i} className="text-xs text-[var(--color-brand-text-secondary)]">
            <span className="font-semibold text-[var(--color-foreground)]">
              {ins?.nombre ?? t.instrumentId} ({t.weight.toFixed(1)}%, vence a los {dur} {dur === 1 ? "mes" : "meses"})
            </span>{" "}
            → {maturityLabel(t.onMaturity)}
            {t.onMaturity.action === "reallocate" && <PortfolioTreeView tranches={t.onMaturity.tranches} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}

export function AlmScoreTiles({ score }: { score: FinancialScore }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div>
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Cumplimiento de caja mínima (45%)</p>
        <p className="font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-blue-accent)]">
          {score.cumplimientoCaja.toFixed(1)}
        </p>
      </div>
      <div>
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Rendimiento ajustado por riesgo (45%)</p>
        <p className="font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-blue-accent)]">
          {score.rendimiento.toFixed(1)}
        </p>
      </div>
      <div>
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Liquidez (10%)</p>
        <p className="font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-blue-accent)]">
          {score.liquidez.toFixed(1)}
        </p>
      </div>
      <div>
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Reserva</p>
        <p className="text-sm font-semibold">${Math.round(score.reserva).toLocaleString("es-CO")}</p>
      </div>
      <div>
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Volatilidad promedio del portafolio</p>
        <p className="text-sm font-semibold">{(score.avgVol * 100).toFixed(2)}%</p>
      </div>
      <div>
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Rendimiento efectivo − penalización por riesgo</p>
        <p className="text-sm font-semibold">
          {(score.effYield * 100).toFixed(2)}% → {(score.riskAdjustedYield * 100).toFixed(2)}%
        </p>
      </div>
      <div>
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Brecha máxima (peor mes)</p>
        <p className="text-sm font-semibold">
          ${Math.round(score.peakBrechaCaja).toLocaleString("es-CO")} ({(score.peakBrechaCajaRatio * 100).toFixed(1)}% de la caja mínima típica)
        </p>
      </div>
      <div>
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Brecha promedio (todo el horizonte)</p>
        <p className="text-sm font-semibold">{(score.avgBrechaCajaRatio * 100).toFixed(1)}% de la caja mínima acumulada</p>
      </div>
      <div>
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Rendimiento portafolio (nominal, ponderado)</p>
        <p className="text-sm font-semibold">{(score.portYield * 100).toFixed(2)}%</p>
      </div>
      <div>
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Cobertura liquidez (6 meses)</p>
        <p className="text-sm font-semibold">
          ${Math.round(score.liq6).toLocaleString("es-CO")} / ${Math.round(score.liab6).toLocaleString("es-CO")} ({(score.cobertura * 100).toFixed(0)}%)
        </p>
      </div>
      <div>
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Ingreso total simulado</p>
        <p className="text-sm font-semibold">${Math.round(score.totIncome).toLocaleString("es-CO")}</p>
      </div>
    </div>
  );
}

export function AlmLadderTable({ rows }: { rows: AlmSimRow[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">
        Caja mes a mes — Caja Inicial, Prima Cobrada, Pago Siniestros, Gastos, Vencimientos en caja, Inversión Neta, Caja Final
      </p>
      <div className="max-h-64 overflow-y-auto overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--color-brand-surface)]">
            <tr className="text-left uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
              <th className="px-2 py-1">Mes</th>
              <th className="px-2 py-1">Caja Inicial</th>
              <th className="px-2 py-1">Prima Cobrada</th>
              <th className="px-2 py-1">Pago Siniestros</th>
              <th className="px-2 py-1">Gastos</th>
              <th className="px-2 py-1">Vencimientos en caja</th>
              <th className="px-2 py-1">Inversión Neta</th>
              <th className="px-2 py-1">Caja Final</th>
              <th className="px-2 py-1">Brecha</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-t border-[var(--color-brand-gray-light)] ${r.brechaCaja > 0 ? "bg-[var(--color-brand-red)]/10" : ""}`}>
                <td className="px-2 py-1">{r.mes}</td>
                <td className="px-2 py-1">${Math.round(r.cajaInicial).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">${Math.round(r.primaCobrada).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">${Math.round(r.pagoSiniestros).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">${Math.round(r.gastos).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">{r.vencimientosCaja > 0 ? `$${Math.round(r.vencimientosCaja).toLocaleString("es-CO")}` : "—"}</td>
                <td className="px-2 py-1">${Math.round(r.inversionNeta).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">${Math.round(r.cajaFinal).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">{r.brechaCaja > 0 ? `$${Math.round(r.brechaCaja).toLocaleString("es-CO")}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Portfolio *value* evolution, separate from the cash-flow statement above:
 * how much was actually invested (Saldo Inicial), how much it grew this
 * month purely from yield (Rendimiento), and where that leaves it (Saldo
 * Final) — Saldo Final also reflects that month's Inversión Neta and any
 * "mantener en caja" withdrawal (both already visible in the cash table
 * above, sharing the same Mes column) but doesn't repeat those figures here
 * to keep the two tables focused on different questions: "is there enough
 * cash" vs. "how much is the portfolio worth."
 */
export function AlmPortfolioTable({ rows }: { rows: AlmSimRow[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <p className="mb-1 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">
        Valor del portafolio mes a mes — Saldo Inicial, Rendimiento devengado, Saldo Final
      </p>
      <div className="max-h-64 overflow-y-auto overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--color-brand-surface)]">
            <tr className="text-left uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
              <th className="px-2 py-1">Mes</th>
              <th className="px-2 py-1">Saldo Inicial</th>
              <th className="px-2 py-1">Rendimiento</th>
              <th className="px-2 py-1">Saldo Final</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-[var(--color-brand-gray-light)]">
                <td className="px-2 py-1">{r.mes}</td>
                <td className="px-2 py-1">${Math.round(r.saldoInicialPortafolio).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">${Math.round(r.rendimientoPortafolio).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">${Math.round(r.saldoFinalPortafolio).toLocaleString("es-CO")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
