import { INSTRUMENTS } from "./instruments";
import type { Allocation } from "./instruments";

const IDS = INSTRUMENTS.map((i) => i.id);
const MU = INSTRUMENTS.map((i) => i.yield);
const N = IDS.length;

/**
 * Día 1's minimum-variance exercise: minimize portfolio variance subject to
 * a minimum expected return, weights >= 0 summing to 1. Chosen instead of an
 * unconstrained minimum-variance problem because LIQ's volAnual (1%) is far
 * below every other instrument's (next-lowest is CDT90 at 2%) — an
 * unconstrained long-only minimum-variance portfolio over this menu is
 * almost entirely LIQ regardless of the correlation structure, which would
 * let a team "solve" the exercise by picking the single safest instrument
 * without ever engaging with the covariance matrix. A return floor forces a
 * genuine risk/diversification trade-off.
 *
 * 0.10 sits meaningfully above the unconstrained minimum-variance portfolio's
 * own return (~5%, essentially pure LIQ at its own nominal yield — see
 * instruments.ts) but well below ACC's 14% — verified (by hand, then
 * cross-checked by this module's own solver in markowitz.test.ts) to produce
 * a genuine 5-of-6-instrument solution (only TES3 excluded), not a corner.
 */
export const TARGET_RETURN = 0.1;

/**
 * Rate/duration factor loading per instrument, as a fraction of the
 * instrument's own volAnual. TESUVR8 loads far less than TES3 despite a
 * comparable volAnual — modeling that its UVR-indexation shields it from
 * nominal rate risk (see instruments.ts's own comment on TESUVR8). ACC's
 * small negative loading gives it a mild negative correlation with bonds.
 *
 * CDT90's loading (0.0256, 80% of its own 3.2% volAnual — see
 * instruments.ts) puts its correlation to TES1/TES3 at 0.68/0.71, still
 * below TES1↔TES3's own 0.75 — consistent with CDT90 sitting furthest from
 * both on the term structure. A loading can never exceed an instrument's
 * own volAnual (the remaining idiosyncratic variance, volAnual² − loading²,
 * would go negative) — see buildCovarianceMatrix()'s doc comment.
 */
const RATE_LOADING: Record<string, number> = { LIQ: 0.003, CDT90: 0.0256, TES1: 0.034, TES3: 0.062, TESUVR8: 0.03, ACC: -0.01 };
/** Equity factor loading — only ACC has any exposure to it. */
const EQUITY_LOADING: Record<string, number> = { LIQ: 0, CDT90: 0, TES1: 0, TES3: 0, TESUVR8: 0, ACC: 0.195 };

/**
 * Builds the 6x6 covariance matrix via a 2-factor model, Σ = L·Lᵀ + D:
 * guarantees Σ is positive *definite* by construction (L·Lᵀ is PSD, D is a
 * strictly-positive diagonal), so this never needs a runtime PSD check.
 * diag(Σ) is pinned to exactly volAnual² (d_i is whatever's left after both
 * factor loadings are subtracted) — nothing calibrated against volAnual
 * elsewhere (VOL_PENALTY_LAMBDA's ordering, finBench's rFin, VOL_MENU_AVG)
 * drifts. See markowitz.test.ts for the positive-definiteness/diagonal
 * checks and README for the resulting correlation matrix.
 *
 * This positive-definiteness guarantee depends on every instrument's own
 * RATE_LOADING/EQUITY_LOADING never exceeding its volAnual — d_i is only a
 * valid (non-negative) idiosyncratic variance up to that point; a loading
 * beyond it silently produces an invalid Σ (a correlation above 1 between
 * that instrument and whatever it's now over-loaded against). Not asserted
 * at runtime since it only matters when hand-editing these two tables.
 */
function buildCovarianceMatrix(): number[][] {
  const sigma: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    const idI = IDS[i];
    for (let j = 0; j < N; j++) {
      const idJ = IDS[j];
      let v = RATE_LOADING[idI] * RATE_LOADING[idJ] + EQUITY_LOADING[idI] * EQUITY_LOADING[idJ];
      if (i === j) v += INSTRUMENTS[i].volAnual ** 2 - RATE_LOADING[idI] ** 2 - EQUITY_LOADING[idI] ** 2;
      sigma[i][j] = v;
    }
  }
  return sigma;
}

