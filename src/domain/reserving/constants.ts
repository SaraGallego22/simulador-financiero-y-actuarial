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

/**
 * How an accident year's own ultimate settles across the 12 months of that
 * same calendar year, as a share of the year's total — index 0 = January.
 * Convolves KERNEL with notices spread evenly over the year's 12 months, the
 * same convolution computeLiabilitySchedules() does claim by claim for the
 * real years; a projected year has no per-claim notice dates to convolve, so
 * the even spread is the assumption that replaces them.
 *
 * Front months are 0: nothing is paid until LAG_AVISO_PAGO months after
 * notice, so the profile ramps up through the year instead of being flat.
 * Its sum is much smaller than DEV_FRAC[0] — that constant is the share paid
 * in the first 12 months *from the first payment*, not within the accident
 * year, and using it as if it were the latter overstates within-year payments
 * by about 3x (measured: 17% vs 55%).
 */
export const ACCIDENT_YEAR_PAYMENT_SHARE: number[] = (() => {
  const share = new Array(12).fill(0);
  for (let noticeMonth = 0; noticeMonth < 12; noticeMonth++) {
    for (let m = 0; m < KERNEL.length; m++) {
      const calendarMonth = noticeMonth + m;
      if (calendarMonth < 12) share[calendarMonth] += KERNEL[m] / 12;
    }
  }
  return share;
})();

/** Fraction of an accident year's ultimate paid within that same calendar year (Σ ACCIDENT_YEAR_PAYMENT_SHARE) — the complement is what's still open at its close. */
export const PAID_WITHIN_ACCIDENT_YEAR = ACCIDENT_YEAR_PAYMENT_SHARE.reduce((s, v) => s + v, 0);

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
