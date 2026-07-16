import { BUILD_MONTHS, HORIZON } from "../reserving/constants";
import type { LiabilitySchedule } from "../reserving/liability";
import { INSTRUMENTS, INSTRUMENT_BY_ID, VOL_MAX, isBondLike, trancheDurationM } from "./instruments";
import type { Allocation, PortfolioDecisionV3, Tranche } from "./instruments";
import { FZ, GASTOS_TOTAL_PCT, VOL_PENALTY_LAMBDA, CONCENTRATION_PENALTY_MU, CAPITAL_SOCIAL } from "./constants";

export const W_CUMPL_CAJA = 0.35;
export const W_REND = 0.35;
/** Weight of the "no me tocó vender el portafolio para cuadrar caja" sub-score — see scoreFinanciero()'s ventaForzada. */
export const W_VENTA_FORZADA = 0.2;
export const W_LIQ = 0.1;

/**
 * Floor/ceiling for the "Rendimiento" ALM sub-score's normalization —
 * deliberately *not* `Math.min/max` over each instrument's own nominal
 * `yield - λ×volAnual` (what this used to be). That nominal formula ignores
 * everything the simulation actually does to a portfolio over 60 months —
 * before the stepMonth() accrual-timing fix (see its doc comment), realized
 * risk-adjusted yield for *any* portfolio came in far below nominal, so the
 * old nominal-anchored band left almost everything scoring 0.
 *
 * These two constants are the *realized* risk-adjusted yield (`effYield -
 * λ×avgVol - μ×concentrationRatio`, same formula as below, just measured
 * instead of assumed) of a reference portfolio run through
 * `almSim()`/`scoreFinanciero()` end to end — the actual floor and ceiling
 * this engine can produce, not a theoretical one:
 * - MIN ≈ 0.046: 100% LIQ, `durationM=12`, "repeat" forever. LIQ's own 5%
 *   nominal yield (see instruments.ts) makes it the menu's worst realized
 *   risk-adjusted choice — pure safety has a real opportunity cost, exactly
 *   the point this sub-score exists to make. LIQ is excluded from
 *   portfolioConcentrationRatio()'s weight base (see its doc comment), so
 *   this reference is unaffected by μ — a single instrument that IS subject
 *   to the concentration discount (e.g. 100% ACC) can score lower still,
 *   which just clips to a Rendimiento of 0 rather than moving this floor.
 * - MAX ≈ 0.089: an even 25%/25%/25%/25% split across CDT90/TES1/TES3/
 *   TESUVR8 (ACC excluded — its volatility never pays for itself even
 *   diluted), each "repeat" forever. Concentrating in any single instrument
 *   scores lower than this even before its own volatility is considered
 *   (e.g. 100% TESUVR8 alone: 0.098 nominal-realized, but 0.068 once its
 *   concentrationRatio=1 is discounted at μ) — confirmed against a coarse
 *   grid search over the 5-instrument simplex (same method as
 *   markowitz.test.ts's cross-check), which found no blend beating this
 *   reference by more than the grid's own discretization slack.
 *
 * Recompute both (same harness: run a reference allocation through
 * `scoreFinanciero()`, read off `riskAdjustedYield`) if the instrument
 * menu, `VOL_PENALTY_LAMBDA`, `CONCENTRATION_PENALTY_MU`, or the accrual
 * mechanic ever change.
 */
export const RISK_ADJUSTED_YIELD_MIN = 0.046;
export const RISK_ADJUSTED_YIELD_MAX = 0.089;

/** cumplimientoCaja blends the single worst month's capital draw (tail risk) with the cumulative capital committed across the whole horizon (chronic mismatch) — see scoreFinanciero(). */
export const W_CAP_PEAK = 0.5;
export const W_CAP_AVG = 0.5;

/** Rate shocks (+20%/-15% relative to base), ported from ALM_TASA_* line ~1804. */
export const ALM_TASA_BASE = 0.1;
export const ALM_TASA_ALZA = 0.1 * 1.2;
export const ALM_TASA_BAJA = 0.1 * 0.85;

export interface AlmSimRow {
  mes: number;
  cajaInicial: number;
  primaCobrada: number;
  pagoSiniestros: number;
  gastos: number;
  /** Proceeds this month from instruments that matured with a "mantener en caja" rule — folded into availability before Inversión Neta is computed. */
  vencimientosCaja: number;
  /** Negative = surplus invested this month; positive = drawn from LIQ, forced portfolio sales, and/or committed capital to cover a Caja Mínima shortfall — always exactly covers the shortfall now (see the module doc comment: Caja Mínima is never left unmet). */
  inversionNeta: number;
  cajaFinal: number;
  fase: "a1" | "post";
  /** The portion of this month's inversionNeta that came from force-selling a non-LIQ position early (before its own maturity) to cover a shortfall LIQ alone couldn't — 0 whenever LIQ was enough. See scoreFinanciero()'s ventaForzada sub-score. */
  ventaForzadaPortafolio: number;
  /** The portion of this month's inversionNeta that came from Capital Social itself — only nonzero once LIQ *and* the entire rest of the portfolio were already exhausted this month. Once committed, this never gets "repaid" by a later month's surplus (see the module doc comment) — it's a lasting mark against the team's equity, not a temporary overdraft. */
  capitalComprometidoPortafolio: number;
  /** Book value of every open investment position at the START of this month, net of any Capital Social committed so far (= previous month's saldoFinalPortafolio, or 0 at the first month) — separate from the cash-statement columns above, this tracks the *portfolio's* value, not the cash floor. Can be negative once cumulative capital committed exceeds what's actually invested. */
  saldoInicialPortafolio: number;
  /** Yield/growth accrued this month across all open positions (step 1 of the simulation) — the only way saldoFinalPortafolio can grow without fresh Inversión Neta. */
  rendimientoPortafolio: number;
  /** saldoInicialPortafolio + rendimientoPortafolio - vencimientosCaja - inversionNeta (an identity — see alm.test.ts): money leaves the portfolio via "mantener en caja" or a draw to cover a shortfall, and enters via fresh Inversión Neta. Can be negative — see capitalComprometidoPortafolio. */
  saldoFinalPortafolio: number;
}

