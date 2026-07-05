/**
 * Universe sizes reduced from the legacy prototype's 10,000,000 / 200,000 rows
 * (see CLAUDE.md §4.1): pedagogically equivalent, ~10x less compute/storage,
 * and small enough to run synchronously inside one Vercel serverless request.
 */
export const N_COLOMBIA = 1_000_000;
export const N_CHILE = 100_000;

export const CAL_FREQ = 0.33;
export const ANIO_BASE_A1 = 2027;
export const SEVERITY_SHAPE = 3.306;

/** Monthly claim-occurrence seasonality weights, ported from ESTAC (line ~2029). */
export const MONTHLY_SEASONALITY = [
  1.25, 1.05, 1.15, 1.0, 0.9, 0.95, 1.2, 1.15, 0.95, 0.9, 0.95, 1.35,
];

/** Ported from DIAS_MES (line ~2030). Not leap-year aware, matching the legacy. */
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
