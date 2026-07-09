import { getExposure } from "../generation/generateColombia";
import type { ColombiaUniverse } from "../generation/generateColombia";
import { calcLambda } from "./frequency";
import { calcMediaSev } from "./severity";

/**
 * Loss ratio the "Tercerizar tarifas" emergency tariff is priced to —
 * deliberately worse than 1.0 (the "shrink"/unhealthy threshold used
 * elsewhere in the model), so a team that outsources always runs at a real
 * technical underwriting loss, not just a thin margin.
 */
export const OUTSOURCED_TARGET_LOSS_RATIO = 1.05;

/**
 * Extra revenue given up to the consultant's own fee, layered on top of the
 * already-bad OUTSOURCED_TARGET_LOSS_RATIO pricing — this is the "costo
 * extra por tercerizar": not a separate line item threaded through
 * finBench()/alm.ts, just a further haircut on the same tariff, so it flows
 * into Día 4 solvency exactly like a real pricing mistake would (lower
 * premium -> worse margin -> worse solvency) with no changes to the
 * financial engine at all.
 */
export const OUTSOURCED_CONSULTING_HAIRCUT = 0.08;

/**
 * Deterministic, per-exposure "emergency tariff" for a team that couldn't
 * price in time — narratively, a Chilean consultancy with no experience in
 * the Colombian market. Uses the *real* frequency/severity model
 * (calcLambda/calcMediaSev — the same relativities the actual market runs
 * on, so an inexperienced-but-not-incompetent firm still ranks risks
 * correctly) priced down to a worse-than-healthy loss ratio, with an
 * additional haircut for the consulting fee itself.
 *
 * calcLambda x calcMediaSev is the textbook pure-premium formula and ranks
 * relative risk across exposures correctly, but its population average can
 * drift from what a given universe draw actually realizes (measured against
 * generateColombia(42): the textbook average and the realized
 * claims-experience average differ by ~30%, since `sev`'s Gamma draws and
 * `siniestro`'s occurrence draws both add sampling variance on top of the
 * formula's point estimate). Rescaling to the universe's own realized
 * average incurred cost (`siniestro`/`sev`, already generated) keeps
 * OUTSOURCED_TARGET_LOSS_RATIO meaning what it says for any seed, instead of
 * silently pricing worse (or better) than intended.
 *
 * Pure function of the universe alone (no team-specific randomness) — like
 * the universe itself, this is never persisted as a stored array (see
 * getTariffArray() in lib/tariffAccess.ts); it's regenerated on demand from
 * the same seed every time, at the same ~1M-row typed-array cost as the rest
 * of the engine (see CLAUDE.md §4.1).
 */
export function generateOutsourcedTariff(universe: ColombiaUniverse): Float32Array {
  const n = universe.n;
  const rawPure = new Float32Array(n);
  let rawSum = 0;
  let realizedSum = 0;
  for (let i = 0; i < n; i++) {
    const e = getExposure(universe, i);
    const p = calcLambda(e) * calcMediaSev(e);
    rawPure[i] = p;
    rawSum += p;
    if (universe.siniestro[i]) realizedSum += universe.sev[i];
  }
  const rawAvg = rawSum / n;
  const scaleCorrection = rawAvg > 0 ? realizedSum / n / rawAvg : 1;

  const loadFactor = ((1 - OUTSOURCED_CONSULTING_HAIRCUT) / OUTSOURCED_TARGET_LOSS_RATIO) * scaleCorrection;
  const premiums = new Float32Array(n);
  for (let i = 0; i < n; i++) premiums[i] = rawPure[i] * loadFactor;
  return premiums;
}

export function meanPremium(premiums: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < premiums.length; i++) sum += premiums[i];
  return sum / premiums.length;
}