export interface AlmSimResult {
  rows: AlmSimRow[];
  /** Sum of every month's Caja Mínima requirement — the normalizing scale for the score ratios below. */
  sumCajaMinima: number;
  reserva: number;
  effYield: number;
  avgPV: number;
  totIncome: number;
  incomeY1: number;
  incomeY2: number;
  liq6: number;
  liab6: number;
  /** Diagnostic only (not used in scoring) — the largest number of simultaneously open positions, a sanity check that a team's tree isn't spawning a pathological number of live branches. */
  peakOpenPositions: number;
  /** Book-value-weighted average annualized volatility of everything actually held over the whole horizon (not just the initial allocation) — feeds the risk-adjusted "Rendimiento" sub-score and the Día 4 financial risk charge (see finBench()'s rFin). */
  avgVol: number;
  /** Sum of every month's forced-sale amount across the horizon — see ventaForzadaPortafolio on AlmSimRow. */
  totalVentaForzada: number;
  /** Σ (forced-sale amount × that instrument's volAnual) across the horizon — the raw severity accumulator behind scoreFinanciero()'s ventaForzada sub-score: selling the same dollar amount of ACC contributes far more here than selling CDT90. */
  ventaForzadaVolWeighted: number;
  /** Diagnostic only — months where LIQ alone wasn't enough and a non-LIQ position had to be sold early. */
  mesesConVentaForzada: number;
  /** Worst single month's draw on Capital Social — tail-risk half of cumplimientoCaja's new formula. */
  peakCapitalComprometido: number;
  /** Cumulative Capital Social committed across the whole 60-month horizon — chronic-erosion half of cumplimientoCaja's new formula. */
  totalCapitalComprometido: number;
  /** Cumulative Capital Social committed through the end of calendar Year 1 (absolute month 11) — what finBench() subtracts from bal1's patrimonio. */
  capitalComprometidoY1: number;
  /** Cumulative Capital Social committed through the end of calendar Year 2 (absolute month 23) — what finBench() subtracts from bal2's patrimonio. */
  capitalComprometidoY2: number;
  /** Diagnostic only — months where LIQ and the entire rest of the portfolio were both exhausted and Capital Social itself had to be tapped. */
  mesesConCapitalComprometido: number;
}

interface Position {
  /** Reference to the exact tranche that produced this position — its onMaturity is read fresh when this position matures. */
  tranche: Tranche;
  book: number;
  yM: number;
  matM: number;
}

/**
 * Everything a month-by-month simulation needs to carry from one month to
 * the next — mutated in place by stepMonth(). Exposed (opaquely, to
 * callers outside this module) so almSimRealYear() can hand Año 1's
 * ending state to Año 2's call as a genuine continuation (same open
 * positions, same accumulated capital comprometido) instead of starting
 * over from zero — see almSimRealYear()'s doc comment.
 */
export interface AlmYearState {
  positions: Position[];
  capitalComprometidoAcumulado: number;
  cajaFloat: number;
}

interface MonthAccumulators {
  totalVentaForzada: number;
  ventaForzadaVolWeighted: number;
  mesesConVentaForzada: number;
  peakCapitalComprometido: number;
  totalCapitalComprometido: number;
  mesesConCapitalComprometido: number;
  peakOpenPositions: number;
}

function freshAccumulators(): MonthAccumulators {
  return {
    totalVentaForzada: 0,
    ventaForzadaVolWeighted: 0,
    mesesConVentaForzada: 0,
    peakCapitalComprometido: 0,
    totalCapitalComprometido: 0,
    mesesConCapitalComprometido: 0,
    peakOpenPositions: 0,
  };
}

interface StepResult {
  row: AlmSimRow;
  devengo: number;
  /** Undiminished book value of everything held after this month's execution — feeds avgPV/avgVol, deliberately never netted against capitalComprometidoAcumulado (see the module doc comment on realBookSum in the original inline version of this logic). */
  realBookSum: number;
  volWeightedBookSum: number;
}

/**
 * Runs exactly one month of the cashflow-statement simulation (the four
 * steps described in almSim()'s doc comment), mutating `state` in place
 * and accumulating totals into `acc`. Factored out of almSim() so the
 * exact same mechanics can run either as one continuous 60-month pass
 * (the fictitious ALM, almSim — always starts state fresh at month 0) or
 * as two chained 12-month passes that hand state from one to the next
 * (the real ALM, almSimRealYear). `t` is the *absolute* month index (must
 * keep increasing across chained calls — see almSimRealYear — since every
 * open position's own `matM` is stamped in this same absolute frame);
 * `mesLabel` is only cosmetic, what ends up in the returned row's `mes`
 * field.
 */
