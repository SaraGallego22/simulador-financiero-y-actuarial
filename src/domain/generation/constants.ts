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

/**
 * Reference UF -> CLP value behind the Día 1 "reto de transferibilidad" (see
 * chileSeverityToColombia2027Cop() below) — 1 UF ≈ 40,845 CLP, the real rate
 * as of jul-2026 (when this exercise was authored; source: valoruf.cl). A
 * snapshot, not a forecast for 2027 — see that function's doc comment for
 * why a fixed reference point is used instead of projecting the rate itself.
 */
export const UF_CLP_REFERENCE_VALUE = 40_845;

/**
 * Reference CLP -> COP exchange rate, same rationale/date as
 * UF_CLP_REFERENCE_VALUE — 1 CLP ≈ 3.5 COP as of jul-2026 (source:
 * valutafx.com/morsemoney.com, which put it in the 3.47-3.58 range that
 * week).
 */
export const CLP_COP_REFERENCE_RATE = 3.5;

/**
 * Converts a Chile severity (in UF, as observed in one of Chile's own years —
 * 2021/2022/2023, see generateChile.ts's YEARS_CL) into its COP-equivalent
 * for Colombia's Año 1 (ANIO_BASE_A1 = 2027) — the concrete formula behind
 * the transferability challenge the Día 1 guide references (README §1.1).
 * Two steps:
 *
 * 1. Real growth adjustment: the UF itself has ~0% real growth *by
 *    construction* (it's reindexed daily against Chilean CPI specifically so
 *    its real purchasing power stays flat) — there's no separate "real
 *    growth of the UF" to research or apply. The only real adjustment needed
 *    is extending the *severity* growth trend already measured within
 *    Chile's own dataset (CHILE_REAL_SEVERITY_GROWTH_ANNUAL, genuine repair/
 *    labor cost growth) forward from `fromYear` to 2027 — e.g. 4 years for a
 *    2023 observation, 6 for a 2021 one.
 * 2. Currency conversion: the resulting UF amount converts to COP via a
 *    snapshot CLP/COP reference (UF_CLP_REFERENCE_VALUE ×
 *    CLP_COP_REFERENCE_RATE above), not a 2027 forecast — FX rates that far
 *    out aren't reliably predictable, so this transfers the *real* cost at
 *    today's monetary reference point instead of pretending to forecast one.
 *
 * Not used by generateColombia()'s own calcMediaSev(), which is
 * independently calibrated in COP — this exists purely so the
 * transferability challenge referenced in the Día 1 guide has one concrete,
 * checkable answer instead of only a narrative description.
 */
export function chileSeverityToColombia2027Cop(severityUf: number, fromYear: number): number {
  const yearsToProject = ANIO_BASE_A1 - fromYear;
  const projectedUf = severityUf * (1 + CHILE_REAL_SEVERITY_GROWTH_ANNUAL) ** yearsToProject;
  return projectedUf * UF_CLP_REFERENCE_VALUE * CLP_COP_REFERENCE_RATE;
}

/** Monthly claim-occurrence seasonality weights, ported from ESTAC (line ~2029). */
export const MONTHLY_SEASONALITY = [
  1.25, 1.05, 1.15, 1.0, 0.9, 0.95, 1.2, 1.15, 0.95, 0.9, 0.95, 1.35,
];

/** Ported from DIAS_MES (line ~2030). Not leap-year aware, matching the legacy. */
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
