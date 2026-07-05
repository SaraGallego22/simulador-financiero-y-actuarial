import { BUILD_MONTHS, HORIZON } from "../reserving/constants";
import type { LiabilitySchedule } from "../reserving/liability";
import { INSTRUMENTS, INSTRUMENT_BY_ID, YIELD_MIN, YIELD_MAX } from "./instruments";
import type { Allocation } from "./instruments";

export const W_CALCE = 0.45;
export const W_REND = 0.45;
export const W_LIQ = 0.1;

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
  reserva: number;
  effYield: number;
  avgPV: number;
  totIncome: number;
  incomeY1: number;
  liq6: number;
  liab6: number;
}

/**
 * Month-by-month portfolio cashflow simulation: a team's single target
 * allocation is used both to invest the Year-1 premium build-up (prorated
 * monthly contributions) and to reinvest every subsequent maturity, then
 * checked against the liability payment schedule for funding gaps. Ported
 * verbatim from almSim() in the legacy prototype, line ~1659 (see the
 * extensive comment there for the funding-neutrality rationale: the monthly
 * contribution is sized off the liability, not the team's actual premium, so
 * this score isolates timing/matching quality from pricing quality).
 */
export function almSim(lib: LiabilitySchedule, alloc: Allocation): AlmSimResult | null {
  if (!lib.hay) return null;
  const ids = Object.keys(alloc).filter((id) => INSTRUMENT_BY_ID[id]);
  const sumW = ids.reduce((s, id) => s + (Number(alloc[id]) || 0), 0);
  if (sumW <= 0) return null;
  const w: Record<string, number> = {};
  for (const id of ids) w[id] = (Number(alloc[id]) || 0) / sumW;

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

  function invertir(monto: number, atMonth: number) {
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
  let totIncome = 0;
  let incomeY1 = 0;
  let sumPV = 0;
  let liq6 = 0;
  let liab6 = 0;
  let cumLiabReserva = 0;

  for (let t = 0; t < TOTAL; t++) {
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
    if (t < BUILD_MONTHS) incomeY1 += devengo;

    let venc = 0;
    for (const b of bonds) if (b.matM === t) venc += b.book;
    for (const b of bonds) if (b.matM === t) b.book = 0;
    const aporte = t < BUILD_MONTHS ? aporteMensual : 0;

    const pagoY1 = t < BUILD_MONTHS ? lib.payY1[t] || 0 : 0;
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
    }

    liqCash = 0;
    invertir(sobra, t);

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
      fase: t < BUILD_MONTHS ? "a1" : "post",
    });
  }

  const avgPV = sumPV / TOTAL;
  const rMonthly = avgPV > 0 ? totIncome / (avgPV * TOTAL) : cashM;
  const effYield = Math.pow(1 + rMonthly, 12) - 1;

  return { rows, peakGap, reserva, effYield, avgPV, totIncome, incomeY1, liq6, liab6 };
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
  invInc: number;
  liq6: number;
  liab6: number;
  cobertura: number;
  brechaRel: number;
  avgPV: number;
  totIncome: number;
  alloc: Allocation;
  w: Record<string, number>;
}

/**
 * Composite ALM score: 45% cashflow "calce" (funding gap vs. reserve), 45%
 * effective reinvestment yield, 10% short-term liquidity coverage. Ported
 * from scoreFinanciero() in the legacy prototype, line ~1743.
 */
export function scoreFinanciero(lib: LiabilitySchedule, alloc: Allocation): FinancialScore | null {
  const ids = Object.keys(alloc).filter((id) => INSTRUMENT_BY_ID[id]);
  const sumW = ids.reduce((s, id) => s + (Number(alloc[id]) || 0), 0);
  if (sumW <= 0) return null;
  const w: Record<string, number> = {};
  for (const id of ids) w[id] = (Number(alloc[id]) || 0) / sumW;

  const sim = almSim(lib, alloc);
  if (!sim) return null;
  const { reserva, peakGap, liab6, liq6 } = sim;

  const calce = 100 * (1 - Math.min(1, peakGap / reserva));
  const effYield = sim.effYield;
  const rendimiento = Math.max(0, Math.min(100, (100 * (effYield - YIELD_MIN)) / (YIELD_MAX - YIELD_MIN)));
  const portYield = ids.reduce((s, id) => s + w[id] * INSTRUMENT_BY_ID[id].yield, 0);
  const liquidez = liab6 > 0 ? 100 * Math.min(1, liq6 / liab6) : 100;
  const nota = W_CALCE * calce + W_REND * rendimiento + W_LIQ * liquidez;

  const penalty = peakGap * 0.18;
  const invInc = reserva * portYield - penalty;
  const cobertura = liab6 > 0 ? liq6 / liab6 : 1;
  const brechaRel = reserva > 0 ? peakGap / reserva : 0;

  return {
    calce,
    rendimiento,
    liquidez,
    nota,
    portYield,
    effYield,
    reserva,
    peakGap,
    invInc,
    liq6,
    liab6,
    cobertura,
    brechaRel,
    avgPV: sim.avgPV,
    totIncome: sim.totIncome,
    alloc,
    w,
  };
}

/**
 * Reference "target" portfolio: cashflow immunization, covering each
 * liability payment with the longest-maturity instrument that still matures
 * in time (excludes equities, which have no defined maturity). Ported from
 * almObjetivo(), line ~1781.
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
  return scoreFinanciero(lib, alloc);
}

/** Monthly ladder view (cash balance / required payment / gap), ported from almLadder(), line ~1809. */
export function almLadder(
  lib: LiabilitySchedule,
  alloc: Allocation
): { rows: AlmSimRow[]; peakGap: number; reserva: number } | null {
  const sim = almSim(lib, alloc);
  if (!sim) return null;
  const rows = sim.rows.filter((r) => r.mes < 0 || r.pago > 0 || r.mes === 0 || r.brecha > 0);
  return { rows, peakGap: sim.peakGap, reserva: sim.reserva };
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
 * duration). Ported from pvPortafolio(), line ~1824.
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
 * Ported from almNAV(), line ~1837.
 */
export function almNAV(lib: LiabilitySchedule, alloc: Allocation): AlmNavResult | null {
  if (!lib.hay || !alloc) return null;
  const reserva = lib.reserva;
  const compute = (rate: number): AlmNavScenario => {
    const portMercado = pvPortafolio(alloc, reserva, rate);
    const resMercado = pvReserva(lib.L, rate);
    return { portMercado, resMercado, nav: portMercado - resMercado };
  };
  const base = compute(ALM_TASA_BASE);
  const alza = compute(ALM_TASA_ALZA);
  const baja = compute(ALM_TASA_BAJA);
  const riesgoTasa = -Math.min(alza.nav - base.nav, baja.nav - base.nav);
  return { base, alza, baja, riesgoTasa };
}
