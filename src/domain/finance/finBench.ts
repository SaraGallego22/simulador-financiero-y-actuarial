import { FZ, CORR_MOD_SOLVENCIA, CAPITAL_SOCIAL, ACC_STRESS_PCT } from "./constants";
import { sampleStdev } from "./stats";
import { VOL_MENU_AVG } from "./instruments";
import { CLAIMS_INFLATION_ANNUAL } from "../generation/constants";
import { DEV_FRAC } from "../reserving/constants";
import type { LiabilitySchedule } from "../reserving/liability";
import type { TeamDevelopment } from "../reserving/development";
import type { MarketRiskAtYearEnd } from "./alm";

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
  /** Decision-only concentration ratio of the tree (see portfolioConcentrationRatio() in alm.ts) — feeds rConcentracion, independent of avgVol. */
  concentrationRatio: number;
  /** Realized yield (income ÷ average invested balance) — see almSimRealYear()'s doc comment. Used to project Año 3's rinv off what the portfolio actually earned instead of its nominal `portYield`; undefined falls back to `portYield`. */
  effectiveYield?: number;
  /** This year's real year-end Caja Mínima balance (see AlmRealYearResult.cajaFinalAnio) — feeds the Balance's `caja` line, replacing the old flat FZ.cajaPct×primaEmitida approximation. */
  cajaFinalAnio: number;
  /** This year's real, undiminished year-end portfolio book value from prima-flow reinvestment alone (see AlmRealYearResult.portfolioBookValue) — feeds the Balance's `inversiones` line together with the team's own non-committed Capital Social (added separately in balance(), never by this ALM run itself — the real ALM only ever reinvests prima cash flow, never Capital Social, see almSimRealYear()'s doc comment). */
  portfolioBookValue: number;
}

export interface YearResult {
  totalPremium: number;
  claimsAmount: number;
  /** Real policy count that year — needed only for the Año 3 prima projection (retained + new); undefined falls back to the flat FZ.growth3 projection. */
  insuredCount?: number;
}

export interface PnL {
  /** What was actually collected/written this year — the raw fact, never itself a formula of other lines. */
  primaEmitida: number;
  /** 20% of the PRIOR year's own primaEmitida, released this year (0 for Año 1 — no prior year to release). */
  rpndLiberada: number;
  /** 20% of THIS year's own primaEmitida, held back as unearned (Reserva de Prima No Devengada) — same number as this year's Balance `rpnd`. */
  rpndConstituida: number;
  /** primaEmitida − rpndConstituida + rpndLiberada — a genuine roll-forward of a 1-year unearned-premium reserve, not a flat 80% of primaEmitida (the two only coincide in Año 1, or when premium is flat year over year). This is the revenue RT is built from, not primaEmitida. */
  primaDevengada: number;
  /** Accident-year ultimate of THIS year's own claims only — never touched by a prior year's late emergence/development (see finBench()'s doc comment on why that used to leak in). */
  costo: number;
  gadq: number;
  gcom: number;
  gadm: number;
  /** Resultado Técnico = primaDevengada − costo − gadq − gcom. Deliberately excludes gadm — see `ri`. "Ajuste de siniestralidad" (a team's own correction of its Día 2 Costo de Siniestros A1 guess, graded in concepts.ts against the true year1.claimsAmount) is a separate reported P&G line that the team's own RT formula subtracts — it's not part of this true/reference rt, since it depends on what the team itself submitted, not a pure engine fact. */
  rt: number;
  /** Resultado Industrial = rt − gadm. The line gadm actually lands on, separated from the underwriting-only `rt`. */
  ri: number;
  rinv: number;
  /** uai = ri + rinv (was rt + rinv). */
  uai: number;
  imp: number;
  uneta: number;
  reservas: number;
  pagos?: number | null;
  portYield2?: number;
}

