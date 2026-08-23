import { INSTRUMENTS, RISK_FREE_RATE } from "@/domain/finance/instruments";
import type { MonthlyAllocationEntry } from "@/domain/finance/instruments";
import type { FinancialScore, AlmSimRow, AlmRealYearResult } from "@/domain/finance/alm";
import { CAPITAL_SOCIAL } from "@/domain/finance/constants";
import { SIMULATED_YEAR_LABEL } from "@/lib/days";

/**
 * Renders a Día 2 schedule (MonthlyAllocationEntry[]) as one row per
 * checkpoint — the month it takes effect, and how that month's (and every
 * following month's, until a later checkpoint overrides it) investable
 * surplus is split across the instrument menu. Weights are shown normalized
 * to their own checkpoint's total, not the raw submitted values — the same
 * normalization fundFromAllocation() applies when actually funding that
 * month, so a checkpoint that didn't sum to exactly 100 isn't shown
 * misleadingly. Used both by a team's own PortfolioForm and by the admin's
 * read-only accordion.
 */
export function PortfolioScheduleView({ schedule }: { schedule: MonthlyAllocationEntry[] }) {
  if (schedule.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-brand-gray-light)]">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
            <th className="px-2 py-1">Desde el mes</th>
            {INSTRUMENTS.map((ins) => (
              <th key={ins.id} className="px-2 py-1">
                {ins.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schedule.map((entry, i) => {
            const totalW = Object.values(entry.allocation).reduce((s, w) => s + Math.max(0, Number(w) || 0), 0);
            return (
              <tr key={i} className="border-t border-[var(--color-brand-gray-light)]">
                <td className="px-2 py-1 font-semibold text-[var(--color-foreground)]">{entry.month}</td>
                {INSTRUMENTS.map((ins) => {
                  const w = Math.max(0, Number(entry.allocation[ins.id]) || 0);
                  const normalized = totalW > 0 ? (w / totalW) * 100 : 0;
                  return (
                    <td key={ins.id} className="px-2 py-1">
                      {normalized > 0 ? `${normalized.toFixed(1)}%` : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScoreTile({ label, weight, value, formula }: { label: string; weight: string; value: number; formula: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--color-brand-gray-light)] p-2">
      <p className="text-xs text-[var(--color-brand-text-secondary)]">
        {label} <span className="font-semibold">({weight})</span>
      </p>
      <p
        className={`font-[family-name:var(--font-condensed)] text-xl font-bold ${value < 80 ? "text-[var(--color-brand-red)]" : "text-[var(--color-brand-blue-accent)]"}`}
      >
        {value.toFixed(1)}
      </p>
      <p className="text-[14px] italic text-[var(--color-brand-text-secondary)]">{formula}</p>
    </div>
  );
}

function InfoTile({ label, value, formula, danger }: { label: string; value: string; formula?: string; danger?: boolean }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-brand-text-secondary)]">{label}</p>
      <p className={`text-sm font-semibold ${danger ? "text-[var(--color-brand-red)]" : ""}`}>{value}</p>
      {formula && <p className="text-[14px] italic text-[var(--color-brand-text-secondary)]">{formula}</p>}
    </div>
  );
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}
function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

/**
 * Organized top-to-bottom by "what matters most": the final grade, then the
 * 4 weighted components that make it up, then the raw inputs each of those
 * 4 is actually computed from (with a one-line formula each, so nothing is
 * a mystery number), and finally pure diagnostics that don't feed the grade
 * at all — see scoreFinanciero()'s doc comment in alm.ts for the full
 * derivation of every figure here.
 */
export function AlmScoreTiles({ score }: { score: FinancialScore }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] p-3">
        <p className="text-xs uppercase text-[var(--color-brand-text-secondary)]">Nota final del ALM</p>
        <p className="font-[family-name:var(--font-condensed)] text-3xl font-bold text-[var(--color-brand-blue-accent)]">{score.nota.toFixed(1)}</p>
        <p className="text-xs italic text-[var(--color-brand-text-secondary)]">
          = 35% × Cumplimiento de Caja + 35% × Rendimiento ajustado + 20% × Venta forzada + 10% × Liquidez
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">Los 4 componentes de la nota</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ScoreTile
            label="Cumplimiento de Caja Mínima"
            weight="35%"
            value={score.cumplimientoCaja}
            formula="100 × (1 − 0.5×peor mes − 0.5×acumulado, como % del Capital Social — ver abajo)"
          />
          <ScoreTile
            label="Rendimiento ajustado por riesgo"
            weight="35%"
            value={score.rendimiento}
            formula="normalizado de un Sharpe ratio real, (rendimiento efectivo − tasa libre de riesgo) ÷ volatilidad de portafolio, con correlaciones — ver abajo"
          />
          <ScoreTile
            label="Venta forzada de portafolio"
            weight="20%"
            value={score.ventaForzada}
            formula="100 × (1 − severidad de lo vendido bajo presión) — ver abajo"
          />
          <ScoreTile label="Liquidez" weight="10%" value={score.liquidez} formula="100 × min(1, líquido / pagos de 6 meses) — ver abajo" />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">De dónde sale cada componente</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <InfoTile label="Peor mes: capital comprometido" value={pct(score.peakCapitalComprometidoRatio, 2)} formula="pico mensual ÷ Capital Social" />
          <InfoTile
            label="Acumulado (60 meses): capital comprometido"
            value={pct(score.avgCapitalComprometidoRatio, 2)}
            formula="suma de todos los meses ÷ Capital Social"
          />
          <InfoTile label="Rendimiento efectivo simulado" value={pct(score.effYield, 2)} formula="ingreso total ÷ (valor promedio invertido × 60 meses), anualizado" />
          <InfoTile
            label="Volatilidad de portafolio (con correlaciones)"
            value={pct(score.avgPortfolioVol, 2)}
            formula="√(wᵀΣw) cada mes contra la matriz de covarianza (sección 5.2), ponderado por cuánto se mantuvo invertido — esta es la que descuenta Rendimiento"
          />
          <InfoTile
            label="Volatilidad promedio sin correlaciones (referencia)"
            value={pct(score.avgVol, 2)}
            formula="promedio de la volatilidad de cada instrumento por separado, ignorando cómo se mueven entre sí — referencia, la que califica es la de arriba"
          />
          <InfoTile
            label="Tasa libre de riesgo (LIQ)"
            value={pct(RISK_FREE_RATE, 2)}
            formula="ancla del Sharpe ratio — el rendimiento nominal de LIQ, el instrumento más seguro del menú"
          />
          <InfoTile
            label="Rendimiento ajustado por riesgo (Sharpe ratio, menos concentración)"
            value={score.riskAdjustedYield.toFixed(3)}
            formula={`(${pct(score.effYield, 2)} − ${pct(RISK_FREE_RATE, 2)}) ÷ ${pct(score.avgPortfolioVol, 2)} − 0.5 × ${score.concentrationRatio.toFixed(2)} (concentración)`}
          />
          <InfoTile
            label="Total vendido bajo presión (60 meses)"
            value={`${money(score.totalVentaForzada)} (${pct(score.ventaForzadaSeveridad)} de severidad)`}
            formula="monto vendido antes de tiempo, ponderado por la volatilidad de lo vendido"
          />
          <InfoTile
            label="Pérdida por precio de venta anticipada"
            value={money(score.totalVentaForzadaPerdida)}
            formula="ya está descontada de Rendimiento efectivo simulado — vender antes de tiempo paga por debajo del valor en libros"
          />
          <InfoTile label="Cobertura de liquidez (6 meses)" value={`${money(score.liq6)} / ${money(score.liab6)} (${(score.cobertura * 100).toFixed(0)}%)`} formula="líquido disponible ÷ pagos esperados en 6 meses" />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">Otros datos de referencia (no califican)</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <InfoTile label="Reserva" value={money(score.reserva)} />
          <InfoTile label="Rendimiento portafolio (nominal)" value={pct(score.portYield, 2)} formula="promedio ponderado de los rendimientos elegidos, sin simular" />
          <InfoTile label="Ingreso de inversión — 2027 (ficticio)" value={money(score.incomeY1)} formula="suma de Rendimiento (meses 1-12) de esta corrida ficticia de 60 meses — la cifra del P&G real sale del ALM real, más abajo" />
          <InfoTile label="Ingreso de inversión — 2028 (ficticio)" value={money(score.incomeY2)} formula="suma de Rendimiento (meses 13-24) de esta corrida ficticia de 60 meses — la cifra del P&G real sale del ALM real, más abajo" />
          <InfoTile label="Ingreso total simulado (60 meses)" value={money(score.totIncome)} />
          <InfoTile
            label="Patrimonio disponible al final"
            value={money(score.patrimonioDisponible)}
            formula="Capital Social − todo lo comprometido en 60 meses"
            danger={score.patrimonioDisponible < 0}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Summary tiles for a team's own REAL ALM run — funded by their actual
 * premium, the same run finBench() benchmarks the true P&G's Resultado de
 * Inversiones against (see realAlmYear1's doc comment in finBenchHelper.ts).
 * Shown to teams once results are revealed (Día 3's "Respuestas Día 2"
 * reference tab) in place of the fictitious ALM score, which has no real
 * counterpart for figures like Sharpe ratio or the 35/35/20/10 nota split —
 * those only exist in the fictitious 60-month scenario (see AlmScoreTiles).
 *
 * Accepted tradeoff: cajaFinalAnio/portfolioBookValue/
 * capitalComprometidoAcumulado shown here are the exact true values Día 3's
 * own Balance Año 1 entregables (bal1_caja/bal1_inversiones/
 * bal1_necesidadesPatrimonioODeuda, concepts.ts) grade a team's *separate*
 * own estimate against, submitted the same day on the "Entregables Día 3"
 * tab of this same page — a team could read the answer here instead of
 * estimating it. Kept anyway (explicit product decision), not an oversight.
 */
export function AlmRealYearTiles({ realYear }: { realYear: AlmRealYearResult }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <InfoTile
        label="Ingreso de inversión real"
        value={money(realYear.income)}
        formula="suma del Rendimiento devengado en estos 12 meses, con tu prima real — esto es lo que finBench usa como Resultado de Inversiones del P&G real"
      />
      <InfoTile label="Rendimiento efectivo realizado" value={pct(realYear.effectiveYield, 2)} formula="ingreso ÷ saldo invertido promedio de estos 12 meses" />
      <InfoTile
        label="Capital comprometido acumulado"
        value={money(realYear.capitalComprometidoAcumulado)}
        formula="financiamiento externo genuino, una vez LIQ y todo tu portafolio real (Capital Social incluido) se agotaron"
        danger={realYear.capitalComprometidoAcumulado > 0}
      />
      <InfoTile label="Capital Social sin necesidad de financiamiento externo" value={money(realYear.capitalSocialRestante)} formula={`de ${money(CAPITAL_SOCIAL)}`} />
      <InfoTile label="Caja Mínima al cierre de diciembre" value={money(realYear.cajaFinalAnio)} />
      <InfoTile label="Valor del portafolio al cierre" value={money(realYear.portfolioBookValue)} />
      {realYear.totalVentaForzada > 0 && (
        <InfoTile
          label="Venta forzada este año"
          value={money(realYear.totalVentaForzada)}
          formula={`pérdida por venta anticipada: ${money(realYear.totalVentaForzadaPerdida)} — ${realYear.mesesConVentaForzada} mes(es)`}
          danger
        />
      )}
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
      <p className="mb-1 text-xs text-[var(--color-brand-text-secondary)]">
        <span className="mr-3 inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-brand-yellow)]" /> Venta forzada de portafolio
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--color-brand-red)]" /> Capital Social comprometido (ni LIQ ni el resto del portafolio alcanzaron)
        </span>
      </p>
      <div className="max-h-64 overflow-y-auto overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-brand-gray-light)]">
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
              <th className="px-2 py-1">Venta forzada</th>
              <th className="px-2 py-1">Capital comprometido</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={`border-t border-[var(--color-brand-gray-light)] ${
                  r.capitalComprometidoPortafolio > 0
                    ? "bg-[var(--color-brand-red)]/10"
                    : r.ventaForzadaPortafolio > 0
                      ? "bg-[var(--color-brand-yellow)]/10"
                      : ""
                }`}
              >
                <td className="px-2 py-1">{r.mes}</td>
                <td className="px-2 py-1">${Math.round(r.cajaInicial).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">${Math.round(r.primaCobrada).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">${Math.round(r.pagoSiniestros).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">${Math.round(r.gastos).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">{r.vencimientosCaja > 0 ? `$${Math.round(r.vencimientosCaja).toLocaleString("es-CO")}` : "—"}</td>
                <td className="px-2 py-1">${Math.round(r.inversionNeta).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">${Math.round(r.cajaFinal).toLocaleString("es-CO")}</td>
                <td className="px-2 py-1">
                  {r.ventaForzadaPortafolio > 0 ? `$${Math.round(r.ventaForzadaPortafolio).toLocaleString("es-CO")}` : "—"}
                </td>
                <td className="px-2 py-1">
                  {r.capitalComprometidoPortafolio > 0 ? `$${Math.round(r.capitalComprometidoPortafolio).toLocaleString("es-CO")}` : "—"}
                </td>
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
      <div className="max-h-64 overflow-y-auto overflow-x-auto rounded-[var(--radius-md)] border border-[var(--color-brand-gray-light)]">
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

/**
 * Explains where finBench()'s "Resultado de inversiones" benchmark
 * (p1.rinv/p2.rinv — the "Motor" figure the team's real P&G deliverable
 * gets graded against, see concepts.ts's p1_rinv) actually comes from,
 * side-by-side against the fictitious figure that same team's ALM nota was
 * graded on — admin-only (teams get their own real ALM view, without the
 * ficticio comparison, via AlmRealYearTiles below).
 *
 * Two different ALM runs matter here, for two different things:
 * - The FICTITIOUS run (`scoreFicticio`, Prima Cobrada = reserva/12,
 *   always an independent 60-month run per year) is what the team's own
 *   Día 1/2 ALM nota is graded on — a teaching device, never seen with real
 *   premium.
 * - The REAL run (`realYear`, funded by the team's actual premium, only
 *   ever 12 months — Año 1 fresh, Año 2 a genuine continuation of Año 1,
 *   see almSimRealYear()'s doc comment) is what finBenchHelper.ts feeds
 *   into finBench() to benchmark the *real* P&G/Balance/Solvencia
 *   deliverables — benchmarking a real deliverable against the
 *   hypothetical fictitious scenario would be wrong, since the team was
 *   never actually in it.
 *
 * The income figure is direct, not a proxy: real investment income (Σ
 * AlmSimRow.rendimientoPortafolio) actually accrued during that year's 12
 * months alone — never reserva×portYield (ignores real cash-flow timing)
 * and never a naive ending-minus-starting portfolio value (dominated by
 * how much fresh money flowed in/out, not by investment performance). It
 * now includes Capital Social's own accrual too (funded into the tree at
 * Año 1's start, see almSimRealYear()'s doc comment in alm.ts) — a team's
 * `income`/rinv is meaningfully larger than it would be from prima alone.
 * Capital comprometido itself does NOT factor into rinv — it already
 * reduces patrimonio directly in finBench()'s balance(), so folding it in
 * here too would double-count the same event; it's shown here purely for
 * transparency about how much external financing (beyond the team's whole
 * real portfolio, Capital Social included) this team has needed.
 */
export function AlmPnlBreakdown({
  scoreFicticio,
  realYear,
  year,
}: {
  scoreFicticio: FinancialScore;
  realYear: AlmRealYearResult;
  year: 1 | 2;
}) {
  const incomeFict = year === 1 ? scoreFicticio.incomeY1 : scoreFicticio.incomeY2;

  return (
    <div className="rounded-b-[var(--radius-lg)] rounded-t-none border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-cyan)] bg-[var(--color-brand-surface)] p-4">
      <h4 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
        De dónde sale el Resultado de Inversiones del P&G real — {SIMULATED_YEAR_LABEL[year]}
      </h4>
      <p className="mb-2 text-sm text-[var(--color-foreground)]">
        El benchmark (&ldquo;Motor&rdquo;) que califica el entregable real es directo: el ingreso de inversión que el portafolio realmente generó,
        mes a mes, durante los 12 meses de este año{" "}
        {year === 2 && "— continuando exactamente donde quedó el 2027, mismas posiciones abiertas, mismo capital comprometido acumulado — "}
        corrido con la prima real de este equipo — incluyendo el Capital Social, que se invierte desde el arranque del 2027 según su propia asignación
        inicial, dentro del mismo portafolio.
        {year === 2 &&
          " La prima 2028 en sí lee el calendario del equipo desde su propio mes 0 otra vez, así que se invierte con la misma lógica que la prima 2027, mientras las posiciones que ya venían abiertas desde 2027 siguen su propio checkpoint."}{" "}
        El capital comprometido (financiamiento externo genuino, ver abajo) va aparte: se resta directamente del patrimonio.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-[var(--radius-sm)] border border-[var(--color-brand-gray-light)] p-2">
          <p className="text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">Con el ALM real (esto es el benchmark real)</p>
          <p className="text-xs">
            <strong>{money(realYear.income)}</strong>
          </p>
        </div>
        <div className="rounded-[var(--radius-sm)] border border-[var(--color-brand-gray-light)] p-2">
          <p className="text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">Con el ALM ficticio (solo la nota de ALM del Día 1/2 usa este)</p>
          <p className="text-xs">
            <strong>{money(incomeFict)}</strong>
          </p>
        </div>
      </div>
      <div className="mt-3 rounded-[var(--radius-sm)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-blue-light)] p-2">
        <p className="text-xs font-semibold uppercase text-[var(--color-brand-text-secondary)]">
          Capital Social sin necesidad de financiamiento externo
        </p>
        <p className="font-[family-name:var(--font-condensed)] text-lg font-bold text-[var(--color-brand-blue-accent)]">
          {money(realYear.capitalSocialRestante)}{" "}
          <span className="text-xs font-normal text-[var(--color-brand-text-secondary)]">de {money(CAPITAL_SOCIAL)}</span>
        </p>
        <p className="text-[14px] italic text-[var(--color-brand-text-secondary)]">
          Capital Social − capital comprometido acumulado ({money(realYear.capitalComprometidoAcumulado)}
          {year === 2 ? " — acumulado desde el 2027, y se mantiene hasta que se reponga" : ""}). Capital Social ya está invertido según el calendario
          mensual desde el arranque del 2027, así que este número mide cuánto de él este equipo ha evitado tener que reponer con financiamiento
          externo (casi siempre el total, ver abajo). Esto es lo mismo que finBench() usa para restar directamente del patrimonio en el Balance real
          de este año.
        </p>
      </div>
      <p className="mt-2 text-[14px] italic text-[var(--color-brand-text-secondary)]">
        La Reserva y el Rendimiento nominal del portafolio (portYield) son los mismos entre el ficticio y el real, porque son independientes de la
        prima. Lo que sí cambia es el ingreso de inversión y el capital comprometido, porque ambos dependen de cuándo entra realmente la caja mes a mes.
      </p>
    </div>
  );
}
