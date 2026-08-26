import type { ColombiaUniverse } from "../generation/generateColombia";
import { getExposure } from "../generation/generateColombia";
import { calcMediaSev } from "./severity";

/**
 * Each exposure's true expected cost — prima pura = λ × severidad media, the
 * two halves of the generator's own model (calcLambda, already stored as
 * `universe.lam`, and calcMediaSev).
 *
 * Computed once for the whole universe and reused across every team: the
 * per-exposure `getExposure()`/`calcMediaSev()` work is the expensive part,
 * and it doesn't depend on who priced what.
 *
 * The constant outlier load the generator applies on top of calcMediaSev
 * (OUTLIER_CLAIM_PROBABILITY/MULTIPLIER) is deliberately left out: correlation
 * is scale-invariant, so a factor applied uniformly to every exposure cannot
 * move the result.
 */
function purePremiums(universe: ColombiaUniverse): Float64Array {
  const pure = new Float64Array(universe.n);
  for (let k = 0; k < universe.n; k++) {
    pure[k] = universe.lam[k] * calcMediaSev(getExposure(universe, k));
  }
  return pure;
}

/**
 * How well each team's tariff tracks true risk: the Pearson correlation,
 * across **every exposure the team priced**, between what it charged and what
 * that exposure actually costs in expected value (see purePremiums).
 *
 * The population is the team's whole tariff, not the book it went on to win.
 * The won book is a *selected* subset — a team tends to win exactly where it
 * priced below the rest of the market, so correlating over it would measure
 * the team's pricing model tangled up with the market's reaction to it. Over
 * everything priced, this measures the model alone, and it's the same
 * question the team was actually answering when it built the tariff.
 *
 * Not depending on the simulation's assignment also means this says nothing
 * about how many claims a team had or what they cost — it's a statement about
 * the ORDER of a tariff, never its level, which is what makes it safe to show
 * a team that still has to estimate its own siniestralidad (Día 3).
 *
 * An exposure priced at exactly 0 is "not priced" rather than "priced free" —
 * the same rule isPriced()/meanPremium/medianOfPositive use everywhere else
 * (see isPriced() in market/runSimulation.ts), since a stored 0 can't be
 * distinguished from a row the team's CSV never included.
 *
 * Returns null for a team with fewer than 2 priced exposures, or whose tariff
 * (or the risk it faces) has no spread at all — a flat tariff has zero
 * variance, so the correlation is genuinely undefined, not 0.
 */
export function tariffRiskCorrelationByTeam(
  universe: ColombiaUniverse,
  tariffsByNumericId: Map<number, Float32Array>
): Map<number, number | null> {
  const pure = purePremiums(universe);
  const result = new Map<number, number | null>();

  for (const [numericTeamId, tariff] of tariffsByNumericId) {
    // Welford-style online co-moments, one pass. The raw sums-of-squares form
    // would push ~10^20 through a float64 accumulator at 1M exposures and COP
    // magnitudes; this keeps every running quantity on the scale of the data.
    let n = 0;
    let meanX = 0;
    let meanY = 0;
    let cXY = 0;
    let m2X = 0;
    let m2Y = 0;

    for (let k = 0; k < universe.n; k++) {
      const x = tariff[k];
      if (!(x > 0)) continue;
      const y = pure[k];
      if (!Number.isFinite(y)) continue;
      n++;
      const dx = x - meanX;
      const dy = y - meanY;
      meanX += dx / n;
      meanY += dy / n;
      // Each co-moment pairs one pre-update deviation with one post-update one.
      cXY += dx * (y - meanY);
      m2X += dx * (x - meanX);
      m2Y += dy * (y - meanY);
    }

    if (n < 2 || m2X <= 0 || m2Y <= 0) {
      result.set(numericTeamId, null);
      continue;
    }
    // Clamp: accumulated rounding can push a perfect correlation a hair past ±1.
    result.set(numericTeamId, Math.max(-1, Math.min(1, cXY / Math.sqrt(m2X * m2Y))));
  }
  return result;
}