export interface BalanceSheet {
  reservasTec: number;
  /** Reserva de Prima No Devengada — same number as this year's PnL.rpndConstituida, a liability alongside reservasTec. */
  rpnd: number;
  patrimonio: number;
  /** This year's real year-end Caja Mínima balance from the real ALM (AlmYearBenchInput.cajaFinalAnio) — falls back to the flat FZ.cajaPct×primaEmitida approximation only when there's no real ALM decision to simulate from at all. */
  caja: number;
  cxc: number;
  cxp: number;
  /** Real economic fact — this year's real ALM portfolio book value (prima-flow reinvestment only) plus the team's own non-committed Capital Social (max(0, CAPITAL_SOCIAL − capitalComprometido), invested separately from the prima-only ALM tree) — never a balancing residual. */
  inversiones: number;
  /** max(0, capitalComprometido − CAPITAL_SOCIAL) — a LIABILITY line (added into pasivo by the caller, never into activos), nonzero only once a team has drawn more Capital Social than it started with: the excess had to come from fresh financing (equity or debt) raised beyond the original endowment. Zero for every team that never exhausts its Capital Social — the common case. See balance()'s doc comment for why this must live on the liability side, not the asset side. */
  necesidadesPatrimonioODeuda: number;
  /** caja + inversiones + cxc. Because caja/inversiones are real, independently-computed facts (not solved for), this generally does NOT sum to the exact same peso as Pasivo+Patrimonio — a small residual is a known property of this simplified model (see README §4.3), not something necesidadesPatrimonioODeuda is meant to absorb. */
  activos: number;
}

export interface FinBenchResult {
  resTotal: number;
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
  /** Solvency capital charge for portfolio concentration, independent of volatility — see rConcentracion. */
  solRConc: number;
  /** The concentrationRatio (0-1) rConcentracion is charged on — see portfolioConcentrationRatio(). */
  solConcRatio: number;
  /** Día 4 equity-risk capital charge (exposición × ACC_STRESS_PCT) — see FinBenchInput.accBookValue2. Folded into solRk via CORR_MOD_SOLVENCIA's 5th row/column. */
  solRAcciones: number;
  solRk: number;
  solFp: number;
  solMargen: number;
  div: number;
  /** Adverse-direction NAV move at end of Año 2 under a real-curve shock — see computeMarketRiskAtAño2End() in alm.ts. Reported/graded as `riesgo_tasa` in concepts.ts, NOT folded into solRk (a NAV-mismatch figure, not a capital charge). 0 when there's no real Año 2 ALM to value from. */
  riesgoTasa: number;
  /** Same shape as riesgoTasa, but shocking the implied-inflation curve instead — see `riesgo_inflacion` in concepts.ts. */
  riesgoInflacion: number;
  /**
   * Sample standard deviation (n−1) of siniestralidad/Prima Emitida
   * (`costo / primaEmitida`) across Año 1, Año 2 and Año 3 (proyectado) —
   * the team's OWN realized underwriting volatility, replacing the old
   * flat FZ.primeVol as rPrimas's volatility factor (see rPrimas below and
   * FZ.primeVol's own comment for why capacity.ts still needs that flat
   * rate). Reported/graded as `sol_sigmaLR` in concepts.ts.
   */
  solSigmaLR: number;
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
  /** Riesgo de tasa/riesgo de inflación (see computeMarketRiskAtAño2End in alm.ts), computed by the caller (finBenchHelper.ts) from the team's real Año-2-end positions + post-Año-2 liability schedule — finBench() just threads these through, it has no access to raw Position[] data itself. null/undefined when there's no real Año 2 ALM to value from. */
  marketRisk?: MarketRiskAtYearEnd | null;
  /** ACC book value the team's real ALM ends up holding at the end of Año 2 (see computeFinBenchBundlesForCohort in finBenchHelper.ts) — feeds solRAcciones = accBookValue2 × ACC_STRESS_PCT. */
  accBookValue2?: number;
}

/**
 * Builds one year's P&L from primaEmitida down to uneta. `rpndLiberada` is
 * the one input that can't be derived from this year's own data — the
 * prior year's own 20% holdback, passed in by the caller (0 for Año 1).
 */
function pyg(primaEmitida: number, rpndLiberada: number, costo: number, rinv: number, reservas: number): PnL {
  const rpndConstituida = FZ.rpndPct * primaEmitida;
  const primaDevengada = primaEmitida - rpndConstituida + rpndLiberada;
  const gadq = FZ.gAdq * primaEmitida;
  const gcom = FZ.gCom * primaEmitida;
  const gadm = FZ.gAdmin * primaEmitida;
  const rt = primaDevengada - costo - gadq - gcom;
  const ri = rt - gadm;
  const uai = ri + rinv;
  const imp = FZ.tax * Math.max(0, uai);
  return {
    primaEmitida,
    rpndLiberada,
    rpndConstituida,
    primaDevengada,
    costo,
    gadq,
    gcom,
    gadm,
    rt,
    ri,
    rinv,
    uai,
    imp,
    uneta: uai - imp,
    reservas,
  };
}

