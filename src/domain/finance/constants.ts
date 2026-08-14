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
  finRiskPct: 0.066,
  /** Día 4 solvency capital charge for portfolio concentration — see rConcentracion in finBench.ts and CORR_MOD_CONCENTRACION below. A team maximally concentrated in a single risky instrument (portfolioConcentrationRatio=1) pays 3% of its inversiones on top of the volatility-based rFin charge; a fully spread risky sleeve pays nothing here. */
  concRiskPct: 0.03,
  opPct: 0.03,
  targetMargin: 1.5,
  cajaPct: 0.15,
  /** Cuentas por cobrar (CxC): fórmula de días de cartera (DSO, days sales outstanding) — cxc = (diasRotacionCxc × primaEmitida) / 365. Reemplaza el antiguo 7% plano; GuiaPasanteDia3 solo comunica el supuesto de 30 días de rotación de cartera, no esta fórmula, para que cada equipo la derive por su cuenta. */
  diasRotacionCxc: 30,
  cxpPct: 0.1,
  growth3: 0.06,
  /** Reserva de Prima No Devengada (RPND): the fraction of each year's own Prima Emitida held back as unearned — see PnL's rpndConstituida/rpndLiberada in finBench.ts. A 1-year unearned-premium model: what's held back this year is fully released next year, so the Balance's RPND liability at any year's close is simply this same 20% of that year's own Prima Emitida. */
  rpndPct: 0.2,
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
 * Correlation matrix for finBench()'s 5-component solvency capital
 * (underwriting/financial/operational/concentration/equity risk), order
 * [rSusc, rFin, rOp, rConcentracion, rAcciones]. The first 4 rows/columns
 * are what used to be CORR_MOD_CONCENTRACION (itself CORR_MOD, 3x3,
 * extended with a 4th for concentration risk — concentration correlates
 * 0.5 with rFin, a related domain but a genuinely different driver: a
 * low-volatility single-instrument portfolio scores high on concentration
 * and low on rFin, and vice versa for an evenly-spread but individually
 * volatile blend — and 0.75 with rSusc, same as rFin's own correlation
 * there, both investment-side risks equally distant from underwriting).
 * The 5th row/column (rAcciones — see ACC_STRESS_PCT, riesgo de acciones
 * in Día 4) follows the same extension logic: 0.75 vs. rSusc (same
 * investment-side distance as rFin/rConc), 0.75 vs. rFin (closely related
 * driver — ACC concentration already feeds rFin's volRatio too), 0.5 vs.
 * rConc (same value and reasoning as rFin<->rConc: a small ACC sleeve
 * inside an otherwise-spread portfolio can score low concentration yet
 * nonzero rAcciones). Like rOp, every module correlates 1 with it — the
 * same conservative "just add it" treatment CORR_MOD already gives
 * operational risk.
 */
export const CORR_MOD_SOLVENCIA = [
  [1, 0.75, 1, 0.75, 0.75],
  [0.75, 1, 1, 0.5, 0.75],
  [1, 1, 1, 1, 1],
  [0.75, 0.5, 1, 1, 0.5],
  [0.75, 0.75, 1, 0.5, 1],
];

/**
 * How much a Día 2 ALM decision's portfolio-concentration ratio (see
 * portfolioConcentrationRatio() in alm.ts) discounts the "Rendimiento"
 * sub-score's riskAdjustedYield, the same mechanism VOL_PENALTY_LAMBDA
 * already uses for volatility: riskAdjustedYield = effYield −
 * VOL_PENALTY_LAMBDA×avgVol − CONCENTRATION_PENALTY_MU×concentrationRatio
 * (see scoreFinanciero() in alm.ts). This is what makes concentration a
 * felt penalty on the same day the team makes the decision, not something
 * that only shows up in Día 4's solvency capital charge (FZ.concRiskPct)
 * three days later — a team should see a worse Día 2 nota from
 * concentrating, and understand why when it separately has to reproduce a
 * higher RK on Día 4.
 */
export const CONCENTRATION_PENALTY_MU = 0.03;

/** Total expense ratio (adquisición + comisión + administración), reused at
 * monthly granularity in the ALM ladder — same ratios finBench's pyg() uses
 * annually on the full-year premium. */
export const GASTOS_TOTAL_PCT = FZ.gAdq + FZ.gCom + FZ.gAdmin;

/** Expense ratio Resultado Técnico (RT) actually subtracts — adquisición + comisión only, deliberately excluding gAdmin (which now lands on its own line, Resultado Industrial = RT − gadm, see finBench.ts's pyg()). Kept apart from GASTOS_TOTAL_PCT (used by the ALM's cash-flow "Gastos" line, which still consumes all three) so the two ratios can't silently drift into meaning different things under the same name. */
export const RT_EXPENSE_PCT = FZ.gAdq + FZ.gCom;

/**
 * How much a portfolio's realized volatility discounts its "Rendimiento"
 * ALM sub-score: riskAdjustedYield = effYield - VOL_PENALTY_LAMBDA*avgVol
 * (see scoreFinanciero() in alm.ts). Calibrated (against the yields/
 * volAnual in instruments.ts) so that, of the whole instrument menu,
 * TESUVR8 has the single best risk-adjusted yield and ACC the worst —
 * deliberately: any λ in (0.143, 0.625) preserves that ordering, 0.35 sits
 * comfortably in the middle of that range rather than at either edge.
 * Recheck this ordering with instruments.test.ts if either file's numbers
 * change.
 */
export const VOL_PENALTY_LAMBDA = 0.35;

/**
 * Capital social: every team's ALM simulation (almSim, see alm.ts) starts
 * from the SAME fixed equity base, deliberately independent of that team's
 * own priced premium (using premium would let a team's pricing choice
 * indirectly change how much capital cushion its ALM gets, which isn't the
 * point of this exercise — capital adequacy should be sized off the risk
 * being carried, i.e. claims, not off a number the team controls).
 *
 * Derivation (measured empirically against generateColombia(42), not
 * guessed): a representative team holding ~10% of the 1,000,000-policy
 * market (100,000 policies) has an expected total Year-1 incurred severity
 * of ≈ $313.9B COP (re-measured after OUTLIER_CLAIM_PROBABILITY/
 * OUTLIER_CLAIM_MULTIPLIER were added to generation/constants.ts — the same
 * reference was ≈$273.9B before catastrophic-outlier claims existed at all;
 * always re-measure this against the live generator rather than trust a
 * stale comment if severity generation changes again); of that, ≈86.1%
 * remains as the post-Year-1 reserve (computeLiabilitySchedules — most
 * development, even for early-year claims, falls past month 12 once the
 * notice lag + 3-month notice-to-payment lag + 3-year development pattern
 * are layered, see README §3) — a reference reserve of ≈$270.3B COP.
 * Applying the same capital-adequacy ratio finBench already used for
 * capital0 pre-this-change (30%, ex-FZ.cap0Pct) gives ≈$81.1B COP; rounded
 * to a clean $81B.
 *
 * This single constant now also drives finBench()'s capital0 (see §4/§5 in
 * README) — replacing the old premium-based FZ.cap0Pct*totalPremium, since
 * capital social is meant to be the same starting point for every team,
 * every year, in both the fictitious ALM and the real P&L/Balance it feeds.
 */
export const CAPITAL_SOCIAL = 81_000_000_000;

/**
 * Día 4 equity-risk capital charge: riesgo de acciones = exposición ×
 * ACC_STRESS_PCT, exposición being the ACC book value a team ends up
 * holding at the end of Año 2 (see computeMarketRiskAtAño2End's sibling
 * computation in finBenchHelper.ts). No in-repo precedent for this figure
 * — 39% is Solvencia II's own standard-formula charge for "tipo 1"
 * (listed/developed-market) equities, taken as the reference value in the
 * absence of one, not derived from anything else in this engine.
 */
export const ACC_STRESS_PCT = 0.39;

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
