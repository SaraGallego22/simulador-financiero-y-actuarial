/**
 * Sample standard deviation (n−1 divisor) of a small set of values — used
 * for Día 4's `solSigmaLR` (volatility of siniestralidad/prima across Año
 * 1/2/3), both for the true engine value (finBench.ts) and for grading a
 * team's own reported figure against its own other submitted lines
 * (concepts.ts's "sampleStdevLossRatio" FormulaSpec) — kept as one shared
 * implementation so the two can never silently drift into different
 * statistics for the same concept. Requires at least 2 values (n−1 divisor
 * is undefined for n=1); Día 4's 3-year loss ratio is always called with
 * exactly 3.
 */
export function sampleStdev(values: number[]): number {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}