/** Computed once at module load — pure function of the fixed INSTRUMENTS menu, never seed/request-dependent. */
export const COVARIANCE_MATRIX: number[][] = buildCovarianceMatrix();

/** Σ_ij / (vol_i·vol_j) — the dimensionless correlation matrix, easier to sanity-check by eye than raw covariances. Shown to teams alongside COVARIANCE_MATRIX. */
export function impliedCorrelationMatrix(sigma: number[][] = COVARIANCE_MATRIX): number[][] {
  return sigma.map((row, i) => row.map((v, j) => v / Math.sqrt(sigma[i][i] * sigma[j][j])));
}

function allocationToVector(alloc: Allocation): number[] {
  return IDS.map((id) => Number(alloc[id]) || 0);
}

function vectorToAllocation(w: number[]): Allocation {
  const alloc: Allocation = {};
  for (let i = 0; i < N; i++) alloc[IDS[i]] = w[i];
  return alloc;
}

/** wᵀΣw — same manual-double-loop quadratic-form pattern already used for CORR_MOD in capacity.ts/finBench.ts. */
export function portfolioVariance(weights: Allocation, sigma: number[][] = COVARIANCE_MATRIX): number {
  const w = allocationToVector(weights);
  const total = w.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  const wn = w.map((v) => v / total);
  let variance = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) variance += wn[i] * sigma[i][j] * wn[j];
  return variance;
}

/** wᵀμ, normalizing weights to sum to 1 first (mirrors portfolioVariance). */
export function portfolioExpectedReturn(weights: Allocation, mu: number[] = MU): number {
  const w = allocationToVector(weights);
  const total = w.reduce((s, v) => s + v, 0);
  if (total <= 0) return 0;
  return w.reduce((s, v, i) => s + (v / total) * mu[i], 0);
}

/**
 * Solves `Ax = b` via Gaussian elimination with partial pivoting. Throws if
 * the matrix is (numerically) singular — shouldn't happen for the
 * well-posed KKT systems solveLongOnlyMinVariance builds, but this is
 * defensive, not swallowed silently, since a silent wrong answer here would
 * corrupt a grading ground-truth.
 */
function gaussianElimination(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) throw new Error(`gaussianElimination: singular matrix at column ${col}`);
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/**
 * Long-only minimum-variance portfolio subject to a minimum expected
 * return: minimize wᵀΣw s.t. Σw=1, w·μ>=targetReturn, w>=0. Solved via an
 * active-set method — at each iteration, solves the 2-equality-constraint
 * KKT system (Σw=1, w·μ=targetReturn) over the current active set A by
 * Gaussian elimination on:
 *
 *   [ 2·Σ_AA   -1   -μ_A ] [ w_A ]   [ 0 ]
 *   [   1ᵀ      0     0  ] [ λ1  ] = [ 1 ]
 *   [   μ_Aᵀ    0     0  ] [ λ2  ]   [ R ]
 *
 * and drops the most-negative-weight asset from the active set if any
 * weight comes out negative, repeating until every active weight is >= 0
 * (or the active set is exhausted, which shouldn't happen for any
 * targetReturn between the safest and richest instrument's own yield).
 * Verified by hand for TARGET_RETURN=0.10 to converge to a genuine 4-of-6
 * blend (LIQ and TES3 excluded) — see markowitz.test.ts.
 */
export function solveLongOnlyMinVariance(targetReturn: number = TARGET_RETURN, sigma: number[][] = COVARIANCE_MATRIX): Allocation {
  let active = IDS.map((_, i) => i);

  for (let iter = 0; iter < N; iter++) {
    const k = active.length;
    const size = k + 2;
    const a: number[][] = Array.from({ length: size }, () => new Array(size).fill(0));
    const b: number[] = new Array(size).fill(0);

    for (let r = 0; r < k; r++) {
      for (let c = 0; c < k; c++) a[r][c] = 2 * sigma[active[r]][active[c]];
      a[r][k] = -1;
      a[r][k + 1] = -MU[active[r]];
    }
    for (let c = 0; c < k; c++) {
      a[k][c] = 1;
      a[k + 1][c] = MU[active[c]];
    }
    b[k] = 1;
    b[k + 1] = targetReturn;

    const x = gaussianElimination(a, b);
    const weightsActive = x.slice(0, k);

    let worstIdx = -1;
    let worstVal = -1e-9; // small negative tolerance for floating-point noise
    for (let i = 0; i < k; i++) if (weightsActive[i] < worstVal) { worstVal = weightsActive[i]; worstIdx = i; }

    if (worstIdx === -1) {
      const w = new Array(N).fill(0);
      for (let i = 0; i < k; i++) w[active[i]] = Math.max(0, weightsActive[i]);
      return vectorToAllocation(w);
    }
    active = active.filter((_, i) => i !== worstIdx);
  }

  throw new Error("solveLongOnlyMinVariance: active-set method failed to converge");
}

