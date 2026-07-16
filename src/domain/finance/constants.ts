/** Financial engine constants, ported verbatim from FZ in the legacy prototype, line ~1065. */
export const FZ = {
  gAdq: 0.1,
  gCom: 0.04,
  gAdmin: 0.06,
  tax: 0.3,
  primeVol: 0.1476,
  resVol: 0.3,
  corrPR: 0.75,
  finRiskPct: 0.066,
  /** Día 4 solvency capital charge for portfolio concentration — see rConcentracion in finBench.ts and CORR_MOD_CONCENTRACION below. A team maximally concentrated in a single risky instrument (portfolioConcentrationRatio=1) pays 3% of its inversiones on top of the volatility-based rFin charge; a fully spread risky sleeve pays nothing here. */
  concRiskPct: 0.03,
  opPct: 0.03,
  targetMargin: 1.5,
  cajaPct: 0.15,
  cxcPct: 0.07,
  cxpPct: 0.1,
  growth3: 0.06,
};

/** Correlation matrix between underwriting/financial/operational risk. Ported from CORR_MOD, line ~1071. Stays 3x3 (Susc/Fin/Op) — capacity.ts's market-share cap reuses this exact matrix and assumes that shape; the concentration risk charge (Día 4 only, not part of capacity sizing) has its own extended matrix below instead of reshaping this one. */
export const CORR_MOD = [
  [1, 0.75, 1],
  [0.75, 1, 1],
  [1, 1, 1],
];

/**
 * Correlation matrix for finBench()'s 4-component solvency capital
 * (underwriting/financial/operational/concentration risk), order [rSusc,
 * rFin, rOp, rConcentracion] — the first 3 rows/columns are CORR_MOD
 * unchanged, extended with a 4th for concentration risk. Real Solvency II
 * treats concentration as a market-risk sub-module alongside volatility
 * (not a separate top-level category like operational risk), which is why
 * it correlates with rFin (0.5 — related domain, but a genuinely different
 * driver: a low-volatility single-instrument portfolio scores high on
 * concentration and low on rFin, and vice versa for an evenly-spread but
 * individually volatile blend) more than with rSusc (0.75, same as rFin's
 * own correlation to rSusc — both are investment-side risks equally
 * distant from underwriting). Like rOp, it correlates 1 with everything
 * else — the same conservative "just add it" treatment CORR_MOD already
 * gives operational risk, extended consistently to this new component.
 */
export const CORR_MOD_CONCENTRACION = [
  [1, 0.75, 1, 0.75],
  [0.75, 1, 1, 0.5],
  [1, 1, 1, 1],
  [0.75, 0.5, 1, 1],
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
