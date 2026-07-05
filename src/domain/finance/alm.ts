import { BUILD_MONTHS, HORIZON } from "../reserving/constants";
import type { LiabilitySchedule } from "../reserving/liability";
import { INSTRUMENTS, INSTRUMENT_BY_ID, YIELD_MIN, YIELD_MAX } from "./instruments";
import type { Allocation } from "./instruments";

export const W_CALCE = 0.45;
export const W_REND = 0.45;
export const W_LIQ = 0.1;

/** calce blends the single worst month (tail risk) with the average shortfall across the whole horizon (chronic mismatch) — see scoreFinanciero(). */
export const W_CALCE_PEAK = 0.5;
export const W_CALCE_AVG = 0.5;

/** Rate shocks (+20%/-15% relative to base), ported from ALM_TASA_* line ~1804. */
export const ALM_TASA_BASE = 0.1;
export const ALM_TASA_ALZA = 0.1 * 1.2;
export const ALM_TASA_BAJA = 0.1 * 0.85;

export interface AlmSimRow {
  mes: number;
  pago: number;
  aporte: number;
  ingresos: number;
  saldo: number;
  brecha: number;
  fase: "a1" | "post";
}

export interface AlmSimResult {
  rows: AlmSimRow[];
  peakGap: number;
  /** Sum of every month's funding shortfall (brecha) across the whole horizon — captures chronic mismatch, not just the single worst month. */
  totalShortfall: number;
  reserva: number;
  effYield: number;
  avgPV: number;
  totIncome: number;
  incomeY1: number;
  liq6: number;
  liab6: number;
}

function normalizeWeights(alloc: Allocation): { ids: string[]; w: Record<string, number> } | null {
  const ids = Object.keys(alloc).filter((id) => INSTRUMENT_BY_ID[id]);
  const sumW = ids.reduce((s, id) => s + (Number(alloc[id]) || 0), 0);
  if (sumW <= 0) return null;
  const w: Record<string, number> = {};
  for (const id of ids) w[id] = (Number(alloc[id]) || 0) / sumW;
  return { ids, w };
}

/**
 * Month-by-month portfolio cashflow simulation, checked against the
 * liability payment schedule for funding gaps. A team makes *two* allocation
 * decisions, not one: `allocInitial` governs how the Year-1 premium
 * build-up (the monthly notional contribution, months 0..BUILD_MONTHS-1) is
 * invested, and `allocReinvest` governs every reinvestment once that
 * build-up phase ends and the book is just running off to pay claims
 * (months BUILD_MONTHS..end) — i.e., what happens once the instruments
 * picked during Year 1 start maturing. This mirrors real ALM practice:
 * an initial strategic allocation is a different decision from the ongoing
 * reinvestment/rollover policy, and a team that nails the initial pick but
 * has no plan for what comes after shouldn't score as well as one that
 * planned both. Extends almSim() from the legacy prototype, line ~1659
 * (see the extensive comment there for the funding-neutrality rationale:
 * the monthly contribution is sized off the liability, not the team's
 * actual premium, so this score isolates timing/matching quality from
 * pricing quality) — the legacy used one allocation for both phases.
 */
