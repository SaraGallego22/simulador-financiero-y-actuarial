import { FZ, CORR_MERCADO, CAPITAL_SOCIAL, ACC_STRESS_PCT, GASTOS_TOTAL_PCT } from "./constants";
import { sampleStdev } from "./stats";
import { projectYear3 } from "./projectYear3";
import type { LiabilitySchedule } from "../reserving/liability";
import type { TeamDevelopment } from "../reserving/development";
import type { MarketRiskAtYearEnd } from "./alm";
import { OUTSOURCED_CONSULTING_FEE_PCT } from "../pricing/outsourced";

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
  /** Cumulative genuine external financing needed through the end of this year — subtracted directly from patrimonio in balance(), never folded into rinv (see that function's doc comment). Only nonzero once LIQ *and* the entire real portfolio, Capital Social included, were exhausted via ordinary forced liquidation — see almSimRealYear()'s doc comment in alm.ts. */
  capitalComprometido: number;
  /** Realized yield (income ÷ average invested balance) — see almSimRealYear()'s doc comment. Used to project Año 3's rinv off what the portfolio actually earned instead of its nominal `portYield`; undefined falls back to `portYield`. */
  effectiveYield?: number;
  /** This year's real year-end Caja Mínima balance (see AlmRealYearResult.cajaFinalAnio) — feeds the Balance's `caja` line, replacing the old flat FZ.cajaPct×primaEmitida approximation. */
  cajaFinalAnio: number;
  /** This year's real, undiminished year-end portfolio book value — includes Capital Social, funded into the tree at Año 1's start (see AlmRealYearResult.portfolioBookValue / almSimRealYear()'s doc comment) alongside every month's prima-flow reinvestment; they're mechanically indistinguishable positions by this point. Feeds the Balance's `inversiones` line directly — see balance() below. */
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
  /**
   * Gastos de adquisición. FZ.gAdq × primaEmitida normally — but a team that
   * used "Tercerizar tarifas" this year carries the consultancy's fee inside
   * this same line, at (FZ.gAdq + OUTSOURCED_CONSULTING_FEE_PCT) ×
   * primaEmitida. Pricing/underwriting work is an acquisition cost — what it
   * takes to put the business on the books — not general overhead, so it
   * belongs here rather than in gadm, and it does land inside RT: a team that
   * paid someone else to build its tariff genuinely had a worse underwriting
   * result. See OUTSOURCED_CONSULTING_FEE_PCT in domain/pricing/outsourced.ts,
   * and computeRt() in grading/composite.ts, which mirrors this.
   */
  gadq: number;
  gcom: number;
  /**
   * A one-time release of FZ.sevRevisionA1Pct (10%) of Año 1's OWN
   * remaining share of the reserve as of Año 2's close (development's
   * osY1endY2, not Año 1's full 2027 closing reserve) — an actuarial-team
   * finding, recognized in Año 2, that 2027's remaining unpaid severity was
   * overestimated. Negative (a release, not a cost) — 0 for every year
   * except Año 2 (see p2_ajusteSiniestralidad in concepts.ts, which grades
   * this exact figure). A REAL economic event, not just a reporting line:
   * it both raises `rt` (below) and reduces `reservas` by the same amount
   * — see `reservas`'s own doc comment for why both have to move together
   * for the Balance to keep closing. Based on osY1endY2 rather than the
   * full 2027 closing reserve specifically so it can never release more
   * than what's actually still outstanding (see finBench()'s own
   * releaseY1Magnitude doc comment).
   */
  ajusteSiniestralidad: number;
  /** Resultado Técnico = primaDevengada − costo − ajusteSiniestralidad − gadq − gcom. Deliberately excludes gadm — see `ri`. */
  rt: number;
  gadm: number;
  /** Resultado Industrial = rt − gadm. The line gadm actually lands on, separated from the underwriting-only `rt`. */
  ri: number;
  rinv: number;
  /** uai = ri + rinv (was rt + rinv). */
  uai: number;
  imp: number;
  uneta: number;
  /**
   * Reserva técnica at this year's close, feeding this year's Balance
   * `reservasTec` directly. For Año 2 this already has `ajusteSiniestralidad`
   * netted in (see pyg()) — the real reserve genuinely is lower once that
   * release is recognized, not just the reported RT.
   */
  reservas: number;
  pagos?: number | null;
  portYield2?: number;
}

