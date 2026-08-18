import { BUILD_MONTHS, HORIZON } from "../reserving/constants";
import type { LiabilitySchedule } from "../reserving/liability";
import { INSTRUMENTS, INSTRUMENT_BY_ID, VOL_MAX, instrumentDurationM, isCouponBond, displayYield } from "./instruments";
import type { Allocation, Instrument, MonthlyAllocationEntry, PortfolioDecisionV4 } from "./instruments";
import { FZ, GASTOS_TOTAL_PCT, VOL_PENALTY_LAMBDA, CONCENTRATION_PENALTY_MU, CAPITAL_SOCIAL } from "./constants";
import { COVARIANCE_MATRIX, portfolioVariance } from "./markowitz";

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
 * λ×avgPortfolioVol - μ×concentrationRatio`, same formula as below, just
 * measured instead of assumed — avgPortfolioVol, not the naive avgVol, see
 * its own doc comment) of a reference portfolio run through
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
 *   Unaffected by switching avgVol → avgPortfolioVol: a single-instrument
 *   portfolio has nothing to correlate against, so the two are identical
 *   here.
 * - MAX ≈ 0.079: 40% CDT90 / 10% TES3 / 50% TESUVR8, each "repeat" forever.
 *   Moved twice since this constant was first introduced. First, off the
 *   original 25%/25%/25%/25% split, when `forceLiquidatePortfolio()` started
 *   charging a price haircut on early sales (see `ventaForzadaHaircut()`):
 *   under this fixture's cash-flow timing, TES3/TESUVR8 got force-sold early
 *   often enough that a *linear* volatility term in the haircut left
 *   CDT90/TES1 (short duration, low haircut exposure) winning instead — MAX
 *   briefly sat at ≈0.078, an even 50%/50% CDT90/TES1 split. Then, once the
 *   volatility term was cubed instead of linear (see `ventaForzadaHaircut()`'s
 *   own doc comment — needed to keep 100% TESUVR8 beating 100% ACC on
 *   riskAdjustedYield once `VENTA_FORZADA_HAIRCUT_MAX` reached 0.10), that
 *   same cubing sharply discounts CDT90/TES1's own small haircut exposure
 *   too, and long-dated TES3/TESUVR8 become genuinely worth diversifying
 *   into again — MAX moved back up to include them. Confirmed against a
 *   full grid search over the 5-instrument simplex
 *   (LIQ/CDT90/TES1/TES3/TESUVR8, ACC still excluded — its volatility still
 *   never pays for itself even diluted, cubing doesn't change that since its
 *   own vol-ratio term is already 1, the max possible), which found no blend
 *   beating this reference by more than the grid's own discretization slack.
 *
 * Recompute both (same harness: run a reference allocation through
 * `scoreFinanciero()`, read off `riskAdjustedYield`) if the instrument
 * menu, `VOL_PENALTY_LAMBDA`, `CONCENTRATION_PENALTY_MU`, `VENTA_FORZADA_HAIRCUT_MAX`,
 * the haircut's own volatility exponent, `COVARIANCE_MATRIX`, or the accrual
 * mechanic ever change — and re-verify the ACC-vs-TESUVR8 riskAdjustedYield
 * ordering in alm.test.ts at the same time (see `ventaForzadaHaircut()`'s
 * doc comment for why that ordering isn't automatic).
 */
export const RISK_ADJUSTED_YIELD_MIN = 0.046;
export const RISK_ADJUSTED_YIELD_MAX = 0.079;

/** cumplimientoCaja blends the single worst month's capital draw (tail risk) with the cumulative capital committed across the whole horizon (chronic mismatch) — see scoreFinanciero(). */
export const W_CAP_PEAK = 0.5;
export const W_CAP_AVG = 0.5;

/** Rate shocks (+20%/-15% relative to base), ported from ALM_TASA_* line ~1804. */
export const ALM_TASA_BASE = 0.1;
export const ALM_TASA_ALZA = 0.1 * 1.2;
export const ALM_TASA_BAJA = 0.1 * 0.85;

/**
 * Nominal discount curve for Día 4's riesgo de tasa/riesgo de inflación
 * exercise (see computeMarketRiskAtAño2End below) — a genuinely separate
 * mechanic from ALM_TASA_BASE/ALZA/BAJA above (which stays exactly as-is,
 * still driving the Día 2 almNAV() diagnostic, a single flat rate). This
 * one is a real curve, not a flat rate: built directly from the menu's own
 * nominal bond yields (INSTRUMENT_BY_ID) at their own tenors — CDT90 (3m),
 * TES1 (12m), TES3 (36m) — the same numbers already shown to teams in the
 * instrument menu, not a separately-calibrated level. Piecewise-linear
 * between consecutive points, flat-extrapolated outside [3, 36] months.
 * Every nominal cashflow this exercise ever needs to discount (post-Año-2
 * liability payments, or a nominal bond position's remaining term) falls
 * inside or only slightly past that range, since a position's remaining
 * term never exceeds its own instrument's plazoM.
 */
const NOMINAL_CURVE_POINTS: { months: number; rate: number }[] = [
  { months: INSTRUMENT_BY_ID.CDT90.plazoM, rate: INSTRUMENT_BY_ID.CDT90.yield },
  { months: INSTRUMENT_BY_ID.TES1.plazoM, rate: INSTRUMENT_BY_ID.TES1.yield },
  { months: INSTRUMENT_BY_ID.TES3.plazoM, rate: INSTRUMENT_BY_ID.TES3.yield },
];

function interpolateCurve(points: { months: number; rate: number }[], months: number): number {
  if (months <= points[0].months) return points[0].rate;
  const last = points[points.length - 1];
  if (months >= last.months) return last.rate;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (months >= a.months && months <= b.months) {
      const t = (months - a.months) / (b.months - a.months);
      return a.rate + t * (b.rate - a.rate);
    }
  }
  return last.rate;
}

/** Nominal rate for a given remaining term (months), read off NOMINAL_CURVE_POINTS. */
function nominalCurveRate(months: number): number {
  return interpolateCurve(NOMINAL_CURVE_POINTS, months);
}

/**
 * Implied inflation: the menu has only one genuinely inflation-linked
 * instrument (TESUVR8), so it can't define a real curve *shape* on its
 * own — only a single anchor point, at its own 96-month tenor
 * (displayYield() already computes exactly this: TESUVR8's real return,
 * the same number already shown to teams as "Inflación + X%" in the
 * instrument menu). Solved via Fisher at that one point —
 * `(1+nominal)=(1+real)×(1+inflación)` — and then held constant across
 * every tenor, the same simplification this engine already makes
 * everywhere else it needs a single inflation number (GENERAL_INFLATION_ANNUAL
 * is likewise one flat rate, never a curve). This is deliberately
 * multiplicative throughout, matching displayYield()'s own Fisher
 * decomposition — an earlier version of this constant subtracted an
 * additive spread from the nominal curve instead, which is NOT the same
 * relationship: `(1+nominal)/(1+real)-1` isn't `nominal-real`, and the two
 * only agree at the one calibration point.
 */
const IMPLIED_INFLATION = (1 + nominalCurveRate(INSTRUMENT_BY_ID.TESUVR8.plazoM)) / (1 + displayYield(INSTRUMENT_BY_ID.TESUVR8)) - 1;

/** Real rate for a given remaining term (months) — the nominal curve at that same term, deflated by the constant IMPLIED_INFLATION via Fisher. */
function realCurveRate(months: number): number {
  return (1 + nominalCurveRate(months)) / (1 + IMPLIED_INFLATION) - 1;
}

export interface AlmSimRow {
  mes: number;
  cajaInicial: number;
  primaCobrada: number;
  pagoSiniestros: number;
  gastos: number;
  /** Proceeds this month from every position that matured, of any instrument, PLUS any coupon paid this month by an open (non-maturing) TES3/TESUVR8 position (see isCouponBond() in instruments.ts) — folded into availability before Inversión Neta is computed. There's no per-position "keep as cash" choice: maturity always releases cash here, and whichever monthly checkpoint is active decides where the resulting surplus, if any, gets reinvested (see activeAllocation()). */
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
  /** Yield/growth accrued this month across all open positions (step 1 of the simulation), including any TES3/TESUVR8 coupon paid this month — the only way saldoFinalPortafolio can grow without fresh Inversión Neta. */
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
  /** Book-value-weighted average of each held instrument's OWN volAnual over the whole horizon — blind to how those instruments move together (two instruments with the same volAnual contribute the same here whether they're perfectly correlated or not). Diagnostic only since avgPortfolioVol replaced it in the "Rendimiento" sub-score below — see avgPortfolioVol's own doc comment for why. */
  avgVol: number;
  /** True book-value-weighted average PORTFOLIO volatility over the whole horizon — sqrt(wᵀΣw) each month against COVARIANCE_MATRIX (markowitz.ts), genuinely crediting diversification into imperfectly-correlated instruments the way avgVol never could. Feeds the risk-adjusted "Rendimiento" sub-score (see scoreFinanciero()). Equal to avgVol whenever a team stays in a single instrument the whole horizon (no correlation to exploit); strictly lower than avgVol for any genuinely mixed portfolio. */
  avgPortfolioVol: number;
  /** Sum of every month's forced-sale amount across the horizon — see ventaForzadaPortafolio on AlmSimRow. */
  totalVentaForzada: number;
  /** Σ (forced-sale amount × that instrument's volAnual) across the horizon — the raw severity accumulator behind scoreFinanciero()'s ventaForzada sub-score: selling the same dollar amount of ACC contributes far more here than selling CDT90. */
  ventaForzadaVolWeighted: number;
  /** Σ every month's ventaForzadaHaircut() loss (book value given up beyond the cash actually raised) across the horizon — already folded into totIncome/incomeY1/incomeY2 via devengo (see stepMonth), exposed separately as a diagnostic so evaluators can see how much of a team's Rendimiento hit came specifically from selling early rather than from the underlying instrument's own return. 0 for a team that never needed a forced sale. */
  totalVentaForzadaPerdida: number;
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

export interface Position {
  instrumentId: string;
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
  /** Sum of every month's ventaForzadaLostValue — see forceLiquidatePortfolio()'s lostValue and stepMonth()'s devengo. */
  totalVentaForzadaPerdida: number;
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
    totalVentaForzadaPerdida: 0,
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
  /** This month's realBookSum × its true covariance-based portfolio volatility (see portfolioVolThisMonth() below) — feeds avgPortfolioVol the same way volWeightedBookSum feeds avgVol. */
  portfolioVolWeightedBookSum: number;
}

/**
 * True portfolio volatility for whatever's actually held this month —
 * sqrt(wᵀΣw) over the same COVARIANCE_MATRIX teams see in the Día 2 guide
 * (§5.2) and use for Día 1's min-variance exercise (markowitz.ts), built
 * from each open position's own book value (grouped by instrument;
 * portfolioVariance() normalizes the weights itself). Unlike avgVol (a
 * book-weighted average of each instrument's OWN volAnual, blind to how
 * those instruments move together), this genuinely rewards diversifying
 * into imperfectly-correlated instruments — two positions with the same
 * combined volAnual can have very different true portfolio risk depending
 * on their correlation, and only this measure can tell the difference.
 */
function portfolioVolThisMonth(positions: Position[]): number {
  const bookByInstrument: Record<string, number> = {};
  for (const p of positions) bookByInstrument[p.instrumentId] = (bookByInstrument[p.instrumentId] || 0) + p.book;
  return Math.sqrt(Math.max(0, portfolioVariance(bookByInstrument, COVARIANCE_MATRIX)));
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
 *
 * `scheduleMonth` is separate from `t`: it's the month passed to
 * activeAllocation() to pick which checkpoint governs THIS month's fresh
 * surplus. almSim always passes scheduleMonth===t (one continuous 60-month
 * clock). almSimRealYear passes scheduleMonth=i (0..11, relative to
 * whichever year is currently funding itself) for BOTH years — so Año 2's
 * real premium reads the same schedule the same way Año 1's did, restarted
 * at its own month 0, decoupled from whatever checkpoint an absolute month
 * >11 happens to hold (that one instead keeps governing the *continuing*
 * position ledger's own reinvestment — Año 1's still-open positions and any
 * Capital Social they carry don't reset just because `scheduleMonth` did).
 * `t` itself is untouched by this — positions/maturities/capital
 * comprometido keep accruing on the one real absolute calendar.
 */
function stepMonth(
  t: number,
  scheduleMonth: number,
  mesLabel: number,
  fase: "a1" | "post",
  primaCobrada: number,
  pagoSiniestros: number,
  decision: PortfolioDecisionV4,
  state: AlmYearState,
  acc: MonthAccumulators
): StepResult {
  const saldoInicialPortafolio = state.positions.reduce((s, p) => s + p.book, 0) - state.capitalComprometidoAcumulado;

  // 1. Route this month's maturities, and pay any periodic coupon due this
  //    month on positions that AREN'T maturing (coupon-bearing instruments
  //    only — TES3/TESUVR8, see isCouponBond() in instruments.ts). Runs
  //    before accrual (below) — a maturing position pays out its book value
  //    as of last month's close, without earning further on its own
  //    maturity month. There's no per-position onMaturity choice: every
  //    position's principal becomes available cash here, unconditionally,
  //    regardless of instrument — where it goes next is entirely up to
  //    whichever checkpoint is active this month (see step 3 below), same
  //    as any other month's surplus. A coupon bond's own coupon is genuine
  //    investment return (folded into devengo in step 4 below via
  //    cuponDevengo), not another maturity — it doesn't remove or resize
  //    the position beyond paying out the coupon itself; the position's
  //    book stays flat at its funded principal for its whole life (step 4
  //    skips monthly compounding for coupon-bond positions entirely, since
  //    their yield is realized purely through these coupons instead).
  const remaining: Position[] = [];
  const maturingNow: Position[] = [];
  for (const p of state.positions) (p.matM === t ? maturingNow : remaining).push(p);

  let vencCash = 0;
  let cuponDevengo = 0;
  for (const p of maturingNow) {
    const ins = INSTRUMENT_BY_ID[p.instrumentId];
    // A coupon bond's final coupon (its last held year) is bundled with its
    // principal at maturity — the periodic-coupon loop below only ever
    // fires on a position that ISN'T maturing this month.
    const finalCoupon = ins && isCouponBond(ins) ? p.book * ins.yield : 0;
    vencCash += p.book + finalCoupon;
    cuponDevengo += finalCoupon;
  }
  for (const p of remaining) {
    const ins = INSTRUMENT_BY_ID[p.instrumentId];
    if (!ins || !isCouponBond(ins)) continue;
    const fundedMonth = p.matM - ins.plazoM;
    const monthsHeld = t - fundedMonth;
    if (monthsHeld > 0 && monthsHeld % 12 === 0) {
      const coupon = p.book * ins.yield;
      vencCash += coupon;
      cuponDevengo += coupon;
    }
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
  let ventaForzadaLostValue = 0;
  if (neededNeta <= 0) {
    const surplus = -neededNeta;
    fundFromAllocation(activeAllocation(decision.schedule, scheduleMonth), surplus, t, state.positions);
    inversionNeta = neededNeta;
    cajaFinal = cajaMinima;
  } else {
    const liqDrawn = drawFromLiq(neededNeta, state.positions);
    const afterLiq = neededNeta - liqDrawn;
    const { sold, volWeighted, lostValue } = forceLiquidatePortfolio(afterLiq, state.positions, t);
    ventaForzada = sold;
    capitalComprometido = afterLiq - sold;
    inversionNeta = liqDrawn + sold + capitalComprometido;
    cajaFinal = cajaMinima;
    ventaForzadaLostValue = lostValue;
    if (ventaForzada > 0) {
      acc.totalVentaForzada += ventaForzada;
      acc.ventaForzadaVolWeighted += volWeighted;
      acc.mesesConVentaForzada++;
    }
    if (lostValue > 0) {
      acc.totalVentaForzadaPerdida += lostValue;
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
  //
  //    Coupon-bond positions (TES3/TESUVR8) are skipped here entirely —
  //    their book never compounds month to month, since their full yield is
  //    already realized via the periodic/final coupons paid in step 1
  //    (folded into devengo via cuponDevengo, seeded below). Every other
  //    instrument keeps compounding monthly exactly as before.
  //
  //    ventaForzadaLostValue (step 3, 0 whenever nothing was force-sold this
  //    month) is subtracted here rather than left out of devengo entirely —
  //    it's a real realized loss on the portfolio, not just a cash-flow
  //    accounting gap, so it belongs in the same accrual line that
  //    ultimately feeds effYield/Rendimiento and, for the real ALM, the
  //    P&G's own Resultado de Inversiones. See forceLiquidatePortfolio()'s
  //    doc comment for why this is separate from the ventaForzada score.
  let devengo = cuponDevengo - ventaForzadaLostValue;
  for (const p of state.positions) {
    if (p.matM > t) {
      const ins = INSTRUMENT_BY_ID[p.instrumentId];
      if (ins && isCouponBond(ins)) continue;
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
  const volWeightedBookSum = state.positions.reduce((s, p) => s + p.book * INSTRUMENT_BY_ID[p.instrumentId].volAnual, 0);
  const portfolioVolWeightedBookSum = portfolioVolThisMonth(state.positions) * realBookSum;
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

  return { row, devengo, realBookSum, volWeightedBookSum, portfolioVolWeightedBookSum };
}

/**
 * Splits `monto` across `alloc` by weight and appends one new Position per
 * non-degenerate share into `positions`. Called every month with whatever
 * checkpoint is currently active (see activeAllocation()) to fund that
 * month's surplus — the active allocation isn't a one-time lump, it's a
 * reusable policy applied to every month's surplus until the next
 * checkpoint overrides it. Purely iterative — never calls itself or
 * almSim — so a schedule that keeps reusing the same checkpoint across many
 * months never grows the call stack; see the module doc comment above
 * almSim.
 */
function fundFromAllocation(alloc: Allocation, monto: number, atMonth: number, positions: Position[]): void {
  if (monto <= 0) return;
  const ids = Object.keys(alloc).filter((id) => INSTRUMENT_BY_ID[id] && (Number(alloc[id]) || 0) > 0);
  const totalW = ids.reduce((s, id) => s + Number(alloc[id]), 0);
  if (totalW <= 0) return;
  for (const id of ids) {
    const w = Number(alloc[id]);
    const parte = (w / totalW) * monto;
    if (parte <= 0) continue;
    const ins = INSTRUMENT_BY_ID[id];
    const yM = Math.pow(1 + ins.yield, 1 / 12) - 1;
    const dur = Math.max(1, instrumentDurationM(ins));
    positions.push({ instrumentId: id, book: parte, yM, matM: atMonth + dur });
  }
}

/**
 * The allocation in effect for month `t`: whichever checkpoint in `schedule`
 * has the largest `month <= t` — schedule is assumed sorted ascending with a
 * mandatory month-0 entry (see isPortfolioDecisionV4 in instruments.ts), so
 * this always resolves to something.
 */
function activeAllocation(schedule: MonthlyAllocationEntry[], t: number): Allocation {
  let active = schedule[0].allocation;
  for (const entry of schedule) {
    if (entry.month <= t) active = entry.allocation;
    else break;
  }
  return active;
}

/**
 * Draws up to `neededNeta` out of whatever LIQ positions currently have
 * money, mutating their book values in place — a LIQ position stays part
 * of the always-drawable pool regardless of where it is in its own
 * 1-month maturity countdown (see instrumentDurationM() in instruments.ts;
 * this isn't a liquidity lock, just when its principal automatically rolls
 * back into the investable pool). Returns the amount actually drawn.
 */
function drawFromLiq(neededNeta: number, positions: Position[]): number {
  let remaining = neededNeta;
  for (const p of positions) {
    if (remaining <= 0) break;
    if (p.instrumentId !== "LIQ") continue;
    const take = Math.min(p.book, remaining);
    p.book -= take;
    remaining -= take;
  }
  return neededNeta - remaining;
}

/**
 * Ceiling on ventaForzadaHaircut()'s price discount — reached only by
 * force-selling the menu's most volatile instrument (ACC) with its entire
 * term still ahead of it. See ventaForzadaHaircut() for how it scales down
 * from there.
 */
const VENTA_FORZADA_HAIRCUT_MAX = 0.10;

/**
 * Price discount applied when position `p` gets force-sold at month `t`,
 * before its own maturity — selling early realizes less cash than the
 * position's book value, same as unwinding any real bond/equity position
 * ahead of schedule would. Scales with two things a team can actually see
 * coming: how volatile the instrument is, and how much of its own term is
 * still left to run ((p.matM − t) ÷ its duration — a position one month
 * from maturing anyway is barely early at all; one just funded pays close
 * to the full haircut). 0 for a position already at or past its own
 * maturity month; LIQ is never passed in here at all (see
 * forceLiquidatePortfolio's own filter — drawing it down is free).
 *
 * The volatility term is cubed, not linear: (ins.volAnual ÷ VOL_MAX) ** 3.
 * A coupon-paying, long-dated bond (TES3/TESUVR8) that gets force-sold
 * shortly after being funded pays close to the FULL time-remaining fraction
 * every single time — unlike a real bond, this engine funds a brand-new
 * position each month a checkpoint reinvests a surplus, so a thin-liquidity
 * cash-flow pattern can force-sell the same "just funded, 96 months left"
 * TESUVR8 position over and over, each one paying near-maximum haircut on
 * that axis alone. A linear volatility term left this structural
 * disadvantage under-compensated: at VENTA_FORZADA_HAIRCUT_MAX values
 * competitive with what's needed for the haircut to matter economically,
 * TESUVR8 (volAnual 0.06) started losing to ACC (volAnual 0.2, but far less
 * exposed to this churn pattern — see ACC_ROLL_M) on riskAdjustedYield,
 * inverting the instrument menu's own deliberate calibration (see
 * instruments.ts's top doc comment: "TESUVR8 is deliberately the best
 * risk-adjusted choice of the whole menu"). Cubing the volatility ratio
 * fixes this without touching the time-remaining term at all: ACC's ratio
 * is already 1 (the menu's max), so cubing leaves its own haircut
 * unchanged, while every lower-volatility instrument's contribution shrinks
 * much faster than the churn penalty grows — re-verify both this ordering
 * (alm.test.ts) and RISK_ADJUSTED_YIELD_MIN/MAX (their own doc comment)
 * together if VENTA_FORZADA_HAIRCUT_MAX or this exponent ever change again.
 */
function ventaForzadaHaircut(p: Position, ins: Instrument, t: number): number {
  const dur = Math.max(1, instrumentDurationM(ins));
  const remainingFraction = Math.max(0, Math.min(1, (p.matM - t) / dur));
  return VENTA_FORZADA_HAIRCUT_MAX * (ins.volAnual / VOL_MAX) ** 3 * remainingFraction;
}

/**
 * Forced liquidation: when LIQ alone can't cover a Caja Mínima shortfall,
 * the team must sell *something else* early — the engine can't just leave
 * the gap unmet while sitting on an untouched bond/equity portfolio. Sells
 * non-LIQ positions in ascending volAnual order (safest/least-volatile
 * first, ACC only as a last resort), so a team that kept some low-vol
 * ladder around gets tapped there before anything touches its equities.
 *
 * Selling early raises less cash per peso of book value than a natural
 * maturity payout would — see ventaForzadaHaircut() — so covering a given
 * cash shortfall consumes MORE book value than the cash it actually raises;
 * `remaining` (the cash still needed) is what this function solves for at
 * each position, so `bookSold` is sized up accordingly. The gap between
 * book given up and cash received (lostValue) is a genuine realized loss —
 * the caller (stepMonth) folds it into that month's devengo, so it drags
 * down effYield/Rendimiento the same way any other bad investment outcome
 * would, on top of (not instead of) the separate ventaForzada score below,
 * which still grades on cash actually raised (sold/volWeighted, both
 * unaffected in size by the haircut whenever there's enough book to sell —
 * only lostValue changes).
 *
 * Returns { sold, volWeighted, lostValue }: sold = total cash actually
 * raised; volWeighted = Σ cashRaised_i × volAnual_i (sizes the ventaForzada
 * score's severity, exactly as before this haircut existed); lostValue =
 * Σ (bookSold_i − cashRaised_i), the raw $ destroyed by selling before
 * maturity rather than holding to it.
 */
function forceLiquidatePortfolio(neededNeta: number, positions: Position[], t: number): { sold: number; volWeighted: number; lostValue: number } {
  let remaining = neededNeta;
  let sold = 0;
  let volWeighted = 0;
  let lostValue = 0;
  if (remaining <= 0) return { sold, volWeighted, lostValue };
  const sellable = positions
    .filter((p) => p.instrumentId !== "LIQ" && p.book > 0)
    .sort((a, b) => INSTRUMENT_BY_ID[a.instrumentId].volAnual - INSTRUMENT_BY_ID[b.instrumentId].volAnual);
  for (const p of sellable) {
    if (remaining <= 0) break;
    const ins = INSTRUMENT_BY_ID[p.instrumentId];
    const cashPerBook = 1 - ventaForzadaHaircut(p, ins, t);
    const bookSold = Math.min(p.book, remaining / cashPerBook);
    const cashRaised = bookSold * cashPerBook;
    p.book -= bookSold;
    remaining -= cashRaised;
    sold += cashRaised;
    volWeighted += cashRaised * ins.volAnual;
    lostValue += bookSold - cashRaised;
  }
  return { sold, volWeighted, lostValue };
}

/**
 * Month-by-month portfolio cashflow simulation, structured as a cashflow
 * statement (Caja Inicial / Prima Cobrada / Pago Siniestros / Gastos /
 * Vencimientos en caja / Inversión Neta / Caja Final) and checked against a
 * mandatory minimum-cash floor (Caja Mínima) each month.
 *
 * `decision.schedule` is a sparse, ascending list of monthly checkpoints
 * (see MonthlyAllocationEntry/PortfolioDecisionV4 in instruments.ts), not a
 * tree: each checkpoint is a flat {instrumentId: weight} allocation that
 * applies to every month's investable surplus (Prima Cobrada during the
 * build phase, or any later month's leftover after Caja Mínima is met, or
 * proceeds from anything that matured that month) from its own `month`
 * onward, until a later checkpoint overrides it — see activeAllocation().
 * A team decides the whole schedule once, up front, in a single sitting;
 * there is no live/staged simulation, `almSim` still runs the full horizon
 * in one deterministic pass, exactly as before.
 *
 * Every instrument has a maturity, but the team no longer chooses any of
 * them directly (see instrumentDurationM() in instruments.ts): bond-like
 * instruments (CDT90/TES1/TES3/TESUVR8) use their own fixed ins.plazoM; LIQ
 * rolls every month; ACC rolls every ACC_ROLL_M months. LIQ and ACC still
 * play different roles despite both lacking a real-world term:
 * - LIQ positions count toward the instantly-drawable pool for covering a
 *   Caja Mínima shortfall (drawFromLiq) REGARDLESS of their own 1-month
 *   maturity countdown — locking LIQ up would defeat its entire purpose as
 *   the always-liquid choice.
 * - ACC positions are genuinely illiquid until their own maturity, exactly
 *   like a bond.
 *
 * TES3 and TESUVR8 also pay an annual cash coupon along the way (see
 * isCouponBond() in instruments.ts and stepMonth()'s step 1) — their book
 * value stays flat at its funded principal for the position's whole life,
 * since their yield is realized entirely through these coupons instead of
 * monthly compounding. Every other instrument (LIQ/CDT90/TES1/ACC) still
 * compounds monthly and pays everything out as a single lump sum at
 * maturity, unchanged.
 *
 * The engine never sells a position early just because a checkpoint moved
 * money elsewhere — a positive Inversión Neta (a shortfall) can only draw
 * on LIQ, then force-sell the rest (see forceLiquidatePortfolio). A
 * shortfall caused by concentrating everything into illiquid, long-dated
 * instruments is exactly the failure being graded.
 *
 * Historical note: extends almSim() from the legacy prototype, line ~1659,
 * and this app's earlier `initial`/`reinvest` two-phase split, then a flat
 * per-instrument `maturityRules`, then a per-tranche decision tree with a
 * per-position onMaturity choice — this version replaces all of those with
 * a genuine monthly decision, the schedule of checkpoints above.
 */
export function almSim(lib: LiabilitySchedule, decision: PortfolioDecisionV4, aporteMensualReal?: number): AlmSimResult | null {
  if (!lib.hay) return null;
  const first = decision.schedule[0];
  const totalW0 = first
    ? Object.entries(first.allocation).reduce((s, [id, w]) => (INSTRUMENT_BY_ID[id] ? s + Math.max(0, Number(w) || 0) : s), 0)
    : 0;
  if (totalW0 <= 0) return null;

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
  let sumPortfolioVolWeighted = 0;
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

    const { row, devengo, realBookSum, volWeightedBookSum, portfolioVolWeightedBookSum } = stepMonth(
      t,
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
    sumPortfolioVolWeighted += portfolioVolWeightedBookSum;

    if (t === BUILD_MONTHS - 1) capitalComprometidoY1 = state.capitalComprometidoAcumulado;
    if (t === BUILD_MONTHS + 11) capitalComprometidoY2 = state.capitalComprometidoAcumulado;

    if (t === BUILD_MONTHS) {
      liq6 = state.positions.reduce((s, p) => {
        if (p.instrumentId === "LIQ") return s + p.book;
        if (p.matM > t && p.matM <= t + 6) return s + p.book;
        return s;
      }, 0);
    }
  }

  const { totalVentaForzada, ventaForzadaVolWeighted, totalVentaForzadaPerdida, mesesConVentaForzada, peakCapitalComprometido, totalCapitalComprometido, mesesConCapitalComprometido, peakOpenPositions } = acc;

  const avgPV = sumPV / TOTAL;
  const rMonthly = avgPV > 0 ? totIncome / (avgPV * TOTAL) : Math.pow(1 + INSTRUMENT_BY_ID.LIQ.yield, 1 / 12) - 1;
  const effYield = Math.pow(1 + rMonthly, 12) - 1;
  const avgVol = sumPV > 0 ? sumVolWeighted / sumPV : 0;
  const avgPortfolioVol = sumPV > 0 ? sumPortfolioVolWeighted / sumPV : 0;

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
    avgPortfolioVol,
    totalVentaForzada,
    ventaForzadaVolWeighted,
    totalVentaForzadaPerdida,
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
  schedule: MonthlyAllocationEntry[];
  /** Book-value-weighted average of each held instrument's OWN volAnual over the horizon — diagnostic only, blind to correlation. See AlmSimResult.avgVol and avgPortfolioVol below (which actually feeds the score). */
  avgVol: number;
  /** True book-value-weighted average PORTFOLIO volatility over the horizon (correlation-aware, via COVARIANCE_MATRIX) — see AlmSimResult.avgPortfolioVol. This, not avgVol, is what riskAdjustedYield below is discounted by. */
  avgPortfolioVol: number;
  /** Decision-only concentration ratio of the submitted tree — see portfolioConcentrationRatio(). */
  concentrationRatio: number;
  /** effYield - VOL_PENALTY_LAMBDA*avgPortfolioVol - CONCENTRATION_PENALTY_MU*concentrationRatio — the "Rendimiento" sub-score is normalized off this, not the raw effYield, so a high yield achieved through a volatile/correlated or concentrated portfolio scores worse than a similar yield achieved safely, diversified, and genuinely uncorrelated. */
  riskAdjustedYield: number;
  /** Raw $ forced-liquidated across the horizon (see AlmSimResult.totalVentaForzada) — 0 for a team that never needed to sell early. */
  totalVentaForzada: number;
  /** Raw $ destroyed by selling early rather than at maturity (see AlmSimResult.totalVentaForzadaPerdida) — already reflected in effYield/rendimiento via devengo, exposed separately as a diagnostic. 0 for a team that never needed to sell early. */
  totalVentaForzadaPerdida: number;
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
 * schedule's starting (month-0) allocation — the same shape
 * nominalPortfolioVolRatio() in capacity.ts uses for volatility, just for
 * yield instead. Never depends on funding size or claims, so it's identical
 * between the fictitious and real ALM for the same decision schedule. Only
 * looks at the month-0 checkpoint, same scope the old tree version only
 * ever gave its top-level tranches — later checkpoints aren't visited.
 */
export function portfolioNominalYield(schedule: MonthlyAllocationEntry[]): number {
  const alloc = schedule[0]?.allocation ?? {};
  const ids = Object.keys(alloc).filter((id) => INSTRUMENT_BY_ID[id]);
  const totalW = ids.reduce((s, id) => s + Math.max(0, Number(alloc[id]) || 0), 0);
  if (totalW <= 0) return 0;
  return ids.reduce((s, id) => s + (Math.max(0, Number(alloc[id]) || 0) / totalW) * INSTRUMENT_BY_ID[id].yield, 0);
}

/**
 * Decision-only (no simulation) concentration ratio of a schedule's
 * starting (month-0) allocation, normalized to [0, 1] — 0 = risky exposure
 * spread evenly across every non-LIQ instrument in the menu, 1 =
 * concentrated in a single one. Feeds the Día 2 "Rendimiento" sub-score's
 * discount (see CONCENTRATION_PENALTY_MU in constants.ts). Only looks at
 * the month-0 checkpoint, same scope the old tree version only ever gave
 * its top-level tranches.
 *
 * LIQ is excluded from the weight base entirely, not just given a low
 * score: it's a pooled liquidity fund, not a single-name credit/market
 * exposure, so it carries no concentration risk in the Solvency-II sense
 * this models (real-world concentration sub-modules exempt cash-equivalent
 * holdings the same way). A team holding half LIQ and half ACC is exactly
 * as concentrated as one holding 100% ACC — the LIQ half isn't
 * "diversifying" the equity risk, it's just holding less of it, which the
 * existing volatility-based riskAdjustedYield already prices in separately.
 * A team with no risky exposure at all (100% LIQ) returns 0 —
 * there's nothing to be concentrated in.
 *
 * Normalized against the menu's 5 non-LIQ instruments: an even split
 * across all 5 (HHI=1/5) maps to 0, a single instrument (HHI=1) maps to 1.
 */
export function portfolioConcentrationRatio(schedule: MonthlyAllocationEntry[]): number {
  const alloc = schedule[0]?.allocation ?? {};
  const risky = Object.entries(alloc).filter(([id, w]) => id !== "LIQ" && INSTRUMENT_BY_ID[id] && Number(w) > 0);
  const totalW = risky.reduce((s, [, w]) => s + Number(w), 0);
  if (totalW <= 0) return 0;
  const hhi = risky.reduce((s, [, w]) => s + (Number(w) / totalW) ** 2, 0);
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
  /** Book-value-weighted average volatility actually held during just this year — informational only, not currently read by finBench() (Día 4's RK no longer charges a separate volatility-based financial-risk line, see rMercado in finBench.ts). */
  avgVol: number;
  /** Cumulative genuine external financing needed through the end of this year — only nonzero once LIQ *and* the entire real portfolio (Capital Social included, see almSimRealYear()'s doc comment) were exhausted via ordinary forced liquidation. Continues accumulating from whatever initialState carried in, if any. */
  capitalComprometidoAcumulado: number;
  /** CAPITAL_SOCIAL minus capitalComprometidoAcumulado — *not* "how much Capital Social sits untouched" (it's genuinely invested and its current value moves with the portfolio, see portfolioBookValue below); this is how much of it the team has avoided needing as *external* financing beyond its whole real portfolio. Almost always equals CAPITAL_SOCIAL. See README §5.3. */
  capitalSocialRestante: number;
  /** This year's real Caja Mínima balance at close (December's own cajaFinal — a point-in-time stock, not an annual flow) — feeds the Día 4 Balance's `caja` line (see finBench()'s balance()), replacing the old flat FZ.cajaPct×primaEmitida approximation with the actual month-by-month simulated floor. */
  cajaFinalAnio: number;
  /** Undiminished book value of every open position at year close (Σ position.book, never netted against capitalComprometidoAcumulado — see stepMonth()'s realBookSum doc comment) — includes Capital Social (funded into the tree at Año 1's start, see almSimRealYear()'s own doc comment) alongside every month's prima-funded surplus; they're mechanically indistinguishable positions by this point. Feeds the Día 4 Balance's `inversiones` line directly — see finBench()'s balance(), which no longer adds Capital Social back in separately (that would double-count it). */
  portfolioBookValue: number;
  totalVentaForzada: number;
  /** Raw $ destroyed by force-selling before maturity this year (see AlmSimResult.totalVentaForzadaPerdida) — already reflected in `income`/`effectiveYield` via devengo. */
  totalVentaForzadaPerdida: number;
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
 * year===1 starts fresh — but not from zero: Capital Social is funded per
 * decision.capitalSocialAllocation right away (see below, a separate
 * decision from `schedule`'s own month-0 checkpoint), then run against that
 * team's own Year-1-within-Year-1 claims schedule (typically lib.payY1).
 * year===2 must receive `initialState` — Año 1's `finalState` — and
 * continues the *same* simulation for another 12 months (same open
 * positions still earning yield/maturing on their own original schedule,
 * same capitalComprometidoAcumulado carried forward), now funded by Año 2's
 * real premium against Año 2's own claims schedule (typically Año 1's
 * development landing in Año 2 — lib.L.slice(0,12) — plus Año 2's own new
 * claims' first-year payments, added together by the caller — see
 * finBenchHelper.ts). This is a genuine continuation, not "what if this
 * tree had run from month 0" — that hypothetical is exactly what the
 * fictitious ALM already answers.
 *
 * What year===2 does NOT inherit from year===1 is which checkpoint governs
 * its *own* fresh premium: `schedule` is read starting at its own relative
 * month 0 again (see stepMonth()'s `scheduleMonth` doc comment), the exact
 * same way Año 1's premium read it — so a team's 12 months of Año 2 prima
 * get invested the same way its 12 months of Año 1 prima did, unaffected by
 * whichever checkpoint an absolute month past 11 happens to hold (those
 * still govern how Año 1's *continuing* positions — Capital Social
 * included — reinvest on their own maturities, since the position ledger
 * itself is never reset). Positions/capitalComprometidoAcumulado/cajaFloat
 * are the only things that actually carry over — the schedule's clock does
 * not.
 *
 * `mes` in the returned rows matches almSim()'s own labeling for the
 * corresponding calendar year (Año 1: -12..-1, Año 2: 0..11), so a real
 * and fictitious ladder for the same year line up month-for-month when
 * shown side by side.
 */
export function almSimRealYear(
  year: 1 | 2,
  claimsSchedule12: number[],
  decision: PortfolioDecisionV4,
  aporteMensual: number,
  initialState?: AlmYearState
): AlmRealYearResult | null {
  if (year === 2 && !initialState) {
    throw new Error("almSimRealYear(2, ...) requires Año 1's finalState — Año 2 is a continuation, not a fresh run.");
  }
  const first = decision.schedule[0];
  const totalW0 = first
    ? Object.entries(first.allocation).reduce((s, [id, w]) => (INSTRUMENT_BY_ID[id] ? s + Math.max(0, Number(w) || 0) : s), 0)
    : 0;
  if (totalW0 <= 0) return null;

  const state: AlmYearState = initialState
    ? {
        positions: initialState.positions.map((p) => ({ ...p })),
        capitalComprometidoAcumulado: initialState.capitalComprometidoAcumulado,
        cajaFloat: initialState.cajaFloat,
      }
    : { positions: [], capitalComprometidoAcumulado: 0, cajaFloat: 0 };

  // Capital Social is genuinely invested — funded per its own
  // capitalSocialAllocation (a separate, one-time decision from `schedule`'s
  // own month-0 checkpoint, which now only ever governs prima money), right
  // at Año 1's start, before a single month of prima runs. Only here, never
  // in almSim() (the fictitious ALM stays on its own notional reserva/12
  // funding hypothesis, unrelated to how much real capital a team has — see
  // this function's own doc comment and README §5.3). From this point on a
  // Capital-Social-funded position is mechanically indistinguishable from a
  // prima-funded one: it accrues, matures, and can be forced-sold via
  // forceLiquidatePortfolio() exactly like anything else, and gets
  // reinvested per `schedule`'s checkpoints on maturity same as any other
  // surplus. capitalComprometidoAcumulado (below) now only ever grows once
  // LIQ *and* this entire real portfolio are exhausted — genuine external
  // financing needed beyond everything the team has, not a direct draw
  // against an untouched reserve (see balance()'s necesidadesPatrimonioODeuda).
  if (year === 1 && !initialState) {
    fundFromAllocation(decision.capitalSocialAllocation, CAPITAL_SOCIAL, 0, state.positions);
  }

  const acc = freshAccumulators();

  const startMonth = year === 1 ? 0 : BUILD_MONTHS;
  const fase: "a1" | "post" = year === 1 ? "a1" : "post";
  const rows: AlmSimRow[] = [];
  let income = 0;
  let sumPV = 0;
  let sumVolWeighted = 0;
  let lastRealBookSum = 0;

  for (let i = 0; i < 12; i++) {
    const t = startMonth + i;
    const mesLabel = year === 1 ? i - BUILD_MONTHS : i;
    const pagoSiniestros = claimsSchedule12[i] || 0;
    // scheduleMonth=i (not t): Año 2's checkpoint lookup restarts at its own
    // month 0, mirroring exactly how Año 1's premium read the same schedule
    // — see stepMonth()'s doc comment.
    const { row, devengo, realBookSum, volWeightedBookSum } = stepMonth(t, i, mesLabel, fase, aporteMensual, pagoSiniestros, decision, state, acc);
    rows.push(row);
    income += devengo;
    sumPV += realBookSum;
    sumVolWeighted += volWeightedBookSum;
    lastRealBookSum = realBookSum;
  }

  return {
    rows,
    portYield: portfolioNominalYield(decision.schedule),
    concentrationRatio: portfolioConcentrationRatio(decision.schedule),
    income,
    // sumPV is already accumulated per-month for avgVol above — reuse it
    // here as the average invested book balance (sumPV / 12 months).
    effectiveYield: sumPV > 0 ? income / (sumPV / 12) : 0,
    avgVol: sumPV > 0 ? sumVolWeighted / sumPV : 0,
    capitalComprometidoAcumulado: state.capitalComprometidoAcumulado,
    capitalSocialRestante: CAPITAL_SOCIAL - state.capitalComprometidoAcumulado,
    cajaFinalAnio: rows[11].cajaFinal,
    portfolioBookValue: lastRealBookSum,
    totalVentaForzada: acc.totalVentaForzada,
    totalVentaForzadaPerdida: acc.totalVentaForzadaPerdida,
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
 * instrument by design. The volatility term is avgPortfolioVol, not the
 * naive avgVol (a book-weighted average of each instrument's OWN volAnual)
 * — avgPortfolioVol runs the actual held mix through COVARIANCE_MATRIX
 * (markowitz.ts) every month, so two instruments with the same combined
 * volAnual but low correlation to each other genuinely lower this term,
 * the same diversification benefit Día 1's min-variance exercise already
 * teaches over the same matrix (see §5.2 of the Día 2 guide). The
 * concentration discount (see portfolioConcentrationRatio()) is a distinct,
 * additional penalty on top of this — it means parking everything in the
 * single best-correlated instrument still isn't free: a genuinely
 * concentrated bet pays a discount here even when the instrument itself is
 * a safe one and its covariance-based contribution to avgPortfolioVol is
 * low.
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
export function scoreFinanciero(lib: LiabilitySchedule, decision: PortfolioDecisionV4, aporteMensualReal?: number): FinancialScore | null {
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
    avgPortfolioVol,
    totalVentaForzada,
    ventaForzadaVolWeighted,
    totalVentaForzadaPerdida,
  } = sim;

  const peakCapitalComprometidoRatio = Math.min(1, peakCapitalComprometido / CAPITAL_SOCIAL);
  const avgCapitalComprometidoRatio = Math.min(1, totalCapitalComprometido / CAPITAL_SOCIAL);
  const cumplimientoCaja = Math.max(
    0,
    100 * (1 - W_CAP_PEAK * peakCapitalComprometidoRatio - W_CAP_AVG * avgCapitalComprometidoRatio)
  );
  const patrimonioDisponible = CAPITAL_SOCIAL - totalCapitalComprometido;

  const effYield = sim.effYield;
  const concentrationRatio = portfolioConcentrationRatio(decision.schedule);
  const riskAdjustedYield = effYield - VOL_PENALTY_LAMBDA * avgPortfolioVol - CONCENTRATION_PENALTY_MU * concentrationRatio;
  const rendimiento = Math.max(
    0,
    Math.min(100, (100 * (riskAdjustedYield - RISK_ADJUSTED_YIELD_MIN)) / (RISK_ADJUSTED_YIELD_MAX - RISK_ADJUSTED_YIELD_MIN))
  );

  const ventaForzadaSeveridad = sumCajaMinima > 0 ? Math.min(1, ventaForzadaVolWeighted / (sumCajaMinima * VOL_MAX)) : 0;
  const ventaForzada = 100 * (1 - ventaForzadaSeveridad);

  const portYield = portfolioNominalYield(decision.schedule);
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
    schedule: decision.schedule,
    avgVol,
    avgPortfolioVol,
    concentrationRatio,
    riskAdjustedYield,
    totalVentaForzada,
    totalVentaForzadaPerdida,
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

  const allocation: Allocation = Object.fromEntries(INSTRUMENTS.map((ins) => [ins.id, ((acc[ins.id] || 0) * 100) / tot]));
  // capitalSocialAllocation is unused by scoreFinanciero()/almSim() (the
  // fictitious ALM never funds Capital Social — see almSim()'s doc comment),
  // so reusing the same ladder allocation here just satisfies the type.
  return scoreFinanciero(lib, { capitalSocialAllocation: allocation, schedule: [{ month: 0, allocation }] });
}

/** Monthly ladder view (Caja Inicial/Prima/Siniestros/Gastos/Vencimientos en caja/Inversión Neta/Caja Final), ported from almLadder(), line ~1809. */
export function almLadder(
  lib: LiabilitySchedule,
  decision: PortfolioDecisionV4,
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
 * PV of a single bond position's remaining cashflows at a flat rate,
 * discounting each one at its own time — the final cashflow (at
 * `remainingMonths`) bundles the coupon with the principal (a genuine
 * maturity payout), every earlier one is coupon-only, spaced 12 months
 * apart counting back from `remainingMonths`. Shared by pvPortafolio()
 * (fresh position, `remainingMonths = ins.plazoM`) and, at curve rates
 * instead of one flat rate, `pvPositionsAtCurve()` below.
 *
 * When `rateAt` returns exactly `couponRate` (TES3/TESUVR8's own base-case
 * yield, undisturbed by a rate shock — see isCouponBond()'s doc comment in
 * instruments.ts), this always returns exactly `amt`: the standard bond-
 * pricing identity `VP = cupón × anualidad + VP(principal)`, discounted at
 * the coupon's own rate, collapses algebraically to the face value for any
 * term — F·r·[1-(1+r)⁻ⁿ]/r + F·(1+r)⁻ⁿ = F. That's what "a la par" means
 * for TES3/TESUVR8 here: priced at exactly their invested amount as long as
 * the discount rate hasn't moved away from their own coupon — see
 * instruments.test.ts for this verified directly against the formula.
 */
function pvCouponCashflows(amt: number, couponRate: number, remainingMonths: number, rateAt: (months: number) => number): number {
  if (remainingMonths <= 0) return amt;
  const coupon = amt * couponRate;
  let pv = 0;
  let first = true;
  for (let m = remainingMonths; m > 0; m -= 12) {
    const cf = first ? coupon + amt : coupon;
    pv += cf / Math.pow(1 + rateAt(m), m / 12);
    first = false;
  }
  return pv;
}

/**
 * PV of a portfolio: bonds valued at market rate off their remaining
 * cashflows (a single maturity payout for CDT90/TES1, annual coupons plus a
 * final coupon+principal payout for the coupon-bearing TES3/TESUVR8 — see
 * isCouponBond() in instruments.ts and pvCouponCashflows() above), cash at
 * par (duration 0), equities at book (no defined duration). Uses a single
 * allocation — this represents the balance sheet at the valuation date,
 * before any reinvestment cycle has occurred. Ported from pvPortafolio(),
 * line ~1824.
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
    else if (isCouponBond(ins)) {
      pv += pvCouponCashflows(amt, ins.yield, ins.plazoM, () => rate);
    } else {
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
 * derives its own real-curve shocks off actual Año-2-end positions — see
 * computeMarketRiskAtAño2End below). Uses a single allocation (the
 * balance-sheet snapshot at the valuation date). Ported from almNAV(),
 * line ~1837.
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

export interface MarketRiskAtYearEnd {
  riesgoTasa: number;
  riesgoInflacion: number;
}

/** Absolute month index right after Año 2's real ALM finishes (see almSimRealYear) — the same 0-based absolute frame every open Position's own matM is already stamped in. */
const AÑO2_END_MONTH = BUILD_MONTHS + 12;

/** A curve is just a function from remaining term (months) to a rate. */
type Curve = (months: number) => number;

/**
 * PV of a team's real, open positions at the end of Año 2 — TESUVR8
 * discounted off the real curve at its own remaining term (it's
 * UVR-indexed, the menu's only genuinely inflation-linked instrument),
 * every other bond-like instrument off the nominal curve at its own
 * remaining term, LIQ/ACC at par (no defined duration — same treatment
 * pvPortafolio() already gives them; ACC's equity risk is priced
 * separately, see ACC_STRESS_PCT).
 *
 * CDT90/TES1 (zero-coupon-style) grow their own current `book` to their own
 * `matM` at their own contractual `ins.yield` (same shape as
 * pvPortafolio()'s per-bond faceVal, just using the position's real
 * remaining term instead of a fresh plazoM), then discount that single
 * lump sum back to AÑO2_END_MONTH. TES3/TESUVR8 (coupon-bearing — see
 * isCouponBond() in instruments.ts) don't grow `book` at all — it's already
 * their flat principal (their yield having already been paid out as
 * periodic coupons, see stepMonth()) — so they're valued as the genuine
 * multi-cashflow stream of remaining coupons plus a final coupon+principal
 * (pvCouponCashflows(), shared with pvPortafolio() above), each cashflow
 * discounted at the curve rate for its own tenor. Either way this is a
 * genuine curve, not a single flat rate, so a short-remaining-term CDT90
 * position and a long-remaining-term TES3 position discount at different
 * points on the same nominal curve.
 */
function pvPositionsAtCurve(positions: Position[], nominalCurve: Curve, realCurve: Curve): number {
  let pv = 0;
  for (const p of positions) {
    const ins = INSTRUMENT_BY_ID[p.instrumentId];
    if (!ins || ins.id === "LIQ" || ins.id === "ACC") {
      pv += p.book;
      continue;
    }
    const remainingMonths = p.matM - AÑO2_END_MONTH;
    const curve = ins.id === "TESUVR8" ? realCurve : nominalCurve;
    if (isCouponBond(ins)) {
      pv += pvCouponCashflows(p.book, ins.yield, remainingMonths, curve);
    } else {
      const remainingYears = Math.max(0, remainingMonths / 12);
      const faceVal = p.book * Math.pow(1 + ins.yield, remainingYears);
      pv += faceVal / Math.pow(1 + curve(remainingMonths), remainingYears);
    }
  }
  return pv;
}

/** Same shape as pvReserva(), but reads its discount rate off a curve (evaluated at each cashflow's own month t) instead of one flat rate for the whole schedule. */
function pvLiabilityAtCurve(L: number[], nominalCurve: Curve): number {
  let pv = 0;
  for (let t = 0; t < L.length; t++) {
    if (L[t] > 0) pv += L[t] / Math.pow(1 + nominalCurve(t), t / 12);
  }
  return pv;
}

/**
 * Día 4's riesgo de tasa / riesgo de inflación: the adverse-direction move
 * in NAV (PV Activo − PV Pasivo), valued at the end of Año 2 off the
 * team's real open positions and the real liability cashflows still owed
 * past that point (`liabilityPostAño2`, the caller's job to assemble —
 * see computeFinBenchBundlesForCohort in finBenchHelper.ts: Año 1's
 * liabilityYear1.L.slice(12) plus Año 2's own claims' L.slice(12), summed
 * element-wise, both already anchored so index 12 = calendar month 24).
 *
 * Two independent shocks, each relative to the curve's own level at every
 * tenor (same convention as ALM_TASA_ALZA/BAJA, applied to the new
 * nominal/real/inflation curves instead — see their own doc comments), but
 * with their own magnitudes: riesgo de tasa shocks the real curve ±50%
 * (RIESGO_TASA_ALZA_FACTOR/BAJA_FACTOR), riesgo de inflación shocks the
 * implied-inflation curve ±75% (RIESGO_INFLACION_ALZA_FACTOR/BAJA_FACTOR) —
 * applied to the *whole curve* at every tenor, not a single point:
 * - Riesgo de tasa shocks the REAL curve, holding each tenor's implied
 *   inflation fixed — the nominal curve moves as a mechanical consequence
 *   (Fisher, per tenor), so this moves TESUVR8 (direct real-curve shock)
 *   AND every nominal-discounted asset/liability (indirect, via the
 *   re-derived nominal curve) together.
 * - Riesgo de inflación shocks the IMPLIED INFLATION curve, holding the
 *   real curve fixed — only the re-derived nominal curve moves, so
 *   TESUVR8 (real-curve-discounted, untouched) is insulated while
 *   everything nominal isn't. This is the asymmetry a team has to
 *   discover: how much TESUVR8 vs. nominal bonds vs. LIQ it ends up
 *   holding by Año 2's close determines which of the two shocks actually
 *   hurts it, and by how much.
 *
 * Both figures are "worse of the two directions," same clipped-to-≥0 shape
 * almNAV()'s own riesgoTasa already uses.
 */
/** Riesgo de tasa shocks (real curve, relative to its own level at every tenor) — see computeMarketRiskAtAño2End's doc comment. */
const RIESGO_TASA_ALZA_FACTOR = 1.5;
const RIESGO_TASA_BAJA_FACTOR = 0.5;
/** Riesgo de inflación shocks (implied-inflation curve, same convention). */
const RIESGO_INFLACION_ALZA_FACTOR = 1.75;
const RIESGO_INFLACION_BAJA_FACTOR = 0.25;

export function computeMarketRiskAtAño2End(positions: Position[], liabilityPostAño2: number[]): MarketRiskAtYearEnd {
  const navAt = (nominalCurve: Curve, realCurve: Curve) =>
    pvPositionsAtCurve(positions, nominalCurve, realCurve) - pvLiabilityAtCurve(liabilityPostAño2, nominalCurve);

  const navBase = navAt(nominalCurveRate, realCurveRate);

  // Riesgo de tasa: shock the real curve at every tenor, re-deriving the
  // nominal curve at that same tenor from the *base* implied inflation
  // (IMPLIED_INFLATION, held fixed).
  const nominalFromShockedReal = (factor: number): Curve => (months) => {
    const real = realCurveRate(months) * factor;
    return (1 + real) * (1 + IMPLIED_INFLATION) - 1;
  };
  const realShocked = (factor: number): Curve => (months) => realCurveRate(months) * factor;
  const navTasaAlza = navAt(nominalFromShockedReal(RIESGO_TASA_ALZA_FACTOR), realShocked(RIESGO_TASA_ALZA_FACTOR));
  const navTasaBaja = navAt(nominalFromShockedReal(RIESGO_TASA_BAJA_FACTOR), realShocked(RIESGO_TASA_BAJA_FACTOR));
  const riesgoTasa = -Math.min(navTasaAlza - navBase, navTasaBaja - navBase);

  // Riesgo de inflación: shock IMPLIED_INFLATION, holding the real curve
  // fixed at base — TESUVR8 discounts at the same (unshocked)
  // realCurveRate in every scenario here.
  const nominalFromShockedInflacion = (factor: number): Curve => (months) => {
    const infl = IMPLIED_INFLATION * factor;
    return (1 + realCurveRate(months)) * (1 + infl) - 1;
  };
  const navInflAlza = navAt(nominalFromShockedInflacion(RIESGO_INFLACION_ALZA_FACTOR), realCurveRate);
  const navInflBaja = navAt(nominalFromShockedInflacion(RIESGO_INFLACION_BAJA_FACTOR), realCurveRate);
  const riesgoInflacion = -Math.min(navInflAlza - navBase, navInflBaja - navBase);

  return { riesgoTasa, riesgoInflacion };
}
