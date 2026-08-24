import type { Rng } from "./rng";
import { lognormalRand } from "./rng";
import { MONTHLY_SEASONALITY, DAYS_IN_MONTH } from "./constants";
import { LAG_AVISO_MAX_DIAS } from "../reserving/constants";

/**
 * Samples a claim occurrence date within `baseYear`, weighted by monthly
 * seasonality. Ported from muestrearFechaSiniestro() (line ~2467).
 */
export function sampleClaimDate(r: Rng, baseYear: number): Date {
  const weights: number[] = [];
  for (let m = 0; m < 12; m++) weights.push(MONTHLY_SEASONALITY[m] * DAYS_IN_MONTH[m]);
  const total = weights.reduce((a, b) => a + b, 0);
  const u = r() * total;
  let acc = 0;
  let month = 0;
  for (let i = 0; i < 12; i++) {
    acc += weights[i];
    if (u <= acc) {
      month = i;
      break;
    }
  }
  const day = Math.floor(r() * DAYS_IN_MONTH[month]) + 1;
  return new Date(baseYear, month, day);
}

/**
 * Samples the reporting lag (days between occurrence and notice), clamped to
 * [1, LAG_AVISO_MAX_DIAS] — the source of the platform's IBNR opacity, and
 * now of most of the liability's duration too.
 *
 * Recalibrated from lognormal(3.0, 1.2)/730 days when claims stopped being
 * paid over three development years and started settling in full one quarter
 * after notice (see buildKernel() in reserving/constants.ts). That change on
 * its own collapsed the time from occurrence to payment from 17.0 to 4.3
 * months; moving the delay into the reporting lag puts it back at 17.1, so
 * the ALM still has to fund a liability of the same duration.
 *
 * The trade is deliberate and worth knowing: with notice this slow, ~61% of
 * an accident year's claims are still unreported at its close (it was ~7%),
 * and only ~82% are known at 24 months, which is what CHAIN_LADDER_TAIL_FACTOR
 * has to cover. Measured on 200k samples with occurrences spread evenly over
 * the year.
 */
export function sampleReportingLag(r: Rng): number {
  const days = Math.round(lognormalRand(r, 5.5, 1.2));
  return Math.max(1, Math.min(days, LAG_AVISO_MAX_DIAS));
}
