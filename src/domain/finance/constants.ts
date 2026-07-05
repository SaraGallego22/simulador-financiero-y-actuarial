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