export interface BalanceSheet {
  reservasTec: number;
  /** Reserva de Prima No Devengada — same number as this year's PnL.rpndConstituida, a liability alongside reservasTec. */
  rpnd: number;
  /** capital0 + retenido, minus whatever capitalComprometido that patrimonio itself could absorb — can still be negative, purely from retenido (accumulated losses), reported as-is with no floor. capitalComprometido beyond what patrimonio had is never subtracted further here — see necesidadesPatrimonioODeuda and balance()'s doc comment for why. */
  patrimonio: number;
  /** This year's real year-end Caja Mínima balance from the real ALM (AlmYearBenchInput.cajaFinalAnio) — falls back to the flat FZ.cajaPct×primaEmitida approximation only when there's no real ALM decision to simulate from at all. */
  caja: number;
  cxc: number;
  cxp: number;
  /** Real economic fact — this year's real ALM portfolio book value, which already includes Capital Social (funded into the tree at Año 1's start, see AlmYearBenchInput.portfolioBookValue) — never a balancing residual. */
  inversiones: number;
  /** Whatever capitalComprometido is left after patrimonio absorbed as much of it as it had available — genuinely external financing (equity or debt) beyond everything the team had. A LIABILITY line (added into pasivo by the caller, never into activos). Zero for the vast majority of teams. See balance()'s doc comment for why this can't just be more negative patrimonio. */
  necesidadesPatrimonioODeuda: number;
  /** Cumulative unpaid income tax through the end of THIS year — every year's own PnL.imp to date (p1.imp for bal1, p1.imp+p2.imp for bal2, ...), not just this year's own, since the real ALM cash flow never models a tax payment in ANY year (see almSimRealYear()'s doc comment in alm.ts): a prior year's tax bill is exactly as unpaid at this year's close as it was at its own. Standard "Impuesto por pagar" liability, the same treatment rpnd/cxp already get. Without this line (or using only this year's own imp instead of the cumulative sum), Activos ran ahead of Pasivo+Patrimonio by whatever prior years' unpaid tax bills were missing — the dominant driver of Año 2's Balance not squaring. */
  impuestoPorPagar: number;
  /** caja + inversiones + cxc. */
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
  /** Día 4 Riesgo de Mercado: riesgoTasa/riesgoInflacion/solRAcciones combined via CORR_MERCADO (tasa-inflación correlated 0.5, ambos con acciones en 0). */
  solRMercado: number;
  solROp: number;
  /** Día 4 equity-risk capital charge (exposición × ACC_STRESS_PCT) — see FinBenchInput.accBookValue2. Folds into solRMercado (and from there into solRk) via CORR_MERCADO. */
  solRAcciones: number;
  solRk: number;
  solFp: number;
  solMargen: number;
  div: number;
  /** Adverse-direction NAV move at end of Año 2 under a real-curve shock — see computeMarketRiskAtAño2End() in alm.ts. Reported/graded as `riesgo_tasa` in concepts.ts AND folded into solRk via solRMercado/CORR_MERCADO. 0 when there's no real Año 2 ALM to value from. */
  riesgoTasa: number;
  /** Same shape as riesgoTasa, but shocking the implied-inflation curve instead — see `riesgo_inflacion` in concepts.ts. */
  riesgoInflacion: number;
  /**
   * Sample standard deviation (n−1) of siniestralidad/Prima Devengada
   * (`costo / primaDevengada`) across Año 1, Año 2 and Año 3 (proyectado) —
   * the team's OWN realized underwriting volatility, on the same earned-
   * premium base as computeRt()/RT itself (loss ratio is a performance
   * measure — how much of what was actually earned went to claims — same
   * reasoning that keeps rt built on primaDevengada, see PnL.rt's doc
   * comment), replacing the old flat FZ.primeVol as rPrimas's volatility
   * factor (see rPrimas below and FZ.primeVol's own comment for why
   * capacity.ts still needs that flat rate). Reported/graded as
   * `sol_sigmaLR` in concepts.ts.
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
  /** Año 3's real-ALM continuation, funded by the *projected* prima3 and paying the *projected* Año 3 claims schedule (see projectYear3.ts and finBenchHelper.ts) — the same 12-month machinery Año 1/Año 2 use, on the positions the team genuinely holds at the end of Año 2. Undefined/null falls back to the closed-form `reservas3 × effectiveYield` estimate this used to be. */
  almYear3?: AlmYearBenchInput | null;
  /** Año 2's real retained-vs-new policy split (from TeamSimResult.extra) — needed only for the Año 3 prima projection; undefined falls back to the flat FZ.growth3 projection. */
  year2Retention?: { retainedCount: number; newCount: number };
  /** Riesgo de tasa/riesgo de inflación (see computeMarketRiskAtAño2End in alm.ts), computed by the caller (finBenchHelper.ts) from the team's real Año-2-end positions + post-Año-2 liability schedule — finBench() just threads these through, it has no access to raw Position[] data itself. null/undefined when there's no real Año 2 ALM to value from. */
  marketRisk?: MarketRiskAtYearEnd | null;
  /** ACC book value the team's real ALM ends up holding at the end of Año 2 (see computeFinBenchBundlesForCohort in finBenchHelper.ts) — feeds solRAcciones = accBookValue2 × ACC_STRESS_PCT. */
  accBookValue2?: number;
  /**
   * Whether the team used "Tercerizar tarifas" for Año 1 / Año 2 — each year
   * independently, since a team can outsource one year and price its own book
   * the next. Drives that year's own PnL.gConsultoria (see its doc comment);
   * Año 3 never carries a fee, since it's a projection off a book the team is
   * assumed to be pricing itself by then, not another engagement.
   */
  outsourcedYear1?: boolean;
  outsourcedYear2?: boolean;
}

