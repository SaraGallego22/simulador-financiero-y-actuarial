/** Financial engine constants, ported verbatim from FZ in the legacy prototype, line ~1065. */
export const FZ = {
  gAdq: 0.04,
  gCom: 0.15,
  gAdmin: 0.06,
  tax: 0.3,
  /**
   * Flat premium-risk volatility used ONLY by capacity.ts's market-share cap
   * (riskCapitalForPremium(), run during Año 1/Año 2 market clearing) —
   * finBench()'s own Día 4 rPrimas no longer uses this constant, it uses
   * each team's own realized solSigmaLR (sample stdev of siniestralidad/
   * prima across Año 1/2/3, see FinBenchResult.solSigmaLR and sol_sigmaLR in
   * concepts.ts) instead. capacity.ts can't do the same because it runs
   * BEFORE those 3 years of loss-ratio data exist — it still needs a single
   * reference rate to size a quota ahead of the market clearing that
   * determines each team's actual siniestralidad, so it keeps this flat
   * value as a calibrated approximation, not a per-team fact.
   */
  primeVol: 0.1476,
  resVol: 0.3,
  corrPR: 0.75,
  /** Flat financial-risk rate used ONLY by capacity.ts's market-share cap (riskCapitalForPremium(), reusing CORR_MOD) — finBench()'s own Día 4 RK no longer charges a separate volatility-based financial-risk line at all (see rMercado in finBench.ts, which prices interest/inflation/equity risk directly off real curve shocks instead). Kept here because capacity.ts runs during market clearing, before a real Año-2-end portfolio to shock even exists. */
  finRiskPct: 0.066,
  /** Flat operational-risk rate used ONLY by capacity.ts's market-share cap, same reasoning as finRiskPct above — finBench()'s own Día 4 rOp uses opPctPrimas/opPctReservas instead (see below). */
  opPct: 0.03,
  /** Día 4 operational risk: max(primaEmitida al cierre de Año 2 × opPctPrimas, reserva técnica al cierre de Año 2 × opPctReservas) — see rOp in finBench.ts. Added to rBasico linearly (no correlation benefit), same as Solvencia II's own SCR = BSCR + SCR_operacional. */
  opPctPrimas: 0.04,
  opPctReservas: 0.013,
  targetMargin: 1.5,
  cajaPct: 0.15,
  /** Cuentas por cobrar (CxC): fórmula de días de cartera (DSO, days sales outstanding) — cxc = (diasRotacionCxc × primaEmitida) / 365. Reemplaza el antiguo 7% plano; GuiaPasanteDia3 solo comunica el supuesto de 30 días de rotación de cartera, no esta fórmula, para que cada equipo la derive por su cuenta. */
  diasRotacionCxc: 30,
  /** Cuentas por pagar (CxP): misma lógica de rotación de cartera que cxc (DSO), pero sobre gastos en vez de prima — cxp = (diasRotacionCxp × gastos) / 365, con gastos = GASTOS_TOTAL_PCT × primaEmitida (comisión + adquisición + administración, ver GASTOS_TOTAL_PCT en este archivo). Reemplaza el antiguo 10% plano de primaEmitida (FZ.cxpPct): un CxP dimensionado sobre gastos es lo que factura realmente el proveedor (comisiones e intermediación), no la prima que la aseguradora cobra. */
  diasRotacionCxp: 30,
  growth3: 0.06,
  /** Reserva de Prima No Devengada (RPND): the fraction of each year's own Prima Emitida held back as unearned — see PnL's rpndConstituida/rpndLiberada in finBench.ts. A 1-year unearned-premium model: what's held back this year is fully released next year, so the Balance's RPND liability at any year's close is simply this same 20% of that year's own Prima Emitida. */
  rpndPct: 0.2,
  /** Día 3's "Ajuste de siniestralidad A1" P&G line (concepts.ts, p2_ajusteSiniestralidad): a fixed, one-time release of the true reserva técnica A1 (bal1_reservasTec), narrated in the Guía del Pasante as an actuarial-team review finding that 2027's remaining unpaid severity was overestimated by this fraction. Independent of what a team itself submitted for Costo de Siniestros A1 on Día 2 — not a correction of a team's own guess. */
  sevRevisionA1Pct: 0.1,
  /** Día 4 EVA (Valor Económico Agregado) deliverable: classic corporate-finance definition, EVA = Utilidad Neta − costoCapital × capital invertido, with capital invertido taken as `solFp` (fondos propios/patrimonio) rather than the Solvency-II `solRk` requirement — this is a return-on-equity story (did the team's own capital earn more than its opportunity cost), not a regulatory-capital one. 10% for now, matching a plausible cost of equity for an insurer in an emerging market; revisit if a real rubric calibration says otherwise. */
  costoCapital: 0.1,
};