/**
 * capitalComprometido subtracts directly from patrimonio — it's the real
 * consequence of the real Día 2 ALM having had to draw on Capital Social to
 * meet a cash-flow shortfall neither LIQ nor the rest of the (prima-funded)
 * portfolio could cover (see almSimRealYear's step 4 in alm.ts). This is a
 * lasting equity hit, not something the year's ordinary P&L (retenido)
 * already captures — the P&L reflects accrual-basis annual profitability,
 * this reflects a within-year cash-timing failure.
 *
 * inversiones is a real economic fact, not a plug: the real ALM's own
 * year-end portfolio book value (funded exclusively by prima cash flow —
 * see almSimRealYear's doc comment on why Capital Social never runs through
 * that simulation) plus the team's own Capital Social not drawn on to cover
 * a shortfall (`capital0 − capitalComprometido`, floored at 0 — Capital
 * Social can't fund a shortfall it doesn't have). caja is likewise a real
 * fact: the real ALM's own year-end Caja Mínima balance, not a flat
 * percentage of annual premium. Both fall back to the old flat-percentage/
 * zero treatment when there's no real ALM to draw from at all (no decision
 * submitted, or Año 3 — never simulated, see finBench()'s own doc comment
 * on p3).
 *
 * necesidadesPatrimonioODeuda is deliberately narrow: it's only ever
 * nonzero once capitalComprometido exceeds the team's entire starting
 * Capital Social (`capital0 − capitalComprometido` would otherwise go
 * negative) — the team ran out of Capital Social to draw on and still
 * needed more to keep Caja Mínima met, so that excess has to come from
 * fresh financing raised beyond what it started with, not from Capital
 * Social itself. It sits on the LIABILITY side (added into pasivo by the
 * caller, alongside reservasTec/rpnd/cxp — never into activos): the exact
 * same capitalComprometido is already subtracted once from patrimonio
 * (equity side) and once from inversiones (asset side, via the floor at 0);
 * adding the excess back into activos would double-count that deduction's
 * sign, not undo it — verified empirically (see finBench.test.ts) that
 * booking it as a liability instead keeps the Activos-vs-Pasivo+Patrimonio
 * gap identical whether or not the clamp triggers, so this line's presence
 * never interacts with (or masks) any other line — it purely reports "this
 * team spent more than its entire Capital Social." This is NOT the line
 * that forces the sheet to close in general — caja/inversiones being real,
 * independently-computed facts (not solved for) means Activos and
 * Pasivo+Patrimonio generally don't sum to the exact same peso even for a
 * healthy team; that small residual is a known property of this simplified
 * model (see README §4.3), not something this line is meant to absorb.
 */
function balance(
  pygY: PnL | null,
  capital0: number,
  retenido: number,
  capitalComprometido: number,
  almYear: AlmYearBenchInput | null
): BalanceSheet | null {
  if (!pygY) return null;
  const reservasTec = pygY.reservas;
  const rpnd = pygY.rpndConstituida;
  const patrimonio = capital0 + retenido - capitalComprometido;
  const caja = almYear ? almYear.cajaFinalAnio : FZ.cajaPct * pygY.primaEmitida;
  const cxc = (FZ.diasRotacionCxc * pygY.primaEmitida) / 365;
  const cxp = FZ.cxpPct * pygY.primaEmitida;
  const capitalSocialInvertido = Math.max(0, capital0 - capitalComprometido);
  const necesidadesPatrimonioODeuda = Math.max(0, capitalComprometido - capital0);
  const inversiones = (almYear?.portfolioBookValue ?? 0) + capitalSocialInvertido;
  return {
    reservasTec,
    rpnd,
    patrimonio,
    caja,
    cxc,
    cxp,
    inversiones,
    necesidadesPatrimonioODeuda,
    activos: caja + inversiones + cxc,
  };
}

/**
 * Central financial benchmark: builds the Year 1-3 P&L, a simplified balance
 * sheet, and Solvency-II-style capital requirement (underwriting + financial
 * + operational + concentration + equity risk combined via a correlation
 * matrix, see CORR_MOD_SOLVENCIA). Used both to
 * auto-grade uploaded financial deliverables (scoreConcepto) and to compute
 * solvency ratio / dividends (Day 4). Ported from finBench() in the legacy
 * prototype, line ~1113 — same formulas, but parameterized on plain inputs
 * instead of reading mutable globals (SIM_RES/SIM_RES2/FIN/BENCH_CACHE).
 */