/**
 * Builds one year's P&L from primaEmitida down to uneta. `rpndLiberada` is
 * the one input that can't be derived from this year's own data — the
 * prior year's own 20% holdback, passed in by the caller (0 for Año 1).
 * `consultingFeePct` is 0 for every team that priced its own book, and
 * OUTSOURCED_CONSULTING_FEE_PCT for a year the team outsourced its tariff —
 * it raises that year's acquisition expense ratio rather than adding a line
 * of its own (see PnL.gadq). `ajusteSiniestralidad` is 0 for every year
 * except Año 2 (see PnL.ajusteSiniestralidad) — it's a real release, so it
 * both raises `rt` and reduces `reservas` by the same amount, here, in one
 * place, so the two can never drift apart.
 */
function pyg(
  primaEmitida: number,
  rpndLiberada: number,
  costo: number,
  rinv: number,
  reservas: number,
  consultingFeePct = 0,
  ajusteSiniestralidad = 0
): PnL {
  const rpndConstituida = FZ.rpndPct * primaEmitida;
  const primaDevengada = primaEmitida - rpndConstituida + rpndLiberada;
  const gadq = (FZ.gAdq + consultingFeePct) * primaEmitida;
  const gcom = FZ.gCom * primaEmitida;
  const gadm = FZ.gAdmin * primaEmitida;
  const rt = primaDevengada - costo - ajusteSiniestralidad - gadq - gcom;
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
    ajusteSiniestralidad,
    rt,
    ri,
    rinv,
    uai,
    imp,
    uneta: uai - imp,
    // ajusteSiniestralidad is negative (a release), so this reduces the
    // reserve by exactly the amount `rt` gained — see PnL.reservas's doc
    // comment.
    reservas: reservas + ajusteSiniestralidad,
  };
}