/**
 * Scores a team's Día 1 minimum-variance submission: how close its achieved
 * variance came to the true minimum achievable at TARGET_RETURN — 100
 * within tolerancePerfect relative error, decaying linearly to 0 at
 * toleranceZero, same tolerance-band shape as scoreConcepto() (src/domain/
 * grading/concepts.ts) uses for every other numeric deliverable, just
 * inlined here rather than imported (finance/ doesn't depend on grading/ —
 * see that module's layering).
 *
 * Two deliberate departures from that generic pattern, both from empirical
 * calibration against a batch of representative allocations (naive reuse of
 * the rubric's generic COP-reporting tolerance band, 5%/40% relative error
 * on the achieved *variance*, put every plausible submission at 0):
 *
 * 1. **Error is measured on volatility (sqrt of variance), not variance
 *    itself.** Variance is quadratic in allocation error, so a team only
 *    moderately off the optimal weights can easily land at 2-4x the true
 *    minimum variance — an enormous relative error on variance, but a much
 *    gentler (and more human-interpretable, since it reads as an annualized
 *    volatility %) 60-100% on its square root.
 * 2. **The benchmark is always the true minimum variance at the fixed
 *    TARGET_RETURN, never at the team's own achieved return.** An earlier
 *    version benchmarked against the team's own return instead, meaning to
 *    reward reaching for more than the minimum required return — but that
 *    let any allocation concentrated enough to sit at an extreme return
 *    score as "optimal for itself" (100% ACC, the only way to reach its own
 *    14% yield, scored 100, while a much less extreme but equally
 *    undiversified 50/50 ACC+LIQ scored 0 — an inconsistent, backwards
 *    result). Comparing everyone against the same fixed reference instead
 *    makes both of those allocations score equally poorly, which is what
 *    they deserve. Reaching for a higher return is still rewarded, but only
 *    through the small bonus below, never through a moving benchmark.
 */
/**
 * Tightened from an initial 0.05/2.0 pass after that calibration turned out
 * to reward casual guessing too generously — e.g. an uninformed equal-weight
 * split scored 57 and a naive 2-instrument pairing scored 73. At 0.03/0.8,
 * both of those (and every other undiversified/naive allocation checked)
 * drop to 0, while a genuinely reasoned 3+-instrument attempt still scores
 * 85-100 and the true optimum still scores 100 — re-verify against a batch
 * of representative allocations before loosening or tightening further.
 */
const MINVAR_TOLERANCE_PERFECT = 0.03;
const MINVAR_TOLERANCE_ZERO = 0.8;
/** Max extra points a high achieved return can add on top of the variance score — deliberately small, variance dominates the grade. */
const MINVAR_RETURN_BONUS_MAX = 10;

export function scoreMinVariance(submitted: Allocation): number {
  const benchmark = solveLongOnlyMinVariance(TARGET_RETURN);
  const benchVol = Math.sqrt(portfolioVariance(benchmark));
  const achievedVol = Math.sqrt(portfolioVariance(submitted));
  const err = benchVol > 0 ? (achievedVol - benchVol) / benchVol : 0;

  let varianceScore: number;
  if (err <= MINVAR_TOLERANCE_PERFECT) varianceScore = 100;
  else if (err >= MINVAR_TOLERANCE_ZERO) varianceScore = 0;
  else varianceScore = 100 * (1 - (err - MINVAR_TOLERANCE_PERFECT) / (MINVAR_TOLERANCE_ZERO - MINVAR_TOLERANCE_PERFECT));

  const achievedReturn = portfolioExpectedReturn(submitted);
  const maxYield = Math.max(...MU);
  const returnBonusRaw = 100 * Math.max(0, Math.min(1, (achievedReturn - TARGET_RETURN) / (maxYield - TARGET_RETURN)));
  const bonus = MINVAR_RETURN_BONUS_MAX * (varianceScore / 100) * (returnBonusRaw / 100);
  return Math.min(100, varianceScore + bonus);
}
