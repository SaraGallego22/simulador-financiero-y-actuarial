import { FZ, CORR_MOD, CAPITAL_SOCIAL } from "./constants";
import { VOL_MENU_AVG } from "./instruments";
import { CLAIMS_INFLATION_ANNUAL } from "../generation/constants";
import { DEV_FRAC } from "../reserving/constants";
import type { LiabilitySchedule } from "../reserving/liability";
import type { TeamDevelopment } from "../reserving/development";

/**
 * What finBench() actually needs from a real, one-year ALM run — not the
 * fictitious ALM's own FinancialScore (which carries Y1/Y2 checkpoints
 * inside a single 60-month run, plus a whole composite nota that has
 * nothing to do with the real P&G/Balance). Built from almSimRealYear()'s
 * result in finBenchHelper.ts — see README §5.3.
 */
export interface AlmYearBenchInput {
  /** Decision-only nominal yield (see portfolioNominalYield() in alm.ts) — identical between the fictitious and real ALM for the same tree. */
  portYield: number;
  /** Real investment income this specific year's ALM accrued — what feeds this year's P&G "Resultado de inversiones" line. */
  income: number;
  /** Cumulative Capital Social committed through the end of this year — subtracted directly from patrimonio in balance(), never folded into rinv (see that function's doc comment). */
  capitalComprometido: number;
  /** This year's book-value-weighted average realized volatility — feeds rFin's volRatio. */
  avgVol: number;
  /** Realized yield (income ÷ average invested balance) — see almSimRealYear()'s doc comment. Used to project Año 3's rinv off what the portfolio actually earned instead of its nominal `portYield`; undefined falls back to `portYield`. */
  effectiveYield?: number;
}