/**
 * patrimonio has no floor from retenido (accumulated losses): a team that
 * lost more than capital0+retenido could cover is, correctly, insolvent on
 * paper — pure accrual, nothing to reconcile it against, so it's reported
 * as-is.
 *
 * capitalComprometido is different, and DOES need the split below
 * (absorbidoPorPatrimonio / necesidadesPatrimonioODeuda): it's the real
 * consequence of the real Día 2 ALM having had LIQ *and* its entire
 * remaining real portfolio (Capital Social included — funded into the tree
 * at Año 1's start, see almSimRealYear() in alm.ts) all exhausted by a
 * cash-flow shortfall, and still needing more (see almSimRealYear's step 4).
 * Once that happens, almSimRealYear() keeps funding Caja Mínima from that
 * external draw rather than letting `caja` go negative (impossible — you
 * can't hold negative cash) — so capitalComprometido is already doing work
 * on the ASSET side: it's what holds `caja`/`inversiones` at their reported,
 * non-catastrophic values. Subtracting the FULL capitalComprometido from
 * patrimonio on top of that would double-count it — once invisibly (propping
 * up caja) and once explicitly (subtracting from equity) — and `caja` stays
 * flat no matter how large capitalComprometido gets while patrimonio would
 * keep falling without limit, so the gap between them grows unboundedly
 * (measured: up to 21× Activos in some scenarios — see finBench.test.ts).
 * retenido has no equivalent asset-side floor effect (nothing about a bad
 * underwriting year props up `caja`), which is exactly why it doesn't need
 * this same treatment.
 *
 * So: capitalComprometido consumes existing patrimonio first
 * (absorbidoPorPatrimonio — min(capitalComprometido, max(0, patrimonio
 * before it))), and only the excess beyond what patrimonio had becomes
 * necesidadesPatrimonioODeuda, a genuinely external-financing LIABILITY line
 * (added into pasivo by the caller, never into activos) — the cash it
 * brought in was spent paying claims the same month, so it shows up as a
 * lower reserve, not as an asset. In practice the absorbed part is usually
 * zero: reaching capitalComprometido > 0 at all already requires having
 * exhausted LIQ and the entire portfolio (Capital Social included), and a
 * team that got there has typically already burned through its patrimonio
 * via a bad year's retenido first — but if patrimonio (before
 * capitalComprometido) was still positive, it absorbs what it can, floors at
 * zero from THIS cause specifically, and only the true excess becomes
 * necesidadesPatrimonioODeuda. This never double-counts: absorbidoPorPatrimonio
 * and necesidadesPatrimonioODeuda are `min`/subtracted-remainder of the same
 * amount, never both the full capitalComprometido.
 *
 * inversiones is a real economic fact when a real ALM exists (Año 1/2), not a
 * plug: it's the real ALM's own year-end portfolio book value, which already
 * includes Capital Social (see AlmYearBenchInput.portfolioBookValue's doc
 * comment) — no separate "non-committed Capital Social" term added on top of
 * it anymore; that would double-count what's already inside
 * portfolioBookValue. caja is likewise a real fact: the real ALM's own
 * year-end Caja Mínima balance, not a flat percentage of annual premium.
 * Both fall back to the old flat-percentage/Capital-Social-at-capital0
 * treatment when there's no real ALM decision submitted at all. Año 3 now
 * has an ALM of its own too (almYear3 — a genuine continuation on the team's
 * real Año-2-end positions, funded by projected flows), so it reads these
 * lines the same way Año 1/Año 2 do; `solveInversiones=true` survives only
 * for the case where no ALM ran at all, where nothing independent exists for
 * a plug to override.
 *
 * caja/inversiones being real, independently-computed facts (not solved for)
 * means nothing here guarantees Activos = Pasivo+Patrimonio by construction;
 * as of the cxcHoldback0/cxpHoldback0 adjustment in almSimRealYear() (alm.ts)
 * making the real ALM's own cash mechanics genuinely consistent with cxc/cxp
 * instead of silently assuming zero collection/payment lag, plus
 * impuestoAcumulado below being the cumulative unpaid tax rather than just
 * this year's own, Año 1/2 now close exactly for the same reason Año 3 always
 * has (see README §4.3) — there's no remaining residual left to document as
 * "known and small".
 */
