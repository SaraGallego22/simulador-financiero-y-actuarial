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
  opPct: 0.03,
  targetMargin: 1.5,
  cajaPct: 0.15,
  cxcPct: 0.07,
  cxpPct: 0.1,
  growth3: 0.06,
};

/** Correlation matrix between underwriting/financial/operational risk. Ported from CORR_MOD, line ~1071. */
export const CORR_MOD = [
  [1, 0.75, 1],
  [0.75, 1, 1],
  [1, 1, 1],
];

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
 * of ≈ $273.9B COP; of that, ≈86.1% remains as the post-Year-1 reserve
 * (computeLiabilitySchedules — most development, even for early-year
 * claims, falls past month 12 once the notice lag + 3-month
 * notice-to-payment lag + 3-year development pattern are layered, see
 * README §3) — a reference reserve of ≈$235.9B COP. Applying the same
 * capital-adequacy ratio finBench already used for capital0 pre-this-change
 * (30%, ex-FZ.cap0Pct) gives ≈$70.8B COP; rounded to a clean $70B.
 *
 * This single constant now also drives finBench()'s capital0 (see §4/§5 in
 * README) — replacing the old premium-based FZ.cap0Pct*totalPremium, since
 * capital social is meant to be the same starting point for every team,
 * every year, in both the fictitious ALM and the real P&L/Balance it feeds.
 */
export const CAPITAL_SOCIAL = 70_000_000_000;