function stepMonth(
  t: number,
  mesLabel: number,
  fase: "a1" | "post",
  primaCobrada: number,
  pagoSiniestros: number,
  decision: PortfolioDecisionV3,
  state: AlmYearState,
  acc: MonthAccumulators
): StepResult {
  const saldoInicialPortafolio = state.positions.reduce((s, p) => s + p.book, 0) - state.capitalComprometidoAcumulado;

  // 1. Route this month's maturities per each position's own onMaturity.
  //    Runs before accrual (below) — a maturing position pays out its book
  //    value as of last month's close, without earning further on its own
  //    maturity month; its "repeat"/"reallocate" replacement is a brand-new
  //    position that (correctly) hasn't earned anything yet either, until
  //    the accrual step below runs.
  const remaining: Position[] = [];
  const maturingNow: Position[] = [];
  for (const p of state.positions) (p.matM === t ? maturingNow : remaining).push(p);
  let vencCash = 0;
  for (const p of maturingNow) {
    const action = p.tranche.onMaturity;
    if (action.action === "cash") vencCash += p.book;
    else if (action.action === "repeat") fundTranches([p.tranche], p.book, t, remaining);
    else fundTranches(action.tranches, p.book, t, remaining);
  }
  state.positions = remaining;

  // 2. Compute the six cashflow-statement values for this month.
  const gastos = GASTOS_TOTAL_PCT * primaCobrada;
  const cajaMinima = FZ.cajaPct * (primaCobrada + pagoSiniestros);
  const cajaInicial = state.cajaFloat;
  const cajaDisponible = cajaInicial + primaCobrada - pagoSiniestros - gastos + vencCash;
  const neededNeta = cajaMinima - cajaDisponible;

  // 3. Execute. Caja Mínima is always met from here on.
  let inversionNeta: number;
  let cajaFinal: number;
  let ventaForzada = 0;
  let capitalComprometido = 0;
  if (neededNeta <= 0) {
    const surplus = -neededNeta;
    fundTranches(decision.tranches, surplus, t, state.positions);
    inversionNeta = neededNeta;
    cajaFinal = cajaMinima;
  } else {
    const liqDrawn = drawFromLiq(neededNeta, state.positions);
    const afterLiq = neededNeta - liqDrawn;
    const { sold, volWeighted } = forceLiquidatePortfolio(afterLiq, state.positions);
    ventaForzada = sold;
    capitalComprometido = afterLiq - sold;
    inversionNeta = liqDrawn + sold + capitalComprometido;
    cajaFinal = cajaMinima;
    if (ventaForzada > 0) {
      acc.totalVentaForzada += ventaForzada;
      acc.ventaForzadaVolWeighted += volWeighted;
      acc.mesesConVentaForzada++;
    }
    if (capitalComprometido > 0) {
      state.capitalComprometidoAcumulado += capitalComprometido;
      acc.totalCapitalComprometido += capitalComprometido;
      if (capitalComprometido > acc.peakCapitalComprometido) acc.peakCapitalComprometido = capitalComprometido;
      acc.mesesConCapitalComprometido++;
    }
  }
  state.cajaFloat = cajaFinal;

  // 4. Accrue yield on every position now open this month — including ones
  //    funded moments ago in steps 1/3 above. Deliberately runs *after*
  //    maturity-routing and new investment, not before: a position accrues
  //    for every month it's actually held, from the month it's funded
  //    through the month before it matures (inclusive on both ends is
  //    wrong — see below). Running accrual first (the original order) made
  //    every newly-created position skip its own first month entirely,
  //    silently losing 1/duration of its yield — total for a 1-month
  //    tranche, ~33% for a 3-month one (CDT90), ~8% for a 12-month one —
  //    purely from how often it happened to roll over, unrelated to real
  //    risk. Confirmed empirically: identical instrument, identical nominal
  //    yield, realized return went from 0% (durationM=1) to within half a
  //    point of nominal (durationM=60) purely by changing rollover
  //    frequency. A position still doesn't accrue on its own maturity
  //    month (it's paid out based on last month's book, not "topped up"
  //    first) — that half of the asymmetry was always correct and is
  //    unaffected by this reorder.
  let devengo = 0;
  for (const p of state.positions) {
    if (p.matM > t) {
      const g = p.book * p.yM;
      p.book += g;
      devengo += g;
    }
  }

  // realBookSum feeds avgPV/effYield/avgVol — those describe the actual
  // invested pool's size/composition/performance and must stay
  // uncorrupted by capitalComprometidoAcumulado, which is an emergency
  // equity injection, not part of what's earning yield. Only the
  // *displayed* saldoFinalPortafolio nets it out (that's the whole point
  // of letting the portfolio show negative).
  const realBookSum = state.positions.reduce((s, p) => s + p.book, 0);
  const saldoFinalPortafolio = realBookSum - state.capitalComprometidoAcumulado;
  const volWeightedBookSum = state.positions.reduce((s, p) => s + p.book * INSTRUMENT_BY_ID[p.tranche.instrumentId].volAnual, 0);
  acc.peakOpenPositions = Math.max(acc.peakOpenPositions, state.positions.length);

  const row: AlmSimRow = {
    mes: mesLabel,
    cajaInicial,
    primaCobrada,
    pagoSiniestros,
    gastos,
    vencimientosCaja: vencCash,
    inversionNeta,
    cajaFinal,
    fase,
    saldoInicialPortafolio,
    rendimientoPortafolio: devengo,
    saldoFinalPortafolio,
    ventaForzadaPortafolio: ventaForzada,
    capitalComprometidoPortafolio: capitalComprometido,
  };

  return { row, devengo, realBookSum, volWeightedBookSum };
}

/**
 * Splits `monto` across `tranches` by weight and appends one new Position
 * per non-degenerate share into `positions`. Used to (a) fund the top-level
 * decision.tranches template with fresh money every month (the base
 * allocation isn't a one-time lump — it's a reusable policy applied
 * whenever there's surplus to invest, exactly like the previous
 * `allocation` field), (b) fund a "reallocate" node's children, and (c)
 * re-fund a "repeat" tranche (called with a singleton `[tranche]` list).
 * Purely iterative — never calls itself or almSim — so "repeat"/"reallocate"
 * cycling across many months never grows the call stack; see the module
 * doc comment above almSim.
 */
function fundTranches(tranches: Tranche[], monto: number, atMonth: number, positions: Position[]): void {
  if (monto <= 0) return;
  const valid = tranches.filter((tr) => INSTRUMENT_BY_ID[tr.instrumentId] && tr.weight > 0);
  const totalW = valid.reduce((s, tr) => s + tr.weight, 0);
  if (totalW <= 0) return;
  for (const tranche of valid) {
    const parte = (tranche.weight / totalW) * monto;
    if (parte <= 0) continue;
    const ins = INSTRUMENT_BY_ID[tranche.instrumentId];
    const yM = Math.pow(1 + ins.yield, 1 / 12) - 1;
    const dur = Math.max(1, trancheDurationM(tranche));
    positions.push({ tranche, book: parte, yM, matM: atMonth + dur });
  }
}

/**
 * Draws up to `neededNeta` out of whatever LIQ positions currently have
 * money, mutating their book values in place — a LIQ position stays part
 * of the always-drawable pool regardless of where it is in its own
 * maturity countdown (LIQ's custom duration is a decision-cadence device,
 * not a liquidity lock; see the module doc comment). Returns the amount
 * actually drawn.
 */
function drawFromLiq(neededNeta: number, positions: Position[]): number {
  let remaining = neededNeta;
  for (const p of positions) {
    if (remaining <= 0) break;
    if (p.tranche.instrumentId !== "LIQ") continue;
    const take = Math.min(p.book, remaining);
    p.book -= take;
    remaining -= take;
  }
  return neededNeta - remaining;
}

/**
 * Forced liquidation: when LIQ alone can't cover a Caja Mínima shortfall,
 * the team must sell *something else* early — the engine can't just leave
 * the gap unmet while sitting on an untouched bond/equity portfolio. Sells
 * non-LIQ positions in ascending volAnual order (safest/least-volatile
 * first, ACC only as a last resort), so a team that kept some low-vol
 * ladder around gets tapped there before anything touches its equities.
 * Selling reduces a position's book value exactly like a natural maturity
 * payout would (no artificial haircut on the cash side — the consequence
 * lives entirely in the ventaForzada score, not in fabricated losses), and
 * does NOT trigger that position's onMaturity decision (it's an early,
 * forced exit, not a real maturity event).
 * Returns { sold, volWeighted }: total $ liquidated and the volatility-
 * weighted amount (Σ sold_i × volAnual_i) used to size the score penalty.
 */