/** Correlation matrix between underwriting/financial/operational risk. Ported from CORR_MOD, line ~1071. Stays 3x3 (Susc/Fin/Op) — capacity.ts's market-share cap reuses this exact matrix and assumes that shape; the concentration risk charge (Día 4 only, not part of capacity sizing) has its own extended matrix below instead of reshaping this one. */
export const CORR_MOD = [
  [1, 0.75, 1],
  [0.75, 1, 1],
  [1, 1, 1],
];

/**
 * Correlation matrix for finBench()'s Riesgo de Mercado sub-module, order
 * [riesgoTasa, riesgoInflacion, riesgoAcciones] — the three real-curve/
 * equity shocks valued at the end of Año 2 (see computeMarketRiskAtAño2End
 * in alm.ts and ACC_STRESS_PCT below). Tasa and inflación correlate 0.5
 * (both driven by the same nominal curve, but via genuinely different
 * mechanisms — a real-rate shock vs. an implied-inflation shock, see that
 * function's doc comment); acciones is priced off a flat regulatory stress
 * with no real link to the rate/inflation curves, so it's uncorrelated
 * (0) with both. rMercado itself then combines with rSusc (primas +
 * reservas, corrPR above) via the identity matrix — no assumed correlation
 * between underwriting and market risk — to form rBasico; rOp is added to
 * rBasico linearly on top (see finBench.ts).
 */
export const CORR_MERCADO = [
  [1, 0.5, 0],
  [0.5, 1, 0],
  [0, 0, 1],
];

/**
 * How much a Día 2 ALM decision's portfolio-concentration ratio (see
 * portfolioConcentrationRatio() in alm.ts) discounts the "Rendimiento"
 * sub-score's riskAdjustedYield: riskAdjustedYield = sharpeRatio −
 * CONCENTRATION_PENALTY_MU×concentrationRatio, where sharpeRatio =
 * (effYield − RISK_FREE_RATE) ÷ avgPortfolioVol (see scoreFinanciero() in
 * alm.ts; avgPortfolioVol is the correlation-aware portfolio volatility
 * from COVARIANCE_MATRIX, not a naive per-instrument average — see its own
 * doc comment in alm.ts). Additive, not multiplicative, deliberately —
 * sharpeRatio can go negative (a portfolio that underperforms
 * RISK_FREE_RATE after forced sales/capital comprometido), and a
 * multiplicative discount would make concentration look like it HELPS a
 * negative score (moving it toward 0 instead of further away). This is
 * what makes concentration a felt penalty on the same day the team makes
 * the decision, not something that only shows up in Día 4's solvency
 * capital charge (FZ.concRiskPct) three days later — a team should see a
 * worse Día 2 nota from concentrating, and understand why when it
 * separately has to reproduce a higher RK on Día 4.
 *
 * Calibrated (not just carried over from the old formula's 0.03 — that was
 * sized for `effYield` units, roughly [0.05, 0.12]; sharpeRatio lives on a
 * different scale, roughly [0, 1.6] across the menu, so the penalty needed
 * re-deriving from scratch) so that a genuinely diversified portfolio can
 * still beat a concentrated bet on the menu's single best-Sharpe instrument
 * (CDT90) even though CDT90 alone has the higher raw sharpeRatio — see
 * RISK_ADJUSTED_YIELD_MIN/MAX's doc comment in alm.ts for the reference
 * portfolios this was checked against.
 */
export const CONCENTRATION_PENALTY_MU = 0.5;

/** Total expense ratio (adquisición + comisión + administración), reused at
 * monthly granularity in the ALM ladder — same ratios finBench's pyg() uses
 * annually on the full-year premium. */
export const GASTOS_TOTAL_PCT = FZ.gAdq + FZ.gCom + FZ.gAdmin;

/** Expense ratio Resultado Técnico (RT) actually subtracts — adquisición + comisión only, deliberately excluding gAdmin (which now lands on its own line, Resultado Industrial = RT − gadm, see finBench.ts's pyg()). Kept apart from GASTOS_TOTAL_PCT (used by the ALM's cash-flow "Gastos" line, which still consumes all three) so the two ratios can't silently drift into meaning different things under the same name. */
export const RT_EXPENSE_PCT = FZ.gAdq + FZ.gCom;

