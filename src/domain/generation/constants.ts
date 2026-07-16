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

/**
 * A small fraction of claims are deliberately inflated into "catastrophic"
 * outliers — real auto-insurance severity is right-tailed (total losses,
 * bodily injury/liability) in a way a plain Gamma draw understates, and
 * without them a mean and a median of claim size are close enough that
 * nothing forces a team to actually notice the difference. Applied via an
 * independent RNG stream (see generateColombia.ts/generateYear2Claims.ts) so
 * it never disturbs the existing per-row draw-count invariant the rest of
 * generation relies on for reproducibility.
 */
export const OUTLIER_CLAIM_PROBABILITY = 0.02;
/** How much an outlier claim's severity is multiplied by, on top of its normal Gamma draw. */
export const OUTLIER_CLAIM_MULTIPLIER = 8;

/**
 * Annual claims-cost inflation applied to Year-2 severity relative to Year 1
 * (2027 -> 2028, see ANIO_BASE_A1 and generateYear2Claims.ts's YEAR_2) — auto
 * claims run above general CPI in Colombia (parts/labor costs skew import-
 * heavy), so 9% is a realistic single-year assumption, not the general IPC.
 * Frequency (calcLambda) is untouched: inflation moves the cost of a claim,
 * not the probability of having one. Not disclosed to teams as a number
 * anywhere in the product copy — see README.md §1.1 for the related
 * (separate) present-value trap on the Chile reference dataset.
 */
export const CLAIMS_INFLATION_ANNUAL = 0.09;

/**
 * Real (above general inflation) year-over-year growth in Chile claims
 * severity, baked into `generateChile()`'s 2021-2023 series. Expressed in UF
 * — Chile's own inflation-indexed unit — so this represents genuine repair/
 * labor cost growth, not currency debasement. A team that measures this
 * trend and adds a public estimate of Colombia's own general inflation
 * should land close to CLAIMS_INFLATION_ANNUAL above: the same
 * reverse-engineering pattern as the Día 1 "brecha temporal" challenge (see
 * README §1.1) — never disclosed directly.
 */
export const CHILE_REAL_SEVERITY_GROWTH_ANNUAL = 0.03;

/**
 * Colombia's general (economy-wide) annual inflation, derived — not
 * hand-typed — from the two constants above via the same Fisher-style
 * multiplicative decomposition `displayYield()` uses for a real rate
 * (`(1+nominal)/(1+inflación) - 1`), not a naive subtraction: nominal
 * claims-cost growth compounds real cost growth *and* general inflation
 * together, `(1+CLAIMS_INFLATION_ANNUAL) = (1+GENERAL_INFLATION_ANNUAL) ×
 * (1+CHILE_REAL_SEVERITY_GROWTH_ANNUAL)`, so isolating the general-inflation
 * side means dividing, not subtracting (≈5.83%, not the ≈6% a subtraction
 * would give — close because both rates are small, but not the same
 * number). This is exactly the same relationship the Chile transferability
 * clue in README §1.1 already describes ("general inflation + this real
 * trend should land close to CLAIMS_INFLATION_ANNUAL") — this constant just
 * names the "general inflation" side of that equation instead of leaving it
 * purely implicit. Used by `displayYield()` in
 * `src/domain/finance/instruments.ts` to show TESUVR8's return net of
 * inflation (it's UVR-indexed, so that's its genuine selling point) — never
 * disclosed as a number anywhere in product copy, same as the two constants
 * it's derived from.
 */
export const GENERAL_INFLATION_ANNUAL = (1 + CLAIMS_INFLATION_ANNUAL) / (1 + CHILE_REAL_SEVERITY_GROWTH_ANNUAL) - 1;

/** Monthly claim-occurrence seasonality weights, ported from ESTAC (line ~2029). */
export const MONTHLY_SEASONALITY = [
  1.25, 1.05, 1.15, 1.0, 0.9, 0.95, 1.2, 1.15, 0.95, 0.9, 0.95, 1.35,
];

/** Ported from DIAS_MES (line ~2030). Not leap-year aware, matching the legacy. */
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
