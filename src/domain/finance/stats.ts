/**
 * Sample standard deviation (n−1 divisor) of a small set of values — used
 * inside finBench.ts to compute Día 4's `solSigmaLR` (volatility of
 * siniestralidad/prima across Año 1/2/3), the true value a team's reported
 * figure is then graded against directly. Requires at least 2 values (n−1
 * divisor is undefined for n=1); Día 4's 3-year loss ratio is always called
 * with exactly 3.
 */
export function sampleStdev(values: number[]): number {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}
