import type { ColombiaUniverse } from "../generation/generateColombia";
import { getExposure } from "../generation/generateColombia";
import { calcMediaSev } from "./severity";

/**
 * How well a team's own tariff tracks the true risk of the exposures it
 * actually insured: the Pearson correlation, across that team's book, between
 * what it charged for each policy and that policy's true expected cost
 * (prima pura = λ × severidad media — the two halves of the generator's own
 * model, see calcLambda/calcMediaSev).
 *
 * This is the pricing-quality signal a team can be shown *without* spoiling
 * the reserving exercise: it says nothing about the LEVEL of claims (how many
 * happened, how much they cost), only about whether the team's ordering of
 * risk matched reality — so a team still has to estimate its own siniestralidad
 * from its report, which is the point of Día 3.
 *
 * Correlation is scale-invariant, so the constant outlier load the generator
 * applies on top of calcMediaSev (OUTLIER_CLAIM_PROBABILITY/MULTIPLIER) is
 * deliberately left out: it multiplies every exposure's expected severity by
 * the same factor and cannot move the result.
 *
 * Returns null for a team whose book is too small to correlate (< 2 policies)
 * or whose premium/risk has no spread at all (a flat tariff — zero variance,
 * so the correlation is genuinely undefined, not 0).
 */
export function tariffRiskCorrelationByTeam(
  universe: ColombiaUniverse,
  assignment: Int32Array,
  premiumAt: (numericTeamId: number, exposureIndex: number) => number
): Map<number, number | null> {
  // Welford-style online co-moments, one pass. The raw sums-of-squares form
  // would push ~10^20 through a float64 accumulator at 1M exposures and COP
  // magnitudes; this keeps every running quantity on the scale of the data.
  interface Acc {
    n: number;
    meanX: number;
    meanY: number;
    cXY: number;
    m2X: number;
    m2Y: number;
  }
  const accs = new Map<number, Acc>();

  for (let k = 0; k < universe.n; k++) {
    const teamId = assignment[k];
    if (teamId === -1) continue;
    const x = premiumAt(teamId, k);
    const y = universe.lam[k] * calcMediaSev(getExposure(universe, k));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    let a = accs.get(teamId);
    if (!a) {
      a = { n: 0, meanX: 0, meanY: 0, cXY: 0, m2X: 0, m2Y: 0 };
      accs.set(teamId, a);
    }
    a.n++;
    const dx = x - a.meanX;
    const dy = y - a.meanY;
    a.meanX += dx / a.n;
    a.meanY += dy / a.n;
    // Each co-moment pairs one pre-update deviation with one post-update one.
    a.cXY += dx * (y - a.meanY);
    a.m2X += dx * (x - a.meanX);
    a.m2Y += dy * (y - a.meanY);
  }

  const result = new Map<number, number | null>();
  for (const [teamId, a] of accs) {
    if (a.n < 2 || a.m2X <= 0 || a.m2Y <= 0) {
      result.set(teamId, null);
      continue;
    }
    const r = a.cXY / Math.sqrt(a.m2X * a.m2Y);
    // Clamp: accumulated rounding can push a perfect correlation a hair past ±1.
    result.set(teamId, Math.max(-1, Math.min(1, r)));
  }
  return result;
}