function forceLiquidatePortfolio(neededNeta: number, positions: Position[]): { sold: number; volWeighted: number } {
  let remaining = neededNeta;
  let sold = 0;
  let volWeighted = 0;
  if (remaining <= 0) return { sold, volWeighted };
  const sellable = positions
    .filter((p) => p.tranche.instrumentId !== "LIQ" && p.book > 0)
    .sort((a, b) => INSTRUMENT_BY_ID[a.tranche.instrumentId].volAnual - INSTRUMENT_BY_ID[b.tranche.instrumentId].volAnual);
  for (const p of sellable) {
    if (remaining <= 0) break;
    const vol = INSTRUMENT_BY_ID[p.tranche.instrumentId].volAnual;
    const take = Math.min(p.book, remaining);
    p.book -= take;
    remaining -= take;
    sold += take;
    volWeighted += take * vol;
  }
  return { sold, volWeighted };
}

/**
 * Month-by-month portfolio cashflow simulation, structured as a cashflow
 * statement (Caja Inicial / Prima Cobrada / Pago Siniestros / Gastos /
 * Vencimientos en caja / Inversión Neta / Caja Final) and checked against a
 * mandatory minimum-cash floor (Caja Mínima) each month.
 *
 * `decision.tranches` is a tree, not a flat allocation: each tranche is a
 * slice of money in one instrument, and its `onMaturity` says what happens
 * when it reaches its own maturity/decision month — held as cash, repeated
 * (refunds the same instrument+duration indefinitely, no further
 * decisions), or reallocated into 1+ new child tranches (each with its own
 * onMaturity). The whole tree is also the *template* applied to fresh
 * surplus every month (Prima Cobrada during the build phase, or any
 * month's leftover after Caja Mínima is met) — a team decides this whole
 * tree once, up front, in a single sitting; there is no live/staged
 * simulation, `almSim` still runs the full horizon in one deterministic
 * pass, exactly as before.
 *
 * Every instrument now has a maturity: bond-like instruments (CDT90/TES1/
 * TES3/TESUVR8) use their own fixed ins.plazoM; LIQ and ACC use a
 * team-chosen `durationM` per tranche instead. LIQ and ACC generalize
 * differently, though, because they play different roles:
 * - LIQ positions still count toward the instantly-drawable pool for
 *   covering a Caja Mínima shortfall (drawFromLiq) REGARDLESS of their own
 *   maturity countdown — locking LIQ up would defeat its entire purpose as
 *   the always-liquid choice. Its durationM only controls when its
 *   onMaturity decision fires, not whether the money is usable before then.
 * - ACC positions are genuinely illiquid until their own maturity, exactly
 *   like a bond — this is what finally lets a team exit an equity position
 *   at a chosen time; before this, equities never converted back to cash.
 *
 * The engine never overrides a team's stated maturity rule to cover a
 * shortfall — a positive Inversión Neta can only draw on LIQ. A shortfall
 * caused by locking everything into illiquid reallocation chains is
 * exactly the failure being graded.
 *
 * Historical note: extends almSim() from the legacy prototype, line ~1659,
 * and this app's earlier `initial`/`reinvest` two-phase split, then its
 * later flat per-instrument `maturityRules` — this version replaces both
 * with a genuine per-tranche decision tree.
 */
export function almSim(lib: LiabilitySchedule, decision: PortfolioDecisionV3, aporteMensualReal?: number): AlmSimResult | null {
  if (!lib.hay) return null;
  const totalTopW = decision.tranches.reduce(
    (s, t) => (INSTRUMENT_BY_ID[t.instrumentId] ? s + Math.max(0, t.weight) : s),
    0
  );
  if (totalTopW <= 0) return null;

  const reserva = lib.reserva;
  const totalPagoY1 = lib.payY1.reduce((s, v) => s + v, 0);
  const notionalFondeo = reserva + totalPagoY1;
  const TOTAL = BUILD_MONTHS + HORIZON;
  // The fictitious ALM funds itself off the notional (reserva+payY1)/12 —
  // sized to exactly match the liability, an intentional simplification
  // (see the module doc comment). Passing aporteMensualReal (a team's real
  // annual premium / BUILD_MONTHS) instead re-runs the exact same
  // simulation — same claims schedule, same decision tree, same Caja
  // Mínima rule — funded by what the team actually collected, so a team
  // can see its *real* ALM (informational; the fictitious run is still
  // what's graded, see README §5.3) side by side with the fictitious one.
  const aporteMensual = aporteMensualReal ?? notionalFondeo / BUILD_MONTHS;

  const state: AlmYearState = { positions: [], capitalComprometidoAcumulado: 0, cajaFloat: 0 };
  const acc = freshAccumulators();

  const rows: AlmSimRow[] = [];
  let sumCajaMinima = 0;
  let totIncome = 0;
  let incomeY1 = 0;
  let incomeY2 = 0;
  let sumPV = 0;
  let sumVolWeighted = 0;
  let liq6 = 0;
  let liab6 = 0;
  let cumLiabReserva = 0;
  let capitalComprometidoY1 = 0;
  let capitalComprometidoY2 = 0;

  for (let t = 0; t < TOTAL; t++) {
    const buildPhase = t < BUILD_MONTHS;
    const primaCobrada = buildPhase ? aporteMensual : 0;
    const pagoY1 = buildPhase ? lib.payY1[t] || 0 : 0;
    const pagoReserva = t >= BUILD_MONTHS ? lib.L[t - BUILD_MONTHS] || 0 : 0;
    const pagoSiniestros = pagoY1 + pagoReserva;
    if (t >= BUILD_MONTHS) {
      cumLiabReserva += pagoReserva;
      if (t - BUILD_MONTHS <= 6) liab6 = cumLiabReserva;
    }
    sumCajaMinima += FZ.cajaPct * (primaCobrada + pagoSiniestros);

    const { row, devengo, realBookSum, volWeightedBookSum } = stepMonth(
      t,
      t - BUILD_MONTHS,
      buildPhase ? "a1" : "post",
      primaCobrada,
      pagoSiniestros,
      decision,
      state,
      acc
    );
    rows.push(row);

    totIncome += devengo;
    if (buildPhase) incomeY1 += devengo;
    // Year 2 = the 12 months right after Year 1 closes (t=12..23), same
    // windowing as capitalComprometidoY2 below — the actual investment
    // income the portfolio generated during that specific calendar year,
    // not a formula proxy (see finBench()'s rinv2, and the module doc
    // comment's note on why this is what "resultado de inversiones"
    // should mean for a P&G line: real accrued yield/growth on what was
    // invested, never contaminated by how much fresh money flowed in or
    // out that year).
    if (t >= BUILD_MONTHS && t < BUILD_MONTHS + 12) incomeY2 += devengo;
    sumPV += realBookSum;
    sumVolWeighted += volWeightedBookSum;

    if (t === BUILD_MONTHS - 1) capitalComprometidoY1 = state.capitalComprometidoAcumulado;
    if (t === BUILD_MONTHS + 11) capitalComprometidoY2 = state.capitalComprometidoAcumulado;

    if (t === BUILD_MONTHS) {
      liq6 = state.positions.reduce((s, p) => {
        if (p.tranche.instrumentId === "LIQ") return s + p.book;
        if (p.matM > t && p.matM <= t + 6) return s + p.book;
        return s;
      }, 0);
    }
  }

  const { totalVentaForzada, ventaForzadaVolWeighted, mesesConVentaForzada, peakCapitalComprometido, totalCapitalComprometido, mesesConCapitalComprometido, peakOpenPositions } = acc;

  const avgPV = sumPV / TOTAL;
  const rMonthly = avgPV > 0 ? totIncome / (avgPV * TOTAL) : Math.pow(1 + INSTRUMENT_BY_ID.LIQ.yield, 1 / 12) - 1;
  const effYield = Math.pow(1 + rMonthly, 12) - 1;
  const avgVol = sumPV > 0 ? sumVolWeighted / sumPV : 0;

  return {
    rows,
    sumCajaMinima,
    reserva,
    effYield,
    avgPV,
    totIncome,
    incomeY1,
    incomeY2,
    liq6,
    liab6,
    peakOpenPositions,
    avgVol,
    totalVentaForzada,
    ventaForzadaVolWeighted,
    mesesConVentaForzada,
    peakCapitalComprometido,
    totalCapitalComprometido,
    capitalComprometidoY1,
    capitalComprometidoY2,
    mesesConCapitalComprometido,
  };
}

