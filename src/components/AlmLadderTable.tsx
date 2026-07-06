import { INSTRUMENTS } from "@/domain/finance/instruments";
import type { MaturityRules } from "@/domain/finance/instruments";
import type { FinancialScore, AlmSimRow } from "@/domain/finance/alm";

/**
 * Reconstructs a readable chain from a maturity-rules map, e.g.
 * "CDT90 → reinvertir en TES1 → TES1 → mantener en caja". Bounded to
 * INSTRUMENTS.length steps so a self-referential rule (a rolling ladder,
 * e.g. "CDT90 matures -> reinvest in CDT90") prints "(ciclo)" instead of
 * looping — that's a legitimate rule, not an error, just not worth walking
 * forever in a display string.
 */
export function describeMaturityChain(sourceId: string, rules: MaturityRules): string {
  const path = [sourceId];
  let current = sourceId;
  for (let i = 0; i < INSTRUMENTS.length; i++) {
    const rule = rules[current];
    if (!rule) return `${path.join(" → ")} → política general`;
    if (rule.action === "cash") return `${path.join(" → ")} → mantener en caja`;
    if (path.includes(rule.instrumentId)) return `${path.join(" → ")} → reinvertir en ${rule.instrumentId} (ciclo)`;
    path.push(rule.instrumentId);
    current = rule.instrumentId;
  }
  return path.join(" → ");
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
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Rendimiento (45%)</p>
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
        <p className="text-xs text-[var(--color-brand-text-secondary)]">Rendimiento efectivo simulado</p>
        <p className="text-sm font-semibold">{(score.effYield * 100).toFixed(2)}%</p>
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
        Caja mes a mes — Caja Inicial, Prima Cobrada, Pago Siniestros, Gastos, Inversión Neta, Caja Final
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
