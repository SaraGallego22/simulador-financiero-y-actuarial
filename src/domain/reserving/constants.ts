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