export function finBench(input: FinBenchInput): FinBenchResult {
  const { year1, year2, liabilityYear1, development, almYear1, almYear2, year2Retention, marketRisk, accBookValue2 } = input;

  // Always the true remaining unpaid ultimate (siniestralidad − pagos, from
  // computeLiabilitySchedules()'s real payment-kernel timing) — never a
  // market-wide IBNR estimate, and never switches meaning depending on
  // whether Año 2's development happens to be available yet.
  const reservas1 = liabilityYear1.reserva || 0;

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
  const portYield = almYear1 ? almYear1.portYield : 0.05;
  const rinv1 = almYear1 ? almYear1.income : reservas1 * 0.05;
  // Año 1 has no prior year to release RPND from.
  const p1 = pyg(year1.totalPremium, 0, year1.claimsAmount, rinv1, reservas1);

  let p2: PnL | null = null;
  let reservas2 = 0;
  if (year2 && development) {
    const alm2 = almYear2 ?? almYear1;
    const portYield2 = alm2 ? alm2.portYield : portYield;
    reservas2 = development.reservaFinY2;
    const rinv2 = alm2 ? alm2.income : reservas2 * portYield2;
    // Releases Año 1's own RPND holdback; costo is Año 2's own accident-year
    // ultimate only (development.ultY2) — Año 1's late-emerging claims were
    // already recognized in Año 1's own costo (see liability.ts/development.ts:
    // severity is fixed at generation time regardless of notice lag, so
    // year1.claimsAmount was already the true full ultimate). A team's own
    // correction of a wrong Día-2 Costo de Siniestros A1 guess is reported
    // as its own "Ajuste de siniestralidad" P&G line (concepts.ts), graded
    // against year1.claimsAmount minus the team's own submitted p1_costo —
    // not something this pure engine computation has any input for.
    const rpndLiberada2 = FZ.rpndPct * year1.totalPremium;
    p2 = pyg(year2.totalPremium, rpndLiberada2, development.ultY2, rinv2, reservas2);
    p2.pagos = development.pagosY2;
    p2.portYield2 = portYield2;
  } else if (year2) {
    const alm2 = almYear2 ?? almYear1;
    const portYield2 = alm2 ? alm2.portYield : portYield;
    const ratio = year1.claimsAmount > 0 ? reservas1 / year1.claimsAmount : 0.4;
    reservas2 = year2.claimsAmount * ratio;
    const rinv2 = alm2 ? alm2.income : reservas2 * portYield2;
    const rpndLiberada2 = FZ.rpndPct * year1.totalPremium;
    p2 = pyg(year2.totalPremium, rpndLiberada2, year2.claimsAmount, rinv2, reservas2);
    p2.pagos = null;
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
    const avgPremiumPerPolicy2 = p2.primaEmitida / year2.insuredCount;
    const prima3 = insuredCount3 * avgPremiumPerPolicy2;

    // Costo: only Año 3's own (projected) accident-year claims — frequency
    // held at Año 2's observed rate, severity inflated by
    // CLAIMS_INFLATION_ANNUAL (the same rate the engine already uses for
    // Año1->Año2, reused as-is — see that constant's doc comment for why
    // this isn't double-counted against the Chile real-trend clue).
    // devTailY1InY3/devTailY2InY3 (Año 1's/Año 2's real, exact final
    // payment tranches landing in calendar Año 3) are deliberately NOT added
    // here anymore — that money was already recognized as incurred cost in
    // its own accident year's P&G (Año 1's/Año 2's `costo`, both already
    // true ultimates — see liability.ts/development.ts). Including it again
    // in Año 3 would double-count it; it's purely a Balance-side reserve
    // run-off from here (see reservas3 below), with no further P&G effect.
    const frecuencia2 = development.claimCountY2 / year2.insuredCount;
    const severidad2 = development.ultY2 / development.claimCountY2;
    const severidad3 = severidad2 * (1 + CLAIMS_INFLATION_ANNUAL);
    const siniestrosNuevosAño3 = insuredCount3 * frecuencia2 * severidad3;
    const costo3 = siniestrosNuevosAño3;

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

    // Releases Año 2's own RPND holdback.
    const rpndLiberada3 = FZ.rpndPct * year2.totalPremium;
    p3 = pyg(prima3, rpndLiberada3, costo3, rinv3, reservas3);
  } else if (p2) {
    // Fallback: the flat growth-rate projection, unchanged, for whenever the
    // richer inputs above aren't available yet.
    const g = 1 + FZ.growth3;
    reservas3 = reservas2 * g;
    const rpndLiberada3 = p2.rpndConstituida;
    p3 = pyg(p2.primaEmitida * g, rpndLiberada3, p2.costo * g, reservas3 * portYield, reservas3);
  }

  // Every team starts from the same fixed Capital Social (see constants.ts)
  // instead of a premium-based capital0 — otherwise a team's own pricing
  // choice would indirectly change how much capital cushion its ALM gets,
  // which has nothing to do with the risk it's actually carrying.
  const capital0 = CAPITAL_SOCIAL;
  const capitalComprometidoY1 = almYear1?.capitalComprometido ?? 0;
  const almY2 = almYear2 ?? almYear1;
  const capitalComprometidoY2 = almY2?.capitalComprometido ?? 0;
  const bal1 = balance(p1, capital0, p1.uneta, capitalComprometidoY1, almYear1)!;
  const bal2 = p2 ? balance(p2, capital0, p1.uneta + p2.uneta, capitalComprometidoY2, almY2) : null;
  // Year 3 is a projection, not an independently ALM-simulated year (see
  // README §5) — there's no third ALM run to measure a real erosion from,
  // so capitalComprometido is projected off the Año1->Año2 trend instead of
  // just carrying Año 2's checkpoint flat forward. capitalComprometido is
  // cumulative and never repays itself on its own (see alm.ts), so the
  // Y1->Y2 delta is always >= 0; projecting the same delta forward is the
  // same "no new erosion assumed" outcome in the common case (delta = 0)
  // but continues a real trend when one exists.
  const capitalComprometidoY3 = capitalComprometidoY2 + (capitalComprometidoY2 - capitalComprometidoY1);
  // No real ALM run exists for Año 3 (never simulated, see p3 above) — caja
  // and inversiones fall back to the same flat-percentage/Capital-Social-only
  // treatment balance() already applies whenever there's no ALM decision at
  // all, rather than inventing a speculative projected portfolio value.
  const bal3 = p3 ? balance(p3, capital0, p1.uneta + p2!.uneta + p3.uneta, capitalComprometidoY3, null) : null;

  const balN = bal2 || bal1;
  const pygN = p2 || p1;
  const reservasN = pygN.reservas;
  // solSigmaLR needs all 3 years' true costo/primaEmitida — only available
  // once p2/p3 exist (from Día 3 onward). finBench() is also called earlier
  // (Día 2 grading, year2 undefined) with only Año 1 known; falls back to
  // the old flat FZ.primeVol then, since nothing reads solRk/rPrimas as a
  // graded figure before Día 4 anyway.
  const solSigmaLR = p2 && p3 ? sampleStdev([p1.costo / p1.primaEmitida, p2.costo / p2.primaEmitida, p3.costo / p3.primaEmitida]) : FZ.primeVol;
  // Premium risk (rSusc) and rOp are sized off primaEmitida, not
  // primaDevengada — the same base gastos use (see PnL.primaEmitida's doc
  // comment): premium risk is about the volume of business written, not
  // how much of it has earned out yet.
  const rPrimas = pygN.primaEmitida * solSigmaLR;
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
  const rOp = FZ.opPct * pygN.primaEmitida;
  // Concentration risk, independent of volRatio above — see
  // portfolioConcentrationRatio()'s doc comment on why a low-volatility
  // single-instrument portfolio (e.g. 100% CDT90) still pays this even
  // though it barely moves rFin. A team with no ALM decision at all falls
  // back to 0 (no data to charge from), unlike volRatio's 1 — there's no
  // pre-concentration legacy default this needs to match.
  const concRatio = almN?.concentrationRatio ?? 0;
  const rConc = FZ.concRiskPct * balN.inversiones * concRatio;
  // Equity risk: exposición × riesgo (see ACC_STRESS_PCT's doc comment) —
  // exposición is the ACC book value the caller's real ALM ended up
  // holding at the end of Año 2 (finBenchHelper.ts), not derived from
  // anything finBench() itself computes.
  const rAcciones = (accBookValue2 ?? 0) * ACC_STRESS_PCT;
  const R = [rSusc, rFin, rOp, rConc, rAcciones];
  let rk2 = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) rk2 += CORR_MOD_SOLVENCIA[i][j] * R[i] * R[j];
  const rk = Math.sqrt(rk2);
  const fondosPropios = balN.patrimonio;
  const margen = rk > 0 ? fondosPropios / rk : 0;
  const dividendos = Math.max(0, fondosPropios - rk * FZ.targetMargin);

  return {
    resTotal: reservas1,
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
    solRConc: rConc,
    solConcRatio: concRatio,
    solRAcciones: rAcciones,
    solRk: rk,
    solFp: fondosPropios,
    solMargen: margen,
    div: dividendos,
    solSigmaLR,
    riesgoTasa: marketRisk?.riesgoTasa ?? 0,
    riesgoInflacion: marketRisk?.riesgoInflacion ?? 0,
  };
}