/**
 * Capital social: every team's ALM simulation (almSim, see alm.ts) starts
 * from the SAME fixed equity base, deliberately independent of that team's
 * own priced premium (using premium would let a team's pricing choice
 * indirectly change how much capital cushion its ALM gets, which isn't the
 * point of this exercise — capital adequacy should be sized off the risk
 * being carried, i.e. claims, not off a number the team controls).
 *
 * Derivation (measured empirically against generateColombia(42), not
 * guessed — re-measure against the live generator rather than trust a
 * stale comment if severity generation ever changes again). Previously
 * this was sized with a flat "30% of reference reserve" shortcut (the same
 * ratio finBench used for capital0 pre-this-change, ex-FZ.cap0Pct) — that
 * shortcut doesn't match the actual formula that spends this capital
 * (riskCapitalForPremium in capacity.ts: rSusc/rFin/rOp combined via
 * CORR_MOD, not a flat percentage), so it silently undersized capacity:
 * $81B only supported ≈$179B of premium at CAPACITY_TARGET_MARGIN=1.0,
 * well under what a 10%-market-share team actually needs (see below) —
 * every team ended up capital-constrained regardless of how it priced.
 *
 * Corrected derivation inverts the real formula instead:
 * 1. A representative team holding ~10% of the 1,000,000-policy market has
 *    an expected total Year-1 incurred severity of ≈$237.1B COP (measured
 *    by scaling the full-universe total by 10%, not a single 100k-policy
 *    slice — the heavy gamma/outlier severity tail makes any one 100k
 *    slice noisy; the full-universe scale and a direct 100k slice agreed
 *    within ~2.5% of each other, confirming this isn't slice-dependent).
 * 2. ≈86.1% of that remains as the post-Year-1 reserve
 *    (computeLiabilitySchedules — most development, even for early-year
 *    claims, falls past month 12 once the notice lag + 3-month
 *    notice-to-payment lag + 3-year development pattern are layered, see
 *    README §3) — a reference reserve of ≈$204.2B COP. This ratio matches
 *    RESERVE_TO_INCURRED_RATIO in capacity.ts almost exactly (0.8616
 *    measured here vs. 0.861 there), confirming the same measurement
 *    methodology.
 * 3. That reserve implies a reference premium of ≈$256.5B COP via
 *    capacity.ts's own RESERVE_TO_PREMIUM_RATIO (reserve ÷ ratio — the
 *    same reserve/premium relationship riskCapitalForPremium() already
 *    assumes, so this doesn't invent a new loss-ratio assumption).
 * 4. Solving riskCapitalForPremium(referencePremium, capital, volRatio=1)
 *    for the capital that makes the solvency margin (capital ÷ risk
 *    capital) exactly CAPACITY_TARGET_MARGIN (1.0) at that premium — by
 *    binary search, the same way maxPremiumForCapital() itself solves the
 *    inverse direction — gives ≈$115.95B COP; rounded to a clean $116B.
 *    At $116B, a team pricing at the same reference loss ratio capacity.ts
 *    already assumes for the "healthy" band can sustain the full ~10%
 *    market share this constant was calibrated against without being
 *    capital-constrained — the old $81B could not.
 *
 * This single constant now also drives finBench()'s capital0 (see §4/§5 in
 * README) — replacing the old premium-based FZ.cap0Pct*totalPremium, since
 * capital social is meant to be the same starting point for every team,
 * every year, in both the fictitious ALM and the real P&L/Balance it feeds.
 */
export const CAPITAL_SOCIAL = 120_000_000_000;

/**
 * Día 4 equity-risk capital charge: riesgo de acciones = exposición ×
 * ACC_STRESS_PCT, exposición being the ACC book value a team ends up
 * holding at the end of Año 2 (see computeMarketRiskAtAño2End's sibling
 * computation in finBenchHelper.ts). One of the three Riesgo de Mercado
 * shocks (see CORR_MERCADO above), calibrated for this exercise rather
 * than copied from Solvencia II's own (much higher) "tipo 1" equity charge.
 */
export const ACC_STRESS_PCT = 0.2;

/**
 * How many months an ACC (renta variable) position stays open before its
 * proceeds roll back into that month's investable pool, under the Día 2
 * monthly-allocation model (see MonthlyAllocationEntry/PortfolioDecisionV4
 * in instruments.ts). Real equities have no fixed term, and since the team
 * no longer chooses a per-position duration (that was a Tranche-only
 * concept, removed along with onMaturity), the engine picks one instead —
 * 12 months, the same order as TES1's own term, long enough that ACC isn't
 * effectively as liquid as LIQ (which rolls every month) while still giving
 * teams a genuine yearly chance to rebalance out of it.
 */
export const ACC_ROLL_M = 12;
