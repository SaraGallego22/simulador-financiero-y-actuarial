export type Rng = () => number;

/**
 * Deterministic linear-congruential generator (Lehmer/Park-Miller), ported
 * verbatim from seedRand() in the legacy prototype (line ~2444). The same
 * seed must always reproduce the same sequence — this is what makes the
 * whole platform's grading reproducible.
 */
export function seedRand(seed: number): Rng {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Marsaglia-Tsang gamma sampler (shape >= 1), ported from gammaRand() (line
 * ~2449). Used to draw claim severities.
 */
export function gammaRand(r: Rng, shape: number): number {
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x = 0;
    let v = 0;
    do {
      x = (r() * 2 - 1) * 3.5;
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/**
 * Box-Muller lognormal sampler, ported from lognormalRand() (line ~2461).
 * Used to draw claim reporting lags (IBNR delay).
 */
export function lognormalRand(r: Rng, mu: number, sigma: number): number {
  const u1 = r() + 1e-10;
  const u2 = r();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.exp(mu + sigma * z);
}
