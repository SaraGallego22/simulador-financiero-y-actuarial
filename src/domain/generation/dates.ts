import type { Rng } from "./rng";
import { lognormalRand } from "./rng";
import { MONTHLY_SEASONALITY, DAYS_IN_MONTH } from "./constants";

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
 * [1, 730]. Ported from muestrearRezago() (line ~2477) — this is the source
 * of the platform's IBNR opacity.
 */
export function sampleReportingLag(r: Rng): number {
  const days = Math.round(lognormalRand(r, 3.0, 1.2));
  return Math.max(1, Math.min(days, 730));
}