export function almSim(lib: LiabilitySchedule, allocInitial: Allocation, allocReinvest: Allocation): AlmSimResult | null {
  if (!lib.hay) return null;
  const initial = normalizeWeights(allocInitial);
  const reinvest = normalizeWeights(allocReinvest);
  if (!initial || !reinvest) return null;

  const reserva = lib.reserva;
  const totalPagoY1 = lib.payY1.reduce((s, v) => s + v, 0);
  const notionalFondeo = reserva + totalPagoY1;
  const cashRate = INSTRUMENT_BY_ID.LIQ.yield;
  const cashM = Math.pow(1 + cashRate, 1 / 12) - 1;
  const eqYM = INSTRUMENT_BY_ID.ACC ? Math.pow(1 + INSTRUMENT_BY_ID.ACC.yield, 1 / 12) - 1 : 0;
  const TOTAL = BUILD_MONTHS + HORIZON;
  const aporteMensual = notionalFondeo / BUILD_MONTHS;

  let liqCash = 0;
  let eqBook = 0;
  const bonds: { matM: number; book: number; yM: number }[] = [];

  function invertir(monto: number, atMonth: number, ids: string[], w: Record<string, number>) {
    if (monto <= 0) return;
    for (const id of ids) {
      const ins = INSTRUMENT_BY_ID[id];
      const parte = w[id] * monto;
      if (parte <= 0) continue;
      if (ins.plazoM === 0) liqCash += parte;
      else if (ins.plazoM >= 400) eqBook += parte;
      else bonds.push({ matM: atMonth + ins.plazoM, book: parte, yM: Math.pow(1 + ins.yield, 1 / 12) - 1 });
    }
  }

  const rows: AlmSimRow[] = [];
  let peakGap = 0;
  let totalShortfall = 0;
  let totIncome = 0;
  let incomeY1 = 0;
  let sumPV = 0;
  let liq6 = 0;
  let liab6 = 0;
  let cumLiabReserva = 0;

  for (let t = 0; t < TOTAL; t++) {
    const buildPhase = t < BUILD_MONTHS;
    const { ids, w } = buildPhase ? initial : reinvest;

    const liqInt = liqCash * cashM;
    liqCash += liqInt;
    let bInc = 0;
    for (const b of bonds) {
      if (b.matM > t) {
        const g = b.book * b.yM;
        b.book += g;
        bInc += g;
      }
    }
    const eInc = eqBook * eqYM;
    eqBook += eInc;
    const devengo = liqInt + bInc + eInc;
    totIncome += devengo;
    if (buildPhase) incomeY1 += devengo;

    let venc = 0;
    for (const b of bonds) if (b.matM === t) venc += b.book;
    for (const b of bonds) if (b.matM === t) b.book = 0;
    const aporte = buildPhase ? aporteMensual : 0;

    const pagoY1 = buildPhase ? lib.payY1[t] || 0 : 0;
    const pagoReserva = t >= BUILD_MONTHS ? lib.L[t - BUILD_MONTHS] || 0 : 0;
    const pago = pagoY1 + pagoReserva;
    if (t >= BUILD_MONTHS) {
      cumLiabReserva += pagoReserva;
      if (t - BUILD_MONTHS <= 6) liab6 = cumLiabReserva;
    }

    const pool = liqCash + venc + aporte;
    let sobra: number;
    let brecha = 0;
    if (pool >= pago) {
      sobra = pool - pago;
    } else {
      sobra = 0;
      brecha = pago - pool;
      if (brecha > peakGap) peakGap = brecha;
      totalShortfall += brecha;
    }

    liqCash = 0;
    invertir(sobra, t, ids, w);

    let bondBook = 0;
    for (const b of bonds) if (b.matM > t) bondBook += b.book;
    sumPV += liqCash + bondBook + eqBook;

    if (t === BUILD_MONTHS) {
      liq6 = liqCash;
      for (const b of bonds) if (b.matM > t && b.matM <= t + 6) liq6 += b.book;
    }

    rows.push({
      mes: t - BUILD_MONTHS,
      pago,
      aporte,
      ingresos: aporte + venc + devengo,
      saldo: liqCash,
      brecha,
      fase: buildPhase ? "a1" : "post",
    });
  }

  const avgPV = sumPV / TOTAL;
  const rMonthly = avgPV > 0 ? totIncome / (avgPV * TOTAL) : cashM;
  const effYield = Math.pow(1 + rMonthly, 12) - 1;

  return { rows, peakGap, totalShortfall, reserva, effYield, avgPV, totIncome, incomeY1, liq6, liab6 };
}

export interface FinancialScore {
  calce: number;
  rendimiento: number;
  liquidez: number;
  nota: number;
  portYield: number;
  effYield: number;
  reserva: number;
  peakGap: number;
  peakShortfallRatio: number;
  avgShortfallRatio: number;
  invInc: number;
  liq6: number;
  liab6: number;
  cobertura: number;
  brechaRel: number;
  avgPV: number;
  totIncome: number;
  allocInitial: Allocation;
  allocReinvest: Allocation;
  w: Record<string, number>;
}

/**
 * Composite ALM score: 45% cashflow "calce" (funding match quality), 45%
 * effective reinvestment yield, 10% short-term liquidity coverage.
 *
 * calce itself blends two things, not just the worst month: the peak
 * funding gap (tail risk — one bad month can mean real insolvency) *and*
 * the average shortfall across the entire horizon (chronic mismatch —
 * a portfolio that's slightly short almost every month is a worse match
 * than one that's short once, even if the single worst month is smaller).
 * Both are expressed as a fraction of the total reserve being funded, then
 * blended 50/50 (W_CALCE_PEAK/W_CALCE_AVG). Extends scoreFinanciero() from
 * the legacy prototype, line ~1743 — the legacy penalized peakGap only.
 */