function balance(
  pygY: PnL | null,
  capital0: number,
  retenido: number,
  capitalComprometido: number,
  almYear: AlmYearBenchInput | null,
  impuestoAcumulado: number,
  solveInversiones?: boolean
): BalanceSheet | null {
  if (!pygY) return null;
  const reservasTec = pygY.reservas;
  const rpnd = pygY.rpndConstituida;
  const patrimonioAntesDeComprometer = capital0 + retenido;
  const absorbidoPorPatrimonio = Math.min(capitalComprometido, Math.max(0, patrimonioAntesDeComprometer));
  const patrimonio = patrimonioAntesDeComprometer - absorbidoPorPatrimonio;
  const caja = almYear ? almYear.cajaFinalAnio : FZ.cajaPct * pygY.primaEmitida;
  const cxc = (FZ.diasRotacionCxc * pygY.primaEmitida) / 365;
  const cxp = (FZ.diasRotacionCxp * GASTOS_TOTAL_PCT * pygY.primaEmitida) / 365;
  const necesidadesPatrimonioODeuda = capitalComprometido - absorbidoPorPatrimonio;
  // Impuesto por pagar: the real ALM never models a tax payment as a real
  // cash outflow, in ANY year (see AlmYearBenchInput's doc comment) — so
  // it's not just THIS year's own tax expense (pygY.imp) still unpaid, it's
  // every prior year's too, since none of them was ever paid either.
  // impuestoAcumulado is the caller's running sum (p1.imp for bal1, p1.imp +
  // p2.imp for bal2, etc — see finBench()'s own call sites) — using only
  // pygY.imp here would leave Año 2's Balance short by exactly Año 1's own
  // unpaid tax bill, since patrimonio (via retenido) already subtracted it.
  const impuestoPorPagar = impuestoAcumulado;
  const pasivo = reservasTec + rpnd + cxp + necesidadesPatrimonioODeuda + impuestoPorPagar;
  // solveInversiones is the last resort: no ALM run at all behind this year
  // (not even Año 3's projected continuation), so every line is a mechanical
  // convention and inversiones solves for whatever balances the sheet, the
  // way a pro-forma projection plugs its cash line. This is NOT the old
  // "residual that hides everything" pattern (§4.3's caveat), which was
  // about never overriding a real ALM fact with a plug — when one exists,
  // `almYear` above wins and this branch is never reached.
  const inversiones = almYear
    ? almYear.portfolioBookValue
    : solveInversiones
      ? Math.max(0, pasivo + patrimonio - caja - cxc)
      : Math.max(0, capital0 - capitalComprometido);
  return {
    reservasTec,
    rpnd,
    patrimonio,
    caja,
    cxc,
    cxp,
    inversiones,
    necesidadesPatrimonioODeuda,
    impuestoPorPagar,
    activos: caja + inversiones + cxc,
  };
}

/**
 * Central financial benchmark: builds the Year 1-3 P&L, a simplified balance
 * sheet, and Solvency-II-style standard-formula capital requirement, in two
 * levels — Riesgo de Mercado (riesgoTasa/riesgoInflacion/riesgoAcciones,
 * combined via CORR_MERCADO) and Riesgo de Suscripción (primas/reservas,
 * combined via corrPR) combine into rBasico via the identity matrix (no
 * assumed correlation between the two), then Riesgo Operacional is added to
 * rBasico linearly (not correlated — same "just add it" treatment
 * Solvencia II itself gives operational risk) to get the Total, rk. Used
 * both to auto-grade uploaded financial deliverables (scoreConcepto) and to
 * compute solvency ratio / dividends (Day 4). Ported from finBench() in the
 * legacy prototype, line ~1113 — same P&L/Balance formulas as always, but
 * parameterized on plain inputs instead of reading mutable globals
 * (SIM_RES/SIM_RES2/FIN/BENCH_CACHE).
 */
