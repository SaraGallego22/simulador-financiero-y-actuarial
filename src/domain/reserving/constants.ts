/**
 * Payment development pattern (Chile-calibrated, 3 development years), ported
 * from DEV_FRAC/LAG_AVISO_PAGO/VAL_MONTH/HORIZON/BUILD_MONTHS in the legacy
 * prototype, line ~1494-1501.
 */
export const DEV_FRAC = [0.55, 0.3, 0.15]; // year 0, 1, 2
export const LAG_AVISO_PAGO = 3; // fixed months between notice and first payment
export const VAL_MONTH = 12; // valuation at month 12 (2028-01), counted from base year Jan
export const HORIZON = 48; // months of liability projection from the valuation date
export const BUILD_MONTHS = 12; // Year 1 premium build-up months

/** Monthly payment kernel from notice month (index 0 = month of notice). Ported from buildKernel(). */
export function buildKernel(): number[] {
  const k = new Array(LAG_AVISO_PAGO + 36).fill(0);
  for (let m = 0; m < 36; m++) {
    const devYear = Math.floor(m / 12);
    k[LAG_AVISO_PAGO + m] = DEV_FRAC[devYear] / 12;
  }
  return k;
}

export const KERNEL = buildKernel();

/** Cumulative kernel: fraction of ultimate paid within d months of notice. Ported from CUMK. */
export const CUMULATIVE_KERNEL: number[] = (() => {
  const c = new Array(KERNEL.length);
  let s = 0;
  for (let i = 0; i < KERNEL.length; i++) {
    s += KERNEL[i];
    c[i] = s;
  }
  return c;
})();

export function cumulativeKernelAt(daysAfterNotice: number): number {
  if (daysAfterNotice < 0) return 0;
  if (daysAfterNotice >= CUMULATIVE_KERNEL.length) return 1;
  return CUMULATIVE_KERNEL[daysAfterNotice];
}

/**
 * Chain Ladder tail factor a team is given directly in the Día 3 guide (§2)
 * to take its own 24-month-developed (avisado en su año o el siguiente)
 * claims total to true ultimate. Unlike the age-to-age factor (12→24
 * months), which a team must compute from its own two-diagonal triangle,
 * this can't be derived from a team's own report — it depends on the
 * reporting-lag tail beyond the report's own cutoff, which a team has no
 * visibility into. Verified empirically (not derived analytically) by
 * generating the full 1M-exposure Colombia universe and comparing true
 * ultimate severity against severity reported by notice year <= año de
 * ocurrencia + 1, across 5 seeds (42, 1, 7, 123, 999): consistently 1.0029-
 * 1.0039, reflecting sampleReportingLag()'s lognormal(mu=3.0, sigma=1.2)
 * distribution (median ~20 days) clamped to [1, 730] days — the vast
 * majority of claims are reported well within 24 months, so only a small
 * sliver remains genuinely unreported even at that point.
 */
export const CHAIN_LADDER_TAIL_FACTOR = 1.003;