export interface YearResult {
  totalPremium: number;
  claimsAmount: number;
  /** Real policy count that year — needed only for the Año 3 prima projection (retained + new); undefined falls back to the flat FZ.growth3 projection. */
  insuredCount?: number;
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
  almYear1: AlmYearBenchInput | null;
  almYear2?: AlmYearBenchInput | null;
  /** Año 2's real retained-vs-new policy split (from TeamSimResult.extra) — needed only for the Año 3 prima projection; undefined falls back to the flat FZ.growth3 projection. */
  year2Retention?: { retainedCount: number; newCount: number };
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

/**
 * capitalComprometido subtracts directly from patrimonio — it's the real
 * consequence of the fictitious Día 1/Día 2 ALM having had to draw on
 * Capital Social to meet a cash-flow shortfall neither LIQ nor the rest of
 * the portfolio could cover (see almSim's step 4 in alm.ts). This is a
 * lasting equity hit, not something the year's ordinary P&L (retenido)
 * already captures — the P&L reflects accrual-basis annual profitability,
 * this reflects a within-year cash-timing failure.
 */
function balance(pygY: PnL | null, capital0: number, retenido: number, capitalComprometido: number): BalanceSheet | null {
  if (!pygY) return null;
  const reservasTec = pygY.reservas;
  const patrimonio = capital0 + retenido - capitalComprometido;
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
  const { year1, year2, liabilityYear1, development, almYear1, almYear2, year2Retention } = input;

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

  // rinv1/rinv2 are the *real* investment income the real ALM simulation
  // accrued during that specific calendar year alone (almYear1/almYear2.income,
  // see almSimRealYear() in alm.ts — a genuine 12-month continuation, Año 2
  // picking up where Año 1 left off, not a fresh 60-month hypothetical),
  // not a formula proxy — reserva×portYield would double-count what's
  // already a direct cash-timing effect (capitalComprometido, subtracted
  // straight from patrimonio below) and, worse, doesn't reflect what the
  // portfolio actually earned, only what its *nominal* yield would suggest.
  // Falls back to the old reserva×yield estimate only when there's no ALM
  // decision at all to simulate from.
  const portYield = almYear1 ? almYear1.portYield : 0.08;
  const rinv1 = almYear1 ? almYear1.income : reservas1 * 0.08;
  const p1 = pyg(year1.totalPremium, year1.claimsAmount, reservas1, rinv1);

  let p2: PnL | null = null;
  let reservas2 = 0;
  if (year2 && development) {
    const alm2 = almYear2 ?? almYear1;
    const portYield2 = alm2 ? alm2.portYield : portYield;
    reservas2 = development.reservaFinY2;
    const costoCal = development.ultY2 + development.development;
    const rinv2 = alm2 ? alm2.income : reservas2 * portYield2;
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
    const rinv2 = alm2 ? alm2.income : reservas2 * portYield2;
    p2 = pyg(year2.totalPremium, year2.claimsAmount, reservas2, rinv2);
    p2.desarrollo = 0;
    p2.pagos = null;
    p2.ultAcc = year2.claimsAmount;
    p2.portYield2 = portYield2;
  }

  // Año 3 is never simulated (no third market, no third ALM year) — it's a
  // projection built from real Año1/Año2 data wherever that's possible, only
  // falling back to a flat growth rate for the one piece that genuinely
  // can't exist yet (Año 3's own accident-year claims).
  let p3: PnL | null = null;
  let reservas3 = 0;
  if (
    p2 &&
    year2 &&
    development &&
    year1.insuredCount != null &&
    year2.insuredCount != null &&
    year2Retention &&
    development.claimCountY2 > 0
  ) {
    // Prima: retained + new policies (Año 2's real market outcome), not a
    // flat growth rate on the premium total.
    const retentionRate = year2Retention.retainedCount / year1.insuredCount;
    const retainedPolicies3 = retentionRate * year2.insuredCount;
    const newPolicies3 = year2Retention.newCount;
    const insuredCount3 = retainedPolicies3 + newPolicies3;
    const avgPremiumPerPolicy2 = p2.prima / year2.insuredCount;
    const prima3 = insuredCount3 * avgPremiumPerPolicy2;

    // Costo: Año 1's 3rd (final) and Año 2's 2nd development-year tails are
    // exact, real numbers (same claim-level data computeDevelopment() already
    // has, one kernel step further — see TeamDevelopment's devTailY1InY3/
    // devTailY2InY3). Only Año 3's own accident-year claims are projected:
    // frequency held at Año 2's observed rate, severity inflated by
    // CLAIMS_INFLATION_ANNUAL — the same rate the engine already uses for
    // Año1->Año2, reused as-is (see that constant's doc comment for why this
    // isn't double-counted against the Chile real-trend clue).
    const frecuencia2 = development.claimCountY2 / year2.insuredCount;
    const severidad2 = development.ultY2 / development.claimCountY2;
    const severidad3 = severidad2 * (1 + CLAIMS_INFLATION_ANNUAL);
    const siniestrosNuevosAño3 = insuredCount3 * frecuencia2 * severidad3;
    const costo3 = development.devTailY1InY3 + development.devTailY2InY3 + siniestrosNuevosAño3;

    // Reservas: the matching outstanding tails (same real data) plus the
    // projected Año3 claims' own first development-year outstanding balance
    // (DEV_FRAC[0] = 55% paid within their own accident year, 45% still open).
    const osAño3Propio = siniestrosNuevosAño3 * (1 - DEV_FRAC[0]);
    reservas3 = development.osY1endY3 + development.osY2endY3 + osAño3Propio;

    // Resultado de inversiones: the *realized* yield Año 2's real ALM
    // actually earned, not the tree's nominal rate — a team that had to
    // force-sell or commit capital in Año 2 carries that into its Año 3
    // projection instead of the projection "forgetting" it. Falls back to
    // the nominal portYield if no real ALM ran for Año 2.
    const rinv3 = reservas3 * (almYear2?.effectiveYield ?? portYield);

    p3 = pyg(prima3, costo3, reservas3, rinv3);
  } else if (p2) {
    // Fallback: the flat growth-rate projection, unchanged, for whenever the
    // richer inputs above aren't available yet.
    const g = 1 + FZ.growth3;
    reservas3 = reservas2 * g;
    p3 = pyg(p2.prima * g, p2.costo * g, reservas3, reservas3 * portYield);
  }

  // Every team starts from the same fixed Capital Social (see constants.ts)
  // instead of a premium-based capital0 — otherwise a team's own pricing
  // choice would indirectly change how much capital cushion its ALM gets,
  // which has nothing to do with the risk it's actually carrying.
  const capital0 = CAPITAL_SOCIAL;
  const capitalComprometidoY1 = almYear1?.capitalComprometido ?? 0;
  const almY2 = almYear2 ?? almYear1;
  const capitalComprometidoY2 = almY2?.capitalComprometido ?? 0;
  const bal1 = balance(p1, capital0, p1.uneta, capitalComprometidoY1)!;
  const bal2 = p2 ? balance(p2, capital0, p1.uneta + p2.uneta, capitalComprometidoY2) : null;
  // Year 3 is a projection, not an independently ALM-simulated year (see
  // README §5) — it carries Year 2's already-committed capital forward
  // rather than assuming any new erosion.
  const bal3 = p3 ? balance(p3, capital0, p1.uneta + p2!.uneta + p3.uneta, capitalComprometidoY2) : null;

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
