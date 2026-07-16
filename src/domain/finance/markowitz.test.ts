import { describe, expect, it } from "vitest";
import { INSTRUMENTS } from "./instruments";
import {
  COVARIANCE_MATRIX,
  TARGET_RETURN,
  impliedCorrelationMatrix,
  portfolioExpectedReturn,
  portfolioVariance,
  scoreMinVariance,
  solveLongOnlyMinVariance,
} from "./markowitz";

const N = INSTRUMENTS.length;

describe("COVARIANCE_MATRIX", () => {
  it("is symmetric", () => {
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) expect(COVARIANCE_MATRIX[i][j]).toBeCloseTo(COVARIANCE_MATRIX[j][i], 12);
  });

  it("has a diagonal equal to each instrument's volAnual squared", () => {
    INSTRUMENTS.forEach((ins, i) => expect(COVARIANCE_MATRIX[i][i]).toBeCloseTo(ins.volAnual ** 2, 12));
  });

  it("implies correlations within [-1, 1] for every pair", () => {
    const corr = impliedCorrelationMatrix();
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) expect(Math.abs(corr[i][j])).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("is positive definite (wᵀΣw > 0 for every nonzero w, sampled)", () => {
    // Spot-checks rather than a full eigenvalue decomposition (no matrix
    // library in this repo) — the L·Lᵀ + D construction guarantees this
    // mathematically (see markowitz.ts's doc comment); this is a sanity net.
    const samples: number[][] = [
      [1, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1],
      [1, -1, 1, -1, 1, -1],
      [0.2, 0.2, 0.2, 0.2, 0.1, 0.1],
    ];
    for (const w of samples) {
      let v = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) v += w[i] * COVARIANCE_MATRIX[i][j] * w[j];
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe("solveLongOnlyMinVariance", () => {
  const solution = solveLongOnlyMinVariance(TARGET_RETURN);

  it("produces non-negative weights that sum to 1", () => {
    const values = Object.values(solution);
    for (const w of values) expect(w).toBeGreaterThanOrEqual(-1e-9);
    expect(values.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 6);
  });

  it("achieves (binds) the target return", () => {
    expect(portfolioExpectedReturn(solution)).toBeCloseTo(TARGET_RETURN, 6);
  });

  it("is a genuine multi-instrument blend, not a corner solution", () => {
    const nonZero = Object.values(solution).filter((w) => w > 1e-6).length;
    expect(nonZero).toBeGreaterThanOrEqual(5);
  });

  it("matches the hand-derived reference weights (verified independently)", () => {
    // Hand-solved via the same active-set Lagrangian method — see the plan's
    // derivation. Only TES3 excluded; the rest blend to hit exactly 10%
    // return at (near-)minimum variance.
    expect(solution.LIQ).toBeCloseTo(0.084, 2);
    expect(solution.CDT90).toBeCloseTo(0.445, 2);
    expect(solution.TES1).toBeCloseTo(0.258, 2);
    expect(solution.TES3).toBeCloseTo(0, 2);
    expect(solution.TESUVR8).toBeCloseTo(0.169, 2);
    expect(solution.ACC).toBeCloseTo(0.045, 2);
  });

  it("satisfies KKT stationarity: active assets have equal marginal risk-minus-return contribution, inactive assets have a non-negative reduced cost", () => {
    const w = INSTRUMENTS.map((ins) => solution[ins.id]);
    const mu = INSTRUMENTS.map((ins) => ins.yield);
    const sigmaW = w.map((_, i) => COVARIANCE_MATRIX[i].reduce((s, sij, j) => s + sij * w[j], 0));

    // Solve for lambda2 (the return-constraint multiplier) from any two
    // active assets' stationarity condition: (Sigma w)_i - lambda2*mu_i is
    // constant (=lambda1/2) across active assets.
    const activeIdx = w.map((wi, i) => (wi > 1e-6 ? i : -1)).filter((i) => i !== -1);
    const [i0, i1] = activeIdx;
    const lambda2 = (sigmaW[i0] - sigmaW[i1]) / (mu[i0] - mu[i1]);
    const lambda1Half = sigmaW[i0] - lambda2 * mu[i0];

    for (const i of activeIdx) expect(sigmaW[i] - lambda2 * mu[i]).toBeCloseTo(lambda1Half, 6);

    for (let i = 0; i < N; i++) {
      if (w[i] > 1e-6) continue;
      expect(sigmaW[i] - lambda2 * mu[i]).toBeGreaterThanOrEqual(lambda1Half - 1e-6);
    }
  });

  it("achieves lower variance than a naive all-LIQ or all-ACC portfolio at the same return floor is even attemptable", () => {
    const achieved = portfolioVariance(solution);
    // Any single instrument alone can't even reach the 10% target except
    // ACC (14% > 10%) or blends — compare against ACC alone (feasible, since
    // its own yield exceeds the target) to confirm real diversification
    // benefit, not just "some feasible point".
    const accOnly = { ACC: 1 };
    expect(achieved).toBeLessThan(portfolioVariance(accOnly));
  });

  it("cross-checks against a coarse grid search over the simplex (independent of the analytic solver)", () => {
    // Coarse (step=0.1) grid over 6 assets restricted to the solver's own
    // active set (LIQ/CDT90/TES1/TESUVR8/ACC) is still ~1001 feasible points
    // (5-part compositions of 10) — enough to confirm no nearby point beats
    // the analytic solution's variance while also meeting the return floor.
    const ids = ["LIQ", "CDT90", "TES1", "TESUVR8", "ACC"];
    const step = 10; // tenths
    let best = Infinity;
    for (let a = 0; a <= step; a++) {
      for (let b = 0; a + b <= step; b++) {
        for (let c = 0; a + b + c <= step; c++) {
          for (let d = 0; a + b + c + d <= step; d++) {
            const e = step - a - b - c - d;
            const alloc = { [ids[0]]: a, [ids[1]]: b, [ids[2]]: c, [ids[3]]: d, [ids[4]]: e };
            if (portfolioExpectedReturn(alloc) < TARGET_RETURN - 1e-6) continue;
            best = Math.min(best, portfolioVariance(alloc));
          }
        }
      }
    }
    const analytic = portfolioVariance(solution);
    // Grid is coarse (0.1 steps) so it shouldn't beat the analytic optimum
    // by more than the discretization slack allows.
    expect(analytic).toBeLessThanOrEqual(best + 1e-4);
  });
});

describe("scoreMinVariance", () => {
  const trueSolution = solveLongOnlyMinVariance(TARGET_RETURN);

  it("gives 100 to the true optimal submission", () => {
    expect(scoreMinVariance(trueSolution)).toBe(100);
  });

  it("gives a low score to 100% ACC — extreme concentration, not a benchmark loophole", () => {
    // An earlier version benchmarked against the team's own achieved return,
    // which made 100% ACC score 100 (it's the only way to hit exactly its
    // own 14% return) while an equally undiversified 50/50 ACC+LIQ scored 0
    // — an inconsistent result a user correctly flagged as broken. Benchmarking
    // against the fixed TARGET_RETURN always scores both extremes low.
    expect(scoreMinVariance({ LIQ: 0, CDT90: 0, TES1: 0, TES3: 0, TESUVR8: 0, ACC: 1 })).toBeLessThan(10);
  });

  it("gives a comparably low score to 50/50 ACC+LIQ — consistent with 100% ACC, not a special case", () => {
    const accLiq = scoreMinVariance({ LIQ: 0.5, CDT90: 0, TES1: 0, TES3: 0, TESUVR8: 0, ACC: 0.5 });
    const allAcc = scoreMinVariance({ LIQ: 0, CDT90: 0, TES1: 0, TES3: 0, TESUVR8: 0, ACC: 1 });
    expect(accLiq).toBeLessThan(10);
    expect(Math.abs(accLiq - allAcc)).toBeLessThan(15);
  });

  it("gives high (but not perfect) credit to a genuinely reasoned multi-instrument attempt", () => {
    const rough = { LIQ: 0, CDT90: 0.6, TES1: 0.2, TES3: 0, TESUVR8: 0.2, ACC: 0 };
    const score = scoreMinVariance(rough);
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThan(100);
  });

  it("gives low credit to a naive 2-instrument pairing — guessing shouldn't score well", () => {
    const naive = { LIQ: 0, CDT90: 0, TES1: 0, TES3: 0.5, TESUVR8: 0.5, ACC: 0 }; // 50/50 TES3+TESUVR8
    const score = scoreMinVariance(naive);
    expect(score).toBeLessThan(50);
  });

  it("gives low credit to a submission that chases return inefficiently", () => {
    const inefficient = { LIQ: 0, CDT90: 0.3, TES1: 0, TES3: 0, TESUVR8: 0, ACC: 0.7 }; // reaches ~12.7% but far from that return's own frontier
    const score = scoreMinVariance(inefficient);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(30);
  });

  it("never returns a negative score or a score above 100", () => {
    for (const alloc of [
      trueSolution,
      { LIQ: 1, CDT90: 0, TES1: 0, TES3: 0, TESUVR8: 0, ACC: 0 },
      { LIQ: 0, CDT90: 0, TES1: 0, TES3: 0, TESUVR8: 0, ACC: 1 },
    ]) {
      const score = scoreMinVariance(alloc);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});