export interface FinancialScore {
  cumplimientoCaja: number;
  rendimiento: number;
  ventaForzada: number;
  liquidez: number;
  nota: number;
  portYield: number;
  effYield: number;
  reserva: number;
  /** Fraction of Capital Social committed in the single worst month, clipped to [0,1] — tail-risk half of cumplimientoCaja. */
  peakCapitalComprometidoRatio: number;
  /** Fraction of Capital Social committed cumulatively across the whole horizon, clipped to [0,1] — chronic-erosion half of cumplimientoCaja. */
  avgCapitalComprometidoRatio: number;
  /** Real investment income the portfolio accrued during Year 1's 12 build months (Σ AlmSimRow.rendimientoPortafolio for those months) — this, not a formula, is what finBench() uses for the Año 1 P&G's "Resultado de inversiones" line. Never contaminated by how much fresh money flowed in/out that year, unlike a naive ending-minus-starting-portfolio-value delta would be. */
  incomeY1: number;
  /** Same idea as incomeY1, for the 12 months right after Year 1 closes — what finBench() uses for the Año 2/3 P&G's "Resultado de inversiones" line. */
  incomeY2: number;
  liq6: number;
  liab6: number;
  cobertura: number;
  avgPV: number;
  totIncome: number;
  tranches: Tranche[];
  /** Book-value-weighted average volatility actually held over the horizon — see AlmSimResult.avgVol. */
  avgVol: number;
  /** Decision-only concentration ratio of the submitted tree — see portfolioConcentrationRatio(). */
  concentrationRatio: number;
  /** effYield - VOL_PENALTY_LAMBDA*avgVol - CONCENTRATION_PENALTY_MU*concentrationRatio — the "Rendimiento" sub-score is normalized off this, not the raw effYield, so a high yield achieved through a volatile or concentrated portfolio scores worse than a similar yield achieved safely and diversified. */
  riskAdjustedYield: number;
  /** Raw $ forced-liquidated across the horizon (see AlmSimResult.totalVentaForzada) — 0 for a team that never needed to sell early. */
  totalVentaForzada: number;
  /** ventaForzadaVolWeighted / (sumCajaMinima * VOL_MAX), clipped to [0,1] — the severity ratio the ventaForzada sub-score is built from; exposed separately so evaluators can see "how bad," not just the 0-100 score. */
  ventaForzadaSeveridad: number;
  /** Cumulative Capital Social committed through the end of calendar Year 1 — see finBench()'s bal1. */
  capitalComprometidoY1: number;
  /** Cumulative Capital Social committed through the end of calendar Year 2 — see finBench()'s bal2. */
  capitalComprometidoY2: number;
  /** CAPITAL_SOCIAL minus everything committed across the full 60-month horizon — the team's ending equity position under this ALM decision alone, informational (finBench applies the Y1/Y2 checkpoints above, not this end-of-horizon figure, to the real Balance). Negative means the decision would have fully wiped out Capital Social by month 60. */
  patrimonioDisponible: number;
}

/**
 * Decision-only (no simulation) weighted-average nominal yield of a
 * portfolio's top-level tranches — the same shape nominalPortfolioVolRatio()
 * in capacity.ts uses for volatility, just for yield instead. Never depends
 * on funding size or claims, so it's identical between the fictitious and
 * real ALM for the same decision tree.
 */
export function portfolioNominalYield(tranches: Tranche[]): number {
  const totalTopW = tranches.reduce((s, t) => (INSTRUMENT_BY_ID[t.instrumentId] ? s + Math.max(0, t.weight) : s), 0);
  if (totalTopW <= 0) return 0;
  return tranches.reduce((s, t) => {
    const ins = INSTRUMENT_BY_ID[t.instrumentId];
    return ins ? s + (Math.max(0, t.weight) / totalTopW) * ins.yield : s;
  }, 0);
}