export function finBench(input: FinBenchInput): FinBenchResult {
  const { year1, year2, liabilityYear1, development, almYear1, almYear2, almYear3, year2Retention, marketRisk, accBookValue2 } = input;
  const feePct1 = input.outsourcedYear1 ? OUTSOURCED_CONSULTING_FEE_PCT : 0;
  const feePct2 = input.outsourcedYear2 ? OUTSOURCED_CONSULTING_FEE_PCT : 0;

  // Always the true remaining unpaid ultimate (siniestralidad − pagos, from
  // computeLiabilitySchedules()'s real payment-kernel timing) — never a
  // market-wide IBNR estimate, and never switches meaning depending on
  // whether Año 2's development happens to be available yet.
  const reservas1 = liabilityYear1.reserva || 0;

  // Magnitude (positive) of Año 2's "Ajuste de siniestralidad" release — see
  // PnL.ajusteSiniestralidad and p2_ajusteSiniestralidad in concepts.ts. 10%
  // of Año 1's OWN remaining share of the reserve as of Año 2's close
  // (development.osY1endY2), not 10% of Año 1's full 2027 closing reserve
  // (reservas1/bal1.reservasTec): most of that original balance is typically
  // already paid out by the time Año 2 closes, so basing the release on the
  // 2027 figure could release more than what's actually still outstanding,
  // driving the reserve negative. Basing it on osY1endY2 — itself one of the
  // two components development.reservaFinY2 sums — guarantees the release
  // can never exceed what's left: 10% of a non-negative quantity taken out
  // of that same quantity's own sum never pushes the total below the other
  // component's share. 0 without development — the release only applies
  // once real per-origin development is available.
  const releaseY1Magnitude = development ? FZ.sevRevisionA1Pct * development.osY1endY2 : 0;

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
  const p1 = pyg(year1.totalPremium, 0, year1.claimsAmount, rinv1, reservas1, feePct1);

  let p2: PnL | null = null;
  let reservas2 = 0;
  if (year2 && development) {
    const alm2 = almYear2 ?? almYear1;
    const portYield2 = alm2 ? alm2.portYield : portYield;
    reservas2 = development.reservaFinY2;
    // Reduces reservas2 and raises p2.rt by the same amount (both inside
    // pyg(), from this one input), so the Balance keeps closing: Pasivo
    // drops by this much (reservasTec), Patrimonio rises by this much (via
    // uneta), Activos never moves (it's a real ALM fact, untouched by this).
    const ajusteSiniestralidad2 = -releaseY1Magnitude;
    const rinv2 = alm2 ? alm2.income : (reservas2 + ajusteSiniestralidad2) * portYield2;
    // Releases Año 1's own RPND holdback; costo is Año 2's own accident-year
    // ultimate only (development.ultY2) — Año 1's late-emerging claims were
    // already recognized in Año 1's own costo (see liability.ts/development.ts:
    // severity is fixed at generation time regardless of notice lag, so
    // year1.claimsAmount was already the true full ultimate).
    const rpndLiberada2 = FZ.rpndPct * year1.totalPremium;
    p2 = pyg(year2.totalPremium, rpndLiberada2, development.ultY2, rinv2, reservas2, feePct2, ajusteSiniestralidad2);
    p2.pagos = development.pagosY2;
    p2.portYield2 = portYield2;
  } else if (year2) {
    // No development yet, so no genuine osY1endY2 to base a release on —
    // Ajuste de siniestralidad only ever applies once real per-origin
    // development is available (see the branch above).
    const alm2 = almYear2 ?? almYear1;
    const portYield2 = alm2 ? alm2.portYield : portYield;
    const ratio = year1.claimsAmount > 0 ? reservas1 / year1.claimsAmount : 0.4;
    reservas2 = year2.claimsAmount * ratio;
    const rinv2 = alm2 ? alm2.income : reservas2 * portYield2;
    const rpndLiberada2 = FZ.rpndPct * year1.totalPremium;
    p2 = pyg(year2.totalPremium, rpndLiberada2, year2.claimsAmount, rinv2, reservas2, feePct2);
    p2.pagos = null;
    p2.portYield2 = portYield2;
  }

  // Año 3 has no market of its own and no accident year of its own, so its
  // P&G is projected from what Año 1 and Año 2 really produced
  // (projectYear3.ts — the same function finBenchHelper.ts runs to fund and
  // pay Año 3's ALM continuation, so both sides describe one Año 3, not two).
  let p3: PnL | null = null;
  let reservas3 = 0;
  const proj3 =
    p2 && year2 && development && year1.insuredCount != null && year2.insuredCount != null && year2Retention
      ? projectYear3({
          year1InsuredCount: year1.insuredCount,
          year2InsuredCount: year2.insuredCount,
          year2PrimaEmitida: p2.primaEmitida,
          year2Retention,
          claimCountY2: development.claimCountY2,
          ultY2: development.ultY2,
          osY1endY3: development.osY1endY3,
          osY2endY3: development.osY2endY3,
          paidY2inY2: development.paidY2inY2,
        })
      : null;
  if (proj3 && p2 && year2 && development) {
    // The Año 2 release is permanent — once that slice of Año 1's reserve is
    // gone, it stays gone — so Año 3's own closing reserve carries the same
    // release forward too, not just Año 2's. No new RT event for Año 3
    // itself (see the p3 pyg() calls below, which never pass an
    // ajusteSiniestralidad of their own) — only the Balance-side baseline
    // persists. Scaled proportionally (FZ.sevRevisionA1Pct of Año 3's OWN
    // osY1endY3, not a fixed dollar amount carried over from Año 2) — this
    // is the same uniform-scaling reasoning finBenchHelper.ts's tailAnio1
    // comment lays out: development.osY1endY2 splits exactly into "what
    // pays out during Año 3" (the ALM's real tail) plus osY1endY3 (what's
    // still open after Año 3), so scaling osY1endY3 down by the same
    // FZ.sevRevisionA1Pct that scales the tail removes exactly
    // FZ.sevRevisionA1Pct × osY1endY2 in total either way you look at it —
    // never negative, and never more than what's actually still owed.
    reservas3 = proj3.reservas3 - FZ.sevRevisionA1Pct * development.osY1endY3;

    // Resultado de inversiones: Año 3's own ALM continuation earns it, on
    // the positions the team actually holds at the end of Año 2 — same
    // machinery as rinv1/rinv2, so the base doesn't silently change between
    // Año 2 and Año 3. Without a real Año 2 ALM to continue from there's
    // nothing to run, and this falls back to the closed-form estimate it
    // used to be: the realized yield applied to Año 3's reservas. That
    // fallback understates a genuine portfolio (which also holds Capital
    // Social and the accumulated premium float, both far larger than the
    // technical reserve), which is exactly why it's only a fallback now.
    const rinv3 = almYear3 ? almYear3.income : reservas3 * (almYear2?.effectiveYield ?? portYield);

    // Releases Año 2's own RPND holdback.
    const rpndLiberada3 = FZ.rpndPct * year2.totalPremium;
    p3 = pyg(proj3.prima3, rpndLiberada3, proj3.costo3, rinv3, reservas3);
  } else if (p2) {
    // Fallback: the flat growth-rate projection, unchanged, for whenever the
    // richer inputs above aren't available yet. Grows off p2.reservas (the
    // already-adjusted Año 2 closing reserve), not the raw pre-ajuste
    // reservas2, so the permanent reduction still carries forward here too.
    const g = 1 + FZ.growth3;
    reservas3 = p2.reservas * g;
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
  const bal1 = balance(p1, capital0, p1.uneta, capitalComprometidoY1, almYear1, p1.imp)!;
  const bal2 = p2 ? balance(p2, capital0, p1.uneta + p2.uneta, capitalComprometidoY2, almY2, p1.imp + p2.imp) : null;
  // Año 3's capital comprometido and its Balance's asset side come from its
  // own ALM continuation (almYear3), exactly like Año 1's and Año 2's do —
  // `caja` from that year's real Caja Mínima at close, `inversiones` from
  // its own year-end book value, `capitalComprometido` from whatever the
  // year actually had to commit. The inputs that fund and drain it are
  // projections (prima3, the projected claims schedule — see
  // projectYear3.ts), but the portfolio it runs on is genuinely the one the
  // team holds at Año 2's close.
  //
  // Before that continuation existed there was no Año 3 ALM at all, and
  // `inversiones` had to be solved as the plug that closed the sheet. Two
  // cheaper approximations were tried and rejected first, both checked
  // against a live cohort, and they're worth remembering as traps if this is
  // ever reworked: (1) extrapolating portfolioBookValue's raw Año1->Año2
  // dollar delta overshoots badly, because that delta is dominated by a full
  // year of gross premium inflow, one to two orders of magnitude bigger than
  // a year's net retained profit; (2) carrying Año 2's inversiones forward by
  // Año 3's own equity growth misses reserve run-off entirely — a team whose
  // reservasTec drains between Año 2 and Año 3 sees that cash leave the
  // portfolio without patrimonio ever moving (the expense was booked in the
  // accident year; paying it is Dr reserva / Cr caja), which produced gaps
  // over 100% of Pasivo+Patrimonio for a shrinking book.
  const capitalComprometidoY3 = almYear3 ? almYear3.capitalComprometido : capitalComprometidoY2 + (capitalComprometidoY2 - capitalComprometidoY1);
  const retenidoY3 = p1.uneta + (p2 ? p2.uneta : 0) + (p3 ? p3.uneta : 0);
  const impuestoAcumuladoY3 = p1.imp + (p2 ? p2.imp : 0) + (p3 ? p3.imp : 0);
  // solveInversiones (the balancing plug) only when no Año 3 ALM ran —
  // same fallback path as rinv3 above.
  const bal3 = p3 ? balance(p3, capital0, retenidoY3, capitalComprometidoY3, almYear3 ?? null, impuestoAcumuladoY3, !almYear3) : null;

  const balN = bal2 || bal1;
  const pygN = p2 || p1;
  const reservasN = pygN.reservas;
  // solSigmaLR needs all 3 years' true costo/primaDevengada — only available
  // once p2/p3 exist (from Día 3 onward). finBench() is also called earlier
  // (Día 2 grading, year2 undefined) with only Año 1 known; falls back to
  // the old flat FZ.primeVol then, since nothing reads solRk/rPrimas as a
  // graded figure before Día 4 anyway.
  const solSigmaLR = p2 && p3 ? sampleStdev([p1.costo / p1.primaDevengada, p2.costo / p2.primaDevengada, p3.costo / p3.primaDevengada]) : FZ.primeVol;
  // rPrimas itself still applies that volatility rate to primaEmitida, not
  // primaDevengada — the same base gastos use (see PnL.primaEmitida's doc
  // comment): premium risk-capital is about the volume of business written
  // (how much is currently on risk), not how much of it has earned out
  // yet — solSigmaLR only changed *how the rate itself is measured*
  // (against earned premium, a genuine performance ratio), not what it's
  // then applied to (written premium, an exposure/volume figure).
  const rPrimas = pygN.primaEmitida * solSigmaLR;
  const rReservas = reservasN * FZ.resVol;
  const rSusc = Math.sqrt(rPrimas * rPrimas + rReservas * rReservas + 2 * FZ.corrPR * rPrimas * rReservas);

  // Riesgo de Mercado: riesgoTasa/riesgoInflacion (real-curve/implied-
  // inflation shocks at the end of Año 2, see computeMarketRiskAtAño2End in
  // alm.ts) plus riesgoAcciones (exposición × ACC_STRESS_PCT — exposición
  // is the ACC book value the caller's real ALM ended up holding at the end
  // of Año 2, finBenchHelper.ts), combined via CORR_MERCADO.
  const riesgoTasa = marketRisk?.riesgoTasa ?? 0;
  const riesgoInflacion = marketRisk?.riesgoInflacion ?? 0;
  const rAcciones = (accBookValue2 ?? 0) * ACC_STRESS_PCT;
  const Rm = [riesgoTasa, riesgoInflacion, rAcciones];
  let rMercado2 = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rMercado2 += CORR_MERCADO[i][j] * Rm[i] * Rm[j];
  const rMercado = Math.sqrt(rMercado2);

  // Básico (BSCR): Mercado ⊕ Suscripción via the identity matrix — no
  // assumed correlation between market and underwriting risk, so this is
  // just Pythagorean combination, not a full matrix multiply.
  const rBasico = Math.sqrt(rMercado * rMercado + rSusc * rSusc);

  // Riesgo operacional: the worse of a primas-based and a reservas-based
  // charge (Solvencia II's own standard-formula shape for this module) —
  // added to rBasico linearly below, not correlated.
  const rOp = Math.max(FZ.opPctPrimas * pygN.primaEmitida, FZ.opPctReservas * reservasN);

  const rk = rBasico + rOp;
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
    solRMercado: rMercado,
    solROp: rOp,
    solRAcciones: rAcciones,
    solRk: rk,
    solFp: fondosPropios,
    solMargen: margen,
    div: dividendos,
    solSigmaLR,
    riesgoTasa,
    riesgoInflacion,
  };
}
