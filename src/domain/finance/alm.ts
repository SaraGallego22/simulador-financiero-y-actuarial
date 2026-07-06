import { BUILD_MONTHS, HORIZON } from "../reserving/constants";
import type { LiabilitySchedule } from "../reserving/liability";
import { INSTRUMENTS, INSTRUMENT_BY_ID, YIELD_MIN, YIELD_MAX, isBondLike } from "./instruments";
import type { Allocation, PortfolioDecisionV2, MaturityRules } from "./instruments";
import { FZ, GASTOS_TOTAL_PCT } from "./constants";

export const W_CUMPL_CAJA = 0.45;
export const W_REND = 0.45;
export const W_LIQ = 0.1;

/** cumplimientoCaja blends the single worst month (tail risk) with the average shortfall across the whole horizon (chronic mismatch) — see scoreFinanciero(). */
export const W_BRECHA_PEAK = 0.5;
export const W_BRECHA_AVG = 0.5;

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
  /** Negative = surplus invested this month; positive = drawn from liqCash to cover a Caja Mínima shortfall. */
  inversionNeta: number;
  cajaFinal: number;
  /** > 0 only when a positive inversionNeta couldn't be fully covered by available liqCash. */
  brechaCaja: number;
  fase: "a1" | "post";
}

export interface AlmSimResult {
  rows: AlmSimRow[];
  peakBrechaCaja: number;
  /** Sum of every month's Caja Mínima shortfall across the whole horizon — captures chronic mismatch, not just the single worst month. */
  totalBrechaCaja: number;
  /** Sum of every month's Caja Mínima requirement — the normalizing scale for the score ratios below. */
  sumCajaMinima: number;
  mesesEnBrecha: number;
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
 * Month-by-month portfolio cashflow simulation, structured as a cashflow
 * statement (Caja Inicial / Prima Cobrada / Pago Siniestros / Gastos /
 * Inversión Neta / Caja Final) and checked against a mandatory minimum-cash
 * floor (Caja Mínima) each month, rather than against the old flat
 * reserve-relative funding gap.
 *
 * `decision.allocation` governs where fresh surplus cash goes every month
 * (any month with money to invest and no more specific rule); Prima Cobrada
 * is still the funding-neutral monthly notional contribution (sized off the
 * liability, not the team's actual premium, exactly as before — see the
 * historical note below) and Pago Siniestros is still the real liability
 * payment schedule — neither changed, only Gastos and Caja Mínima are new.
 *
 * `decision.maturityRules` governs what happens to a *specific* instrument's
 * proceeds when it matures: held as cash (a source of liquidity for that
 * month's Caja Mínima shortfall, if any) or reinvested into another
 * instrument, which is itself governed by whatever rule is keyed under its
 * own id when it later matures — forming a chain (including a
 * self-referential "keep laddering the same instrument" rule). An
 * instrument with no rule falls back to `allocation`, same as fresh
 * surplus, so a team can set one allocation and never touch anything else.
 *
 * The engine never overrides a team's stated maturity rule to cover a
 * shortfall — it only draws on liqCash (uninvested/"mantener en caja"
 * proceeds). A shortfall caused by locking everything into illiquid
 * reinvestment chains is exactly the failure being graded.
 *
 * Historical note: extends almSim() from the legacy prototype, line ~1659
 * (see the extensive comment there for the funding-neutrality rationale of
 * the monthly contribution) and this app's earlier `initial`/`reinvest`
 * two-phase split — this version replaces that calendar-phase split with
 * genuine per-instrument maturity rules.
 */
export function almSim(lib: LiabilitySchedule, decision: PortfolioDecisionV2): AlmSimResult | null {
  if (!lib.hay) return null;
  const norm = normalizeWeights(decision.allocation);
  if (!norm) return null;
  const { maturityRules } = decision;

  const reserva = lib.reserva;
  const totalPagoY1 = lib.payY1.reduce((s, v) => s + v, 0);
  const notionalFondeo = reserva + totalPagoY1;
  const cashRate = INSTRUMENT_BY_ID.LIQ.yield;
  const cashM = Math.pow(1 + cashRate, 1 / 12) - 1;
  const eqYM = INSTRUMENT_BY_ID.ACC ? Math.pow(1 + INSTRUMENT_BY_ID.ACC.yield, 1 / 12) - 1 : 0;
  const TOTAL = BUILD_MONTHS + HORIZON;
  const aporteMensual = notionalFondeo / BUILD_MONTHS;

  // cajaFloat = the mandatory, non-interest-bearing Caja Mínima buffer.
  // liqCash = the LIQ investment bucket (still earns cashRate) — kept
  // separate so the floor can't be satisfied "for free" just by definition.
  let cajaFloat = 0;
  let liqCash = 0;
  let eqBook = 0;
  const bonds: { instrumentId: string; matM: number; book: number; yM: number }[] = [];

  function invertir(monto: number, atMonth: number, ids: string[], w: Record<string, number>) {
    if (monto <= 0) return;
    for (const id of ids) {
      const ins = INSTRUMENT_BY_ID[id];
      const parte = w[id] * monto;
      if (parte <= 0) continue;
      if (ins.plazoM === 0) liqCash += parte;
      else if (ins.plazoM >= 400) eqBook += parte;
      else bonds.push({ instrumentId: id, matM: atMonth + ins.plazoM, book: parte, yM: Math.pow(1 + ins.yield, 1 / 12) - 1 });
    }
  }

  function investSingle(monto: number, atMonth: number, targetId: string) {
    if (monto <= 0 || !INSTRUMENT_BY_ID[targetId]) return;
    invertir(monto, atMonth, [targetId], { [targetId]: 1 });
  }

  const rows: AlmSimRow[] = [];
  let peakBrechaCaja = 0;
  let totalBrechaCaja = 0;
  let sumCajaMinima = 0;
  let mesesEnBrecha = 0;
  let totIncome = 0;
  let incomeY1 = 0;
  let sumPV = 0;
  let liq6 = 0;
  let liab6 = 0;
  let cumLiabReserva = 0;

  for (let t = 0; t < TOTAL; t++) {
    const buildPhase = t < BUILD_MONTHS;

    // 1. Accrue yield on investment buckets — unconditional, every month.
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

    // 2. Route this month's bond maturities individually per maturityRules.
    let vencCash = 0;
    let reinvestDefaultAmt = 0;
    for (const b of bonds) {
      if (b.matM !== t) continue;
      const rule = maturityRules[b.instrumentId];
      if (!rule) reinvestDefaultAmt += b.book;
      else if (rule.action === "cash") vencCash += b.book;
      else investSingle(b.book, t, rule.instrumentId);
    }
    for (let i = bonds.length - 1; i >= 0; i--) {
      if (bonds[i].matM === t) bonds.splice(i, 1);
    }

    // 3. Compute the six cashflow-statement values for this month.
    const primaCobrada = buildPhase ? aporteMensual : 0;
    const pagoY1 = buildPhase ? lib.payY1[t] || 0 : 0;
    const pagoReserva = t >= BUILD_MONTHS ? lib.L[t - BUILD_MONTHS] || 0 : 0;
    const pagoSiniestros = pagoY1 + pagoReserva;
    if (t >= BUILD_MONTHS) {
      cumLiabReserva += pagoReserva;
      if (t - BUILD_MONTHS <= 6) liab6 = cumLiabReserva;
    }
    const gastos = GASTOS_TOTAL_PCT * primaCobrada;
    const cajaMinima = FZ.cajaPct * (primaCobrada + pagoSiniestros);
    sumCajaMinima += cajaMinima;

    const cajaInicial = cajaFloat;
    const cajaDisponible = cajaInicial + primaCobrada - pagoSiniestros - gastos + vencCash;
    const neededNeta = cajaMinima - cajaDisponible;

    // 4. Execute.
    let inversionNeta: number;
    let brechaCaja = 0;
    let cajaFinal: number;
    if (neededNeta <= 0) {
      const surplus = -neededNeta;
      invertir(surplus + reinvestDefaultAmt, t, norm.ids, norm.w);
      inversionNeta = neededNeta;
      cajaFinal = cajaMinima;
    } else {
      invertir(reinvestDefaultAmt, t, norm.ids, norm.w);
      const drawn = Math.min(neededNeta, liqCash);
      liqCash -= drawn;
      inversionNeta = drawn;
      brechaCaja = neededNeta - drawn;
      cajaFinal = cajaMinima - brechaCaja;
      if (brechaCaja > peakBrechaCaja) peakBrechaCaja = brechaCaja;
      totalBrechaCaja += brechaCaja;
      mesesEnBrecha++;
    }
    cajaFloat = cajaFinal;

    let bondBook = 0;
    for (const b of bonds) if (b.matM > t) bondBook += b.book;
    sumPV += liqCash + bondBook + eqBook;

    if (t === BUILD_MONTHS) {
      liq6 = liqCash;
      for (const b of bonds) if (b.matM > t && b.matM <= t + 6) liq6 += b.book;
    }

    rows.push({
      mes: t - BUILD_MONTHS,
      cajaInicial,
      primaCobrada,
      pagoSiniestros,
      gastos,
      vencimientosCaja: vencCash,
      inversionNeta,
      cajaFinal,
      brechaCaja,
      fase: buildPhase ? "a1" : "post",
    });
  }

  const avgPV = sumPV / TOTAL;
  const rMonthly = avgPV > 0 ? totIncome / (avgPV * TOTAL) : cashM;
  const effYield = Math.pow(1 + rMonthly, 12) - 1;

  return { rows, peakBrechaCaja, totalBrechaCaja, sumCajaMinima, mesesEnBrecha, reserva, effYield, avgPV, totIncome, incomeY1, liq6, liab6 };
}

export interface FinancialScore {
  cumplimientoCaja: number;
  rendimiento: number;
  liquidez: number;
  nota: number;
  portYield: number;
  effYield: number;
  reserva: number;
  peakBrechaCaja: number;
  peakBrechaCajaRatio: number;
  avgBrechaCajaRatio: number;
  invInc: number;
  liq6: number;
  liab6: number;
  cobertura: number;
  avgPV: number;
  totIncome: number;
  allocation: Allocation;
}

/**
 * Composite ALM score: 45% Caja Mínima compliance, 45% effective
 * reinvestment yield, 10% short-term liquidity coverage.
 *
 * cumplimientoCaja blends two things, not just the worst month: the peak
 * single-month shortfall (tail risk) *and* the average shortfall across the
 * entire horizon (chronic mismatch), each expressed as a fraction of a
 * typical month's Caja Mínima requirement (not the old multi-year reserve —
 * a monthly floor needs a monthly-scale denominator or every gap looks
 * artificially tiny), blended 50/50 (W_BRECHA_PEAK/W_BRECHA_AVG).
 */
export function scoreFinanciero(lib: LiabilitySchedule, decision: PortfolioDecisionV2): FinancialScore | null {
  const norm = normalizeWeights(decision.allocation);
  if (!norm) return null;

  const sim = almSim(lib, decision);
  if (!sim) return null;
  const { reserva, peakBrechaCaja, totalBrechaCaja, sumCajaMinima, liab6, liq6 } = sim;
  const TOTAL = BUILD_MONTHS + HORIZON;

  const avgCajaMinima = sumCajaMinima / TOTAL;
  const peakBrechaCajaRatio = avgCajaMinima > 0 ? Math.min(1, peakBrechaCaja / avgCajaMinima) : 0;
  const avgBrechaCajaRatio = sumCajaMinima > 0 ? Math.min(1, totalBrechaCaja / sumCajaMinima) : 0;
  const cumplimientoCaja = Math.max(0, 100 * (1 - W_BRECHA_PEAK * peakBrechaCajaRatio - W_BRECHA_AVG * avgBrechaCajaRatio));

  const effYield = sim.effYield;
  const rendimiento = Math.max(0, Math.min(100, (100 * (effYield - YIELD_MIN)) / (YIELD_MAX - YIELD_MIN)));
  const portYield = norm.ids.reduce((s, id) => s + norm.w[id] * INSTRUMENT_BY_ID[id].yield, 0);
  const liquidez = liab6 > 0 ? 100 * Math.min(1, liq6 / liab6) : 100;
  const nota = W_CUMPL_CAJA * cumplimientoCaja + W_REND * rendimiento + W_LIQ * liquidez;

  const penalty = peakBrechaCaja * 0.18;
  const invInc = reserva * portYield - penalty;
  const cobertura = liab6 > 0 ? liq6 / liab6 : 1;

  return {
    cumplimientoCaja,
    rendimiento,
    liquidez,
    nota,
    portYield,
    effYield,
    reserva,
    peakBrechaCaja,
    peakBrechaCajaRatio,
    avgBrechaCajaRatio,
    invInc,
    liq6,
    liab6,
    cobertura,
    avgPV: sim.avgPV,
    totIncome: sim.totIncome,
    allocation: decision.allocation,
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
  const alloc: Allocation = {};
  for (const id of Object.keys(acc)) alloc[id] = (100 * acc[id]) / tot;
  const maturityRules: MaturityRules = {};
  for (const id of Object.keys(alloc)) {
    if (isBondLike(INSTRUMENT_BY_ID[id])) maturityRules[id] = { action: "reinvest", instrumentId: id };
  }
  return scoreFinanciero(lib, { allocation: alloc, maturityRules });
}

/** Monthly ladder view (Caja Inicial/Prima/Siniestros/Gastos/Inversión Neta/Caja Final), ported from almLadder(), line ~1809. */
export function almLadder(
  lib: LiabilitySchedule,
  decision: PortfolioDecisionV2
): { rows: AlmSimRow[]; peakBrechaCaja: number; totalBrechaCaja: number; reserva: number } | null {
  const sim = almSim(lib, decision);
  if (!sim) return null;
  const rows = sim.rows.filter((r) => r.mes < 0 || r.pagoSiniestros > 0 || r.mes === 0 || r.brechaCaja > 0);
  return { rows, peakBrechaCaja: sim.peakBrechaCaja, totalBrechaCaja: sim.totalBrechaCaja, reserva: sim.reserva };
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
 * scenarios, feeding the interest-rate-risk component of solvency capital.
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
