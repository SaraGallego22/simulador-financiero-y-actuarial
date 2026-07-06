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
  cap0Pct: 0.3,
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