/**
 * Decision-only (no simulation) concentration ratio of a portfolio's
 * top-level tranches, normalized to [0, 1] — 0 = risky exposure spread
 * evenly across every non-LIQ instrument in the menu, 1 = concentrated in a
 * single one. Feeds both the Día 2 "Rendimiento" sub-score's discount (see
 * CONCENTRATION_PENALTY_MU in constants.ts) and Día 4's solvency
 * concentration-risk capital charge (see rConcentracion in finBench.ts) —
 * same measurement, two different consequences.
 *
 * LIQ is excluded from the weight base entirely, not just given a low
 * score: it's a pooled liquidity fund, not a single-name credit/market
 * exposure, so it carries no concentration risk in the Solvency-II sense
 * this models (real-world concentration sub-modules exempt cash-equivalent
 * holdings the same way). A team holding half LIQ and half ACC is exactly
 * as concentrated as one holding 100% ACC — the LIQ half isn't
 * "diversifying" the equity risk, it's just holding less of it, which the
 * existing volatility-based rFin/riskAdjustedYield already price in
 * separately. A team with no risky exposure at all (100% LIQ) returns 0 —
 * there's nothing to be concentrated in.
 *
 * Normalized against the menu's 5 non-LIQ instruments: an even split
 * across all 5 (HHI=1/5) maps to 0, a single instrument (HHI=1) maps to 1.
 */
export function portfolioConcentrationRatio(tranches: Tranche[]): number {
  const risky = tranches.filter((t) => t.instrumentId !== "LIQ" && INSTRUMENT_BY_ID[t.instrumentId] && t.weight > 0);
  const totalW = risky.reduce((s, t) => s + t.weight, 0);
  if (totalW <= 0) return 0;
  const hhi = risky.reduce((s, t) => s + (t.weight / totalW) ** 2, 0);
  const nRisky = INSTRUMENTS.filter((i) => i.id !== "LIQ").length;
  const minHhi = 1 / nRisky;
  return Math.max(0, Math.min(1, (hhi - minHhi) / (1 - minHhi)));
}

export interface AlmRealYearResult {
  rows: AlmSimRow[];
  /** Decision-only, see portfolioNominalYield() — unrelated to this year's actual simulated performance. */
  portYield: number;
  /** Decision-only, see portfolioConcentrationRatio() — unrelated to this year's actual simulated performance. */
  concentrationRatio: number;
  /** Real investment income this specific 12-month year accrued (Σ rendimientoPortafolio) — what finBench() uses for that year's P&G "Resultado de inversiones" line. */
  income: number;
  /** Realized yield actually earned this year (income ÷ average invested book balance across the 12 months) — distinct from `portYield` (the tree's nominal, decision-only yield): a team that had to force-sell or commit capital gets a lower effectiveYield than its tree's nominal rate would suggest. Used to project Año 3's investment income off the *realized* rate instead of the nominal one — see finBench.ts's p3. */
  effectiveYield: number;
  /** Book-value-weighted average volatility actually held during just this year — feeds finBench()'s rFin volRatio for that year. */
  avgVol: number;
  /** Cumulative Capital Social committed through the end of this year (continues accumulating from whatever initialState carried in, if any). */
  capitalComprometidoAcumulado: number;
  /** CAPITAL_SOCIAL minus capitalComprometidoAcumulado — how much Capital Social this team has left after this year's real ALM. See README §5.3. */
  capitalSocialRestante: number;
  totalVentaForzada: number;
  mesesConVentaForzada: number;
  peakCapitalComprometido: number;
  /** Pass this into Año 2's call (as almSimRealYear(2, ..., initialState)) to continue from exactly where Año 1 left off — same open positions, same accumulated capital comprometido. */
  finalState: AlmYearState;
}

/**
 * The *real* ALM — funded by what the team actually collected, run for
 * exactly the 12 months of one calendar year, because that's all the real
 * P&G/Balance for that year ever needs (see README §5.3): unlike the
 * fictitious ALM (almSim, always an independent 60-month run per year,
 * under the reserva/12 funding hypothesis — that's a teaching device for
 * the ALM's own Día 1/2 nota, and stays exactly as it was), the real ALM
 * has no reason to project 48 months past a year nobody is grading a real
 * deliverable against.
 *
 * year===1 starts fresh (state defaults to zero positions/caja/capital
 * comprometido) funded against that team's own Year-1-within-Year-1 claims
 * schedule (typically lib.payY1). year===2 must receive `initialState` —
 * Año 1's `finalState` — and continues the *same* simulation for another
 * 12 months (same open positions still earning yield/maturing on their
 * own original schedule, same capitalComprometidoAcumulado carried
 * forward), now funded by Año 2's real premium against Año 2's own claims
 * schedule (typically Año 1's development landing in Año 2 — lib.L.slice(0,12)
 * — plus Año 2's own new claims' first-year payments, added together by
 * the caller — see finBenchHelper.ts). This is a genuine continuation, not
 * "what if this tree had run from month 0" — that hypothetical is exactly
 * what the fictitious ALM already answers.
 *
 * `mes` in the returned rows matches almSim()'s own labeling for the
 * corresponding calendar year (Año 1: -12..-1, Año 2: 0..11), so a real
 * and fictitious ladder for the same year line up month-for-month when
 * shown side by side.
 */
