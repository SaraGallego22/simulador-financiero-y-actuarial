import { FZ, CORR_MOD } from "./constants";
import { VOL_MENU_AVG } from "./instruments";
import type { LiabilitySchedule } from "../reserving/liability";
import type { TeamDevelopment } from "../reserving/development";
import type { FinancialScore } from "./alm";

export interface YearResult {
  totalPremium: number;
  claimsAmount: number;
}

export interface PnL {
  prima: number;
  costo: number;
  gadq: number;
  gcom: number;
  gadm: number;
  rt: number;
  rinv: number;
  uai: number;
  imp: number;
  uneta: number;
  reservas: number;
  ultAcc?: number;
  desarrollo?: number;
  pagos?: number | null;
  portYield2?: number;
}

export interface BalanceSheet {
  reservasTec: number;
  patrimonio: number;
  caja: number;
  cxc: number;
  cxp: number;
  inversiones: number;
  activos: number;
}

export interface FinBenchResult {
  resTotal: number;
  resRsa: number;
  resIbnr: number;
  p1: PnL;
  p2: PnL | null;
  p3: PnL | null;
  bal1: BalanceSheet;
  bal2: BalanceSheet | null;
  bal3: BalanceSheet | null;
  portYield: number;
  solRPrimas: number;
  solRReservas: number;
  solRSusc: number;
  solRFin: number;
  /** solRFin's realized-volatility-vs-menu-average ratio (1 = same as the menu's average instrument, >1 = a more volatile portfolio than average) — see rFin. */
  solVolRatio: number;
  solROp: number;
  solRk: number;
  solFp: number;
  solMargen: number;
  div: number;
}

export interface FinBenchInput {
  year1: YearResult;
  year2?: YearResult;
  liabilityYear1: LiabilitySchedule;
  development?: TeamDevelopment;
  almYear1: FinancialScore | null;
  almYear2?: FinancialScore | null;
}

function pyg(prima: number, sin: number, reservas: number, rinv: number): PnL {
  const gadq = FZ.gAdq * prima;
  const gcom = FZ.gCom * prima;
  const gadm = FZ.gAdmin * prima;
  const rt = prima - sin - gadq - gcom - gadm;
  const uai = rt + rinv;
  const imp = FZ.tax * Math.max(0, uai);
  return { prima, costo: sin, gadq, gcom, gadm, rt, rinv, uai, imp, uneta: uai - imp, reservas };
}

function balance(pygY: PnL | null, capital0: number, retenido: number): BalanceSheet | null {
  if (!pygY) return null;
  const reservasTec = pygY.reservas;
  const patrimonio = capital0 + retenido;
  const caja = FZ.cajaPct * pygY.prima;
  const cxc = FZ.cxcPct * pygY.prima;
  const cxp = FZ.cxpPct * pygY.prima;
  const inversiones = reservasTec + cxp + patrimonio - caja - cxc;
  return { reservasTec, patrimonio, caja, cxc, cxp, inversiones, activos: caja + inversiones + cxc };
}

/**
 * Central financial benchmark: builds the Year 1-3 P&L, a simplified balance
 * sheet, and Solvency-II-style capital requirement (underwriting + financial
 * + operational risk combined via a correlation matrix). Used both to
 * auto-grade uploaded financial deliverables (scoreConcepto) and to compute
 * solvency ratio / dividends (Day 4). Ported from finBench() in the legacy
 * prototype, line ~1113 — same formulas, but parameterized on plain inputs
 * instead of reading mutable globals (SIM_RES/SIM_RES2/FIN/BENCH_CACHE).
 */
