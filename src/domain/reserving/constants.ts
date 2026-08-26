/**
 * Payment timing. A claim settles in full LAG_AVISO_PAGO months after it is
 * NOTICED — not after it occurs, which is what makes the reporting lag carry
 * essentially all of the liability's duration (see sampleReportingLag()).
 *
 * This replaces the legacy prototype's 3-development-year spread
 * (DEV_FRAC = [0.55, 0.30, 0.15], Chile-calibrated, ported at line ~1494-1501):
 * an accident year no longer drips out over 39 months, it closes out one
 * quarter after each claim is reported. The consequences are deliberate and
 * worth knowing before touching this: the technical reserve at a year's close
 * is now essentially IBNR plus the last quarter's notices, and every liability
 * the ALM has to fund is short-dated, so duration matching favours short
 * instruments far more than it used to.
 */
export const LAG_AVISO_PAGO = 3; // months between notice and payment
export const VAL_MONTH = 12; // valuation at month 12 (2028-01), counted from base year Jan
export const HORIZON = 96; // months the FICTITIOUS ALM projects past its build-up phase (see almSim) — not a reserving figure
export const BUILD_MONTHS = 12; // Year 1 premium build-up months

/** Hard ceiling on the reporting lag, in days (5 years) — see sampleReportingLag() in generation/dates.ts. */
export const LAG_AVISO_MAX_DIAS = 1825;

/**
 * Months of liability projection from the valuation date. Must outrun the
 * worst case a claim can reach: an accident in the last month of Año 2
 * (month 23), noticed LAG_AVISO_MAX_DIAS later (60 months) and paid
 * LAG_AVISO_PAGO after that, lands at month 86 — 74 past the valuation. A
 * separate constant from HORIZON on purpose — this one sizes the `L[]`
 * array (a reserving figure); HORIZON sizes almSim()'s own simulated run —
 * even though the two now share the same value: HORIZON was widened to 96
 * alongside this one so the fictitious ALM's simulated window covers the
 * whole liability tail instead of truncating lib.L partway through and
 * leaving late-tail claims funded but never actually paid out.
 */
export const LIABILITY_HORIZON = 96;

/** Monthly payment kernel from notice month (index 0 = month of notice): the whole ultimate lands on a single month. */
export function buildKernel(): number[] {
  const k = new Array(LAG_AVISO_PAGO + 1).fill(0);
  k[LAG_AVISO_PAGO] = 1;
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
 * The first LAG_AVISO_PAGO months are 0 and the rest are flat: with notices
 * spread evenly and every claim settling in one shot a quarter later, each
 * month from April on pays exactly one month's worth of notices. What doesn't
 * fit inside the year — the last quarter's notices — is what the reserve is.
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
 * generating the full 1M-exposure Colombia universe and comparing accident-
 * year-2027 true ultimate severity against what has been *noticed* by the
 * Día 3 report's own cutoff (end of 2028, i.e. ~24 months of development),
 * across 5 seeds (42, 1, 7, 123, 999): consistently 1.339-1.352, i.e.
 * 25.3-26.0% of the accident year still unreported at that point. That
 * reflects sampleReportingLag()'s lognormal(mu=5.5, sigma=1.2) (median
 * ~245 days) clamped to [1, LAG_AVISO_MAX_DIAS=1825] days — a genuinely
 * long, dispersed notice tail, which is what makes the tail factor a
 * first-order correction rather than a rounding adjustment.
 *
 * Re-measure if sampleReportingLag's parameters ever change again — sum
 * `sev` over accident-year-2027 claims, once in full and once restricted to
 * those with `fechaAvisoEpochDay` inside the report's cutoff, and divide.
 * An earlier revision of this comment still quoted 1.0029-1.0039 from the
 * old mu=3.0/730-day parameters long after they'd moved, which is worth
 * knowing about twice over: the Guía del Pasante's §2 prose ("cerca de una
 * cuarta parte") is calibrated to this number, and any cohort whose
 * TeamClaimAggregate rows were persisted before such a change keeps the OLD
 * notice dates while its downloadable CSV report regenerates from the
 * current generator — the two then disagree, and only re-running that
 * cohort's simulation reconciles them.
 */
export const CHAIN_LADDER_TAIL_FACTOR = 1.35;