export function scoreFinanciero(lib: LiabilitySchedule, allocInitial: Allocation, allocReinvest: Allocation): FinancialScore | null {
  const initial = normalizeWeights(allocInitial);
  if (!initial) return null;

  const sim = almSim(lib, allocInitial, allocReinvest);
  if (!sim) return null;
  const { reserva, peakGap, totalShortfall, liab6, liq6 } = sim;

  const peakShortfallRatio = reserva > 0 ? Math.min(1, peakGap / reserva) : 0;
  const avgShortfallRatio = reserva > 0 ? Math.min(1, totalShortfall / reserva) : 0;
  const calce = Math.max(0, 100 * (1 - W_CALCE_PEAK * peakShortfallRatio - W_CALCE_AVG * avgShortfallRatio));

  const effYield = sim.effYield;
  const rendimiento = Math.max(0, Math.min(100, (100 * (effYield - YIELD_MIN)) / (YIELD_MAX - YIELD_MIN)));
  // Blended nominal yield across both phases (weighted by how many months each policy governs), shown as a single reference figure.
  const portYieldInitial = initial.ids.reduce((s, id) => s + initial.w[id] * INSTRUMENT_BY_ID[id].yield, 0);
  const reinvestNorm = normalizeWeights(allocReinvest);
  const portYieldReinvest = reinvestNorm
    ? reinvestNorm.ids.reduce((s, id) => s + reinvestNorm.w[id] * INSTRUMENT_BY_ID[id].yield, 0)
    : portYieldInitial;
  const portYield = (BUILD_MONTHS * portYieldInitial + HORIZON * portYieldReinvest) / (BUILD_MONTHS + HORIZON);
  const liquidez = liab6 > 0 ? 100 * Math.min(1, liq6 / liab6) : 100;
  const nota = W_CALCE * calce + W_REND * rendimiento + W_LIQ * liquidez;

  const penalty = peakGap * 0.18;
  const invInc = reserva * portYield - penalty;
  const cobertura = liab6 > 0 ? liq6 / liab6 : 1;
  const brechaRel = peakShortfallRatio;

  return {
    calce,
    rendimiento,
    liquidez,
    nota,
    portYield,
    effYield,
    reserva,
    peakGap,
    peakShortfallRatio,
    avgShortfallRatio,
    invInc,
    liq6,
    liab6,
    cobertura,
    brechaRel,
    avgPV: sim.avgPV,
    totIncome: sim.totIncome,
    allocInitial,
    allocReinvest,
    w: initial.w,
  };
}

/**
 * Reference "target" portfolio: cashflow immunization, covering each
 * liability payment with the longest-maturity instrument that still matures
 * in time (excludes equities, which have no defined maturity). Used as both
 * the initial and reinvestment reference — a genuinely dedicated/immunized
 * ladder doesn't need a different policy after the build-up phase, it just
 * keeps laddering whatever's left. Ported from almObjetivo(), line ~1781.
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
  const alloc: Allocation = {};
  for (const id of Object.keys(acc)) alloc[id] = (100 * acc[id]) / tot;
  return scoreFinanciero(lib, alloc, alloc);
}

/** Monthly ladder view (cash balance / required payment / gap), ported from almLadder(), line ~1809. */
export function almLadder(
  lib: LiabilitySchedule,
  allocInitial: Allocation,
  allocReinvest: Allocation
): { rows: AlmSimRow[]; peakGap: number; totalShortfall: number; reserva: number } | null {
  const sim = almSim(lib, allocInitial, allocReinvest);
  if (!sim) return null;
  const rows = sim.rows.filter((r) => r.mes < 0 || r.pago > 0 || r.mes === 0 || r.brecha > 0);
  return { rows, peakGap: sim.peakGap, totalShortfall: sim.totalShortfall, reserva: sim.reserva };
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
 * duration). Uses the *initial* allocation — this represents the balance
 * sheet at the valuation date, before any reinvestment cycle has occurred.
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
 * scenarios, feeding the interest-rate-risk component of solvency capital.
 * Uses the initial allocation (the balance-sheet snapshot at the valuation
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