export function almSimRealYear(
  year: 1 | 2,
  claimsSchedule12: number[],
  decision: PortfolioDecisionV3,
  aporteMensual: number,
  initialState?: AlmYearState
): AlmRealYearResult | null {
  if (year === 2 && !initialState) {
    throw new Error("almSimRealYear(2, ...) requires Año 1's finalState — Año 2 is a continuation, not a fresh run.");
  }
  const totalTopW = decision.tranches.reduce((s, t) => (INSTRUMENT_BY_ID[t.instrumentId] ? s + Math.max(0, t.weight) : s), 0);
  if (totalTopW <= 0) return null;

  const state: AlmYearState = initialState
    ? {
        positions: initialState.positions.map((p) => ({ ...p })),
        capitalComprometidoAcumulado: initialState.capitalComprometidoAcumulado,
        cajaFloat: initialState.cajaFloat,
      }
    : { positions: [], capitalComprometidoAcumulado: 0, cajaFloat: 0 };
  const acc = freshAccumulators();

  const startMonth = year === 1 ? 0 : BUILD_MONTHS;
  const fase: "a1" | "post" = year === 1 ? "a1" : "post";
  const rows: AlmSimRow[] = [];
  let income = 0;
  let sumPV = 0;
  let sumVolWeighted = 0;

  for (let i = 0; i < 12; i++) {
    const t = startMonth + i;
    const mesLabel = year === 1 ? i - BUILD_MONTHS : i;
    const pagoSiniestros = claimsSchedule12[i] || 0;
    const { row, devengo, realBookSum, volWeightedBookSum } = stepMonth(t, mesLabel, fase, aporteMensual, pagoSiniestros, decision, state, acc);
    rows.push(row);
    income += devengo;
    sumPV += realBookSum;
    sumVolWeighted += volWeightedBookSum;
  }

  return {
    rows,
    portYield: portfolioNominalYield(decision.tranches),
    concentrationRatio: portfolioConcentrationRatio(decision.tranches),
    income,
    // sumPV is already accumulated per-month for avgVol above — reuse it
    // here as the average invested book balance (sumPV / 12 months).
    effectiveYield: sumPV > 0 ? income / (sumPV / 12) : 0,
    avgVol: sumPV > 0 ? sumVolWeighted / sumPV : 0,
    capitalComprometidoAcumulado: state.capitalComprometidoAcumulado,
    capitalSocialRestante: CAPITAL_SOCIAL - state.capitalComprometidoAcumulado,
    totalVentaForzada: acc.totalVentaForzada,
    mesesConVentaForzada: acc.mesesConVentaForzada,
    peakCapitalComprometido: acc.peakCapitalComprometido,
    finalState: state,
  };
}

/**
 * Composite ALM score: 35% Caja Mínima compliance, 35% risk-adjusted
 * reinvestment yield, 20% forced-liquidation penalty, 10% short-term
 * liquidity coverage.
 *
 * cumplimientoCaja no longer measures "was there an unmet shortfall" — Caja
 * Mínima is always met now, however deep the model has to reach to do it
 * (see almSim's step 4). Instead it measures how much of the team's fixed
 * Capital Social had to be committed to get there: the worst single
 * month's draw (tail risk) blended 50/50 with the cumulative draw across
 * the whole horizon (chronic erosion), both expressed as a fraction of
 * CAPITAL_SOCIAL (W_CAP_PEAK/W_CAP_AVG) — a team that never had to touch
 * its own capital scores 100 here regardless of how it got there; one that
 * ends the horizon with negative patrimonioDisponible scores 0.
 *
 * rendimiento is risk-adjusted, not raw yield: it normalizes
 * riskAdjustedYield (effYield discounted by both realized volatility and
 * portfolio concentration, see RISK_ADJUSTED_YIELD_MIN/MAX,
 * VOL_PENALTY_LAMBDA and CONCENTRATION_PENALTY_MU in constants.ts) instead
 * of effYield directly — an "efficient frontier" trade-off where chasing
 * ACC's raw yield without regard for its volatility scores worse than a
 * portfolio that also leans on TESUVR8, the menu's best risk-adjusted
 * instrument by design. The concentration discount (see
 * portfolioConcentrationRatio()) means this isn't beaten by parking
 * everything in that single best instrument either — a genuinely
 * concentrated bet pays a discount here even when the instrument itself is
 * a safe one, the same way Día 4's solvency capital charges a
 * concentration risk independent of volatility (see rConcentracion in
 * finBench.ts) — a team that understands why its Día 2 nota was discounted
 * is exactly the team that reproduces the higher RK correctly on Día 4.
 *
 * ventaForzada penalizes being forced to sell portfolio holdings early to
 * cover a Caja Mínima shortfall LIQ alone couldn't meet — and does so with
 * a hierarchy, not a flat penalty: the severity is the forced-sale amount
 * weighted by *what* got sold (ventaForzadaVolWeighted), so a team forced
 * to dump ACC under duress is graded far worse than one that only had to
 * tap a CDT90 early, even for the same dollar amount — being forced to
 * liquidate LIQ doesn't count against this at all, since drawing LIQ down
 * is exactly what it's there for (see drawFromLiq/forceLiquidatePortfolio).
 */
export function scoreFinanciero(lib: LiabilitySchedule, decision: PortfolioDecisionV3, aporteMensualReal?: number): FinancialScore | null {
  const sim = almSim(lib, decision, aporteMensualReal);
  if (!sim) return null;
  const {
    reserva,
    peakCapitalComprometido,
    totalCapitalComprometido,
    capitalComprometidoY1,
    capitalComprometidoY2,
    incomeY1,
    incomeY2,
    sumCajaMinima,
    liab6,
    liq6,
    avgVol,
    totalVentaForzada,
    ventaForzadaVolWeighted,
  } = sim;

  const peakCapitalComprometidoRatio = Math.min(1, peakCapitalComprometido / CAPITAL_SOCIAL);
  const avgCapitalComprometidoRatio = Math.min(1, totalCapitalComprometido / CAPITAL_SOCIAL);
  const cumplimientoCaja = Math.max(
    0,
    100 * (1 - W_CAP_PEAK * peakCapitalComprometidoRatio - W_CAP_AVG * avgCapitalComprometidoRatio)
  );
  const patrimonioDisponible = CAPITAL_SOCIAL - totalCapitalComprometido;

  const effYield = sim.effYield;
  const concentrationRatio = portfolioConcentrationRatio(decision.tranches);
  const riskAdjustedYield = effYield - VOL_PENALTY_LAMBDA * avgVol - CONCENTRATION_PENALTY_MU * concentrationRatio;
  const rendimiento = Math.max(
    0,
    Math.min(100, (100 * (riskAdjustedYield - RISK_ADJUSTED_YIELD_MIN)) / (RISK_ADJUSTED_YIELD_MAX - RISK_ADJUSTED_YIELD_MIN))
  );

  const ventaForzadaSeveridad = sumCajaMinima > 0 ? Math.min(1, ventaForzadaVolWeighted / (sumCajaMinima * VOL_MAX)) : 0;
  const ventaForzada = 100 * (1 - ventaForzadaSeveridad);

  const portYield = portfolioNominalYield(decision.tranches);
  const liquidez = liab6 > 0 ? 100 * Math.min(1, liq6 / liab6) : 100;
  const nota = W_CUMPL_CAJA * cumplimientoCaja + W_REND * rendimiento + W_VENTA_FORZADA * ventaForzada + W_LIQ * liquidez;

  const cobertura = liab6 > 0 ? liq6 / liab6 : 1;

  return {
    cumplimientoCaja,
    rendimiento,
    ventaForzada,
    liquidez,
    nota,
    portYield,
    effYield,
    reserva,
    peakCapitalComprometidoRatio,
    avgCapitalComprometidoRatio,
    incomeY1,
    incomeY2,
    liq6,
    liab6,
    cobertura,
    avgPV: sim.avgPV,
    totIncome: sim.totIncome,
    tranches: decision.tranches,
    avgVol,
    concentrationRatio,
    riskAdjustedYield,
    totalVentaForzada,
    ventaForzadaSeveridad,
    capitalComprometidoY1,
    capitalComprometidoY2,
    patrimonioDisponible,
  };
}