export function finBench(input: FinBenchInput): FinBenchResult {
  const { year1, year2, liabilityYear1, development, almYear1, almYear2 } = input;

  let reservas1: number;
  let rsa1: number;
  let ibnr1: number;
  if (development) {
    reservas1 = development.bookedReserveEndY1;
    rsa1 = development.caseOsEndY1;
    ibnr1 = development.expectedIBNR;
  } else {
    reservas1 = liabilityYear1.reserva || 0;
    ibnr1 = reservas1 * 0.55;
    rsa1 = reservas1 - ibnr1;
  }

  const portYield = almYear1 ? almYear1.portYield : 0.08;
  const rinv1 = almYear1 ? almYear1.invInc : reservas1 * 0.08;
  const p1 = pyg(year1.totalPremium, year1.claimsAmount, reservas1, rinv1);

  let p2: PnL | null = null;
  let reservas2 = 0;
  if (year2 && development) {
    const alm2 = almYear2 ?? almYear1;
    const portYield2 = alm2 ? alm2.portYield : portYield;
    reservas2 = development.reservaFinY2;
    const costoCal = development.ultY2 + development.development;
    const rinv2 = reservas2 * portYield2;
    const gadq = FZ.gAdq * year2.totalPremium;
    const gcom = FZ.gCom * year2.totalPremium;
    const gadm = FZ.gAdmin * year2.totalPremium;
    const rt2 = year2.totalPremium - costoCal - gadq - gcom - gadm;
    const uai2 = rt2 + rinv2;
    const imp2 = FZ.tax * Math.max(0, uai2);
    p2 = {
      prima: year2.totalPremium,
      costo: costoCal,
      ultAcc: development.ultY2,
      desarrollo: development.development,
      pagos: development.pagosY2,
      gadq,
      gcom,
      gadm,
      rt: rt2,
      rinv: rinv2,
      uai: uai2,
      imp: imp2,
      uneta: uai2 - imp2,
      reservas: reservas2,
      portYield2,
    };
  } else if (year2) {
    const alm2 = almYear2 ?? almYear1;
    const portYield2 = alm2 ? alm2.portYield : portYield;
    const ratio = year1.claimsAmount > 0 ? reservas1 / year1.claimsAmount : 0.4;
    reservas2 = year2.claimsAmount * ratio;
    p2 = pyg(year2.totalPremium, year2.claimsAmount, reservas2, reservas2 * portYield2);
    p2.desarrollo = 0;
    p2.pagos = null;
    p2.ultAcc = year2.claimsAmount;
    p2.portYield2 = portYield2;
  }

  let p3: PnL | null = null;
  let reservas3 = 0;
  if (p2) {
    const g = 1 + FZ.growth3;
    reservas3 = reservas2 * g;
    p3 = pyg(p2.prima * g, p2.costo * g, reservas3, reservas3 * portYield);
  }

  const capital0 = FZ.cap0Pct * year1.totalPremium;
  const bal1 = balance(p1, capital0, p1.uneta)!;
  const bal2 = p2 ? balance(p2, capital0, p1.uneta + p2.uneta) : null;
  const bal3 = p3 ? balance(p3, capital0, p1.uneta + p2!.uneta + p3.uneta) : null;

  const balN = bal2 || bal1;
  const pygN = p2 || p1;
  const reservasN = pygN.reservas;
  const rPrimas = pygN.prima * FZ.primeVol;
  const rReservas = reservasN * FZ.resVol;
  const rSusc = Math.sqrt(rPrimas * rPrimas + rReservas * rReservas + 2 * FZ.corrPR * rPrimas * rReservas);
  // Financial risk scales with the team's *own* realized portfolio
  // volatility relative to the instrument menu's average (VOL_MENU_AVG) —
  // a team that leaned on ACC pays a materially higher capital charge here
  // than one that stuck to the menu's safer end, even at identical
  // inversiones; a team with no ALM decision at all falls back to the
  // pre-volatility flat charge (ratio 1). This is the Día 4 solvency
  // connection to the Día 1 portfolio choice.
  const almN = almYear2 ?? almYear1;
  const volRatio = almN ? almN.avgVol / VOL_MENU_AVG : 1;
  const rFin = FZ.finRiskPct * balN.inversiones * volRatio;
  const rOp = FZ.opPct * pygN.prima;
  const R = [rSusc, rFin, rOp];
  let rk2 = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rk2 += CORR_MOD[i][j] * R[i] * R[j];
  const rk = Math.sqrt(rk2);
  const fondosPropios = balN.patrimonio;
  const margen = rk > 0 ? fondosPropios / rk : 0;
  const dividendos = Math.max(0, fondosPropios - rk * FZ.targetMargin);

  return {
    resTotal: reservas1,
    resRsa: rsa1,
    resIbnr: ibnr1,
    p1,
    p2,
    p3,
    bal1,
    bal2,
    bal3,
    portYield,
    solRPrimas: rPrimas,
    solRReservas: rReservas,
    solRSusc: rSusc,
    solRFin: rFin,
    solVolRatio: volRatio,
    solROp: rOp,
    solRk: rk,
    solFp: fondosPropios,
    solMargen: margen,
    div: dividendos,
  };
}