/**
 * Reference "target" portfolio: cashflow immunization, covering each
 * liability payment with the longest-maturity instrument that still matures
 * in time (excludes equities, which have no defined maturity). Each rung of
 * the ladder reinvests into itself on maturity — a genuinely
 * dedicated/immunized ladder doesn't need a different policy after it
 * matures, it just keeps laddering. Ported from almObjetivo(), line ~1781.
 */
export function almObjetivo(lib: LiabilitySchedule): FinancialScore | null {
  if (!lib.hay) return null;
  const ladder = INSTRUMENTS.filter((i) => i.plazoM < 400);
  const acc: Record<string, number> = {};
  let tot = 0;
  for (let t = 0; t < lib.L.length; t++) {
    const v = lib.L[t];
    if (v <= 0) continue;
    tot += v;
    let best = ladder[0];
    for (const i of ladder) if (i.plazoM <= t && i.plazoM >= best.plazoM) best = i;
    acc[best.id] = (acc[best.id] || 0) + v;
  }
  if (tot <= 0) return null;

  const tranches: Tranche[] = Object.keys(acc).map((id) => {
    const ins = INSTRUMENT_BY_ID[id];
    const t: Tranche = { instrumentId: id, weight: (100 * acc[id]) / tot, onMaturity: { action: "repeat" } };
    // LIQ can legitimately be `best` for liabilities due in months 0-2
    // (plazoM=0 qualifies for any t>=0, no bond qualifies until t>=3). Its
    // durationM is immaterial to cash availability (LIQ stays pooled
    // regardless — see almSim's doc comment); 1 is the simplest valid value.
    if (!isBondLike(ins)) t.durationM = 1;
    return t;
  });
  return scoreFinanciero(lib, { tranches });
}

/** Monthly ladder view (Caja Inicial/Prima/Siniestros/Gastos/Vencimientos en caja/Inversión Neta/Caja Final), ported from almLadder(), line ~1809. */
export function almLadder(
  lib: LiabilitySchedule,
  decision: PortfolioDecisionV3,
  aporteMensualReal?: number
): { rows: AlmSimRow[]; peakCapitalComprometido: number; totalCapitalComprometido: number; reserva: number } | null {
  const sim = almSim(lib, decision, aporteMensualReal);
  if (!sim) return null;
  const rows = sim.rows.filter(
    (r) =>
      r.mes < 0 ||
      r.pagoSiniestros > 0 ||
      r.mes === 0 ||
      r.ventaForzadaPortafolio > 0 ||
      r.capitalComprometidoPortafolio > 0 ||
      r.mes === HORIZON - 1 // always show the last month of the horizon, even if nothing else about it would otherwise qualify — the table should visibly reach the end, not appear to cut off early
  );
  return { rows, peakCapitalComprometido: sim.peakCapitalComprometido, totalCapitalComprometido: sim.totalCapitalComprometido, reserva: sim.reserva };
}

/** PV of a liability cashflow schedule L[t] (months) at a discount rate. Ported from pvReserva(), line ~1817. */
export function pvReserva(L: number[], rate: number): number {
  let pv = 0;
  for (let t = 0; t < L.length; t++) {
    if (L[t] > 0) pv += L[t] / Math.pow(1 + rate, t / 12);
  }
  return pv;
}

/**
 * PV of a portfolio: bonds valued at market rate off their single maturity
 * cashflow, cash at par (duration 0), equities at book (no defined
 * duration). Uses a single allocation — this represents the balance sheet
 * at the valuation date, before any reinvestment cycle has occurred.
 * Ported from pvPortafolio(), line ~1824.
 */
export function pvPortafolio(alloc: Allocation, reserva: number, rate: number): number {
  const ids = Object.keys(alloc).filter((id) => INSTRUMENT_BY_ID[id]);
  const sumW = ids.reduce((s, id) => s + (Number(alloc[id]) || 0), 0);
  if (sumW <= 0) return 0;
  let pv = 0;
  for (const id of ids) {
    const ins = INSTRUMENT_BY_ID[id];
    const amt = (Number(alloc[id]) / sumW) * reserva;
    if (ins.plazoM === 0) pv += amt;
    else if (ins.plazoM >= 400) pv += amt;
    else {
      const faceVal = amt * Math.pow(1 + ins.yield, ins.plazoM / 12);
      pv += faceVal / Math.pow(1 + rate, ins.plazoM / 12);
    }
  }
  return pv;
}

export interface AlmNavScenario {
  portMercado: number;
  resMercado: number;
  nav: number;
}

export interface AlmNavResult {
  base: AlmNavScenario;
  alza: AlmNavScenario;
  baja: AlmNavScenario;
  riesgoTasa: number;
}

/**
 * NAV (assets - liabilities at market value) under base/up/down rate
 * scenarios — a diagnostic of interest-rate sensitivity, informational
 * only (not currently read by finBench()'s solvency capital, which instead
 * charges financial risk off realized portfolio *volatility*, see rFin).
 * Uses a single allocation (the balance-sheet snapshot at the valuation
 * date). Ported from almNAV(), line ~1837.
 */
export function almNAV(lib: LiabilitySchedule, allocInitial: Allocation): AlmNavResult | null {
  if (!lib.hay || !allocInitial) return null;
  const reserva = lib.reserva;
  const compute = (rate: number): AlmNavScenario => {
    const portMercado = pvPortafolio(allocInitial, reserva, rate);
    const resMercado = pvReserva(lib.L, rate);
    return { portMercado, resMercado, nav: portMercado - resMercado };
  };
  const base = compute(ALM_TASA_BASE);
  const alza = compute(ALM_TASA_ALZA);
  const baja = compute(ALM_TASA_BAJA);
  const riesgoTasa = -Math.min(alza.nav - base.nav, baja.nav - base.nav);
  return { base, alza, baja, riesgoTasa };
}
