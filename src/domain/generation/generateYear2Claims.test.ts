import { describe, expect, it } from "vitest";
import { generateColombia, getExposure } from "./generateColombia";
import { generateYear2Claims } from "./generateYear2Claims";
import { calcMediaSev } from "../pricing/severity";
import { CLAIMS_INFLATION_ANNUAL } from "./constants";

describe("generateYear2Claims", () => {
  it("is deterministic: same seed produces identical output", () => {
    const universe = generateColombia(42, 500);
    const a = generateYear2Claims(universe, 42);
    const b = generateYear2Claims(universe, 42);
    expect(Array.from(a.siniestro)).toEqual(Array.from(b.siniestro));
    expect(Array.from(a.sev)).toEqual(Array.from(b.sev));
  });

  it("matches golden values regenerated after fixing gammaRand()'s proposal-distribution bug (seed=42, n=1000)", () => {
    // Originally pinned to generarSiniestrosA2()'s exact loop body from
    // Pasantia_SURA_v3_inversiones_dinamicas.html — but that depends on the
    // same seed=42, N_COL=1000 Colombia universe generateColombia.test.ts
    // pins, which reseeds downstream of gammaRand()'s bug fix (see rng.ts's
    // doc comment and that test's comment). Regenerated from the corrected
    // TS port itself, not hand-adjusted.
    const universe = generateColombia(42, 1000);
    const year2 = generateYear2Claims(universe, 42);

    let claimCount = 0;
    for (let i = 0; i < universe.n; i++) claimCount += year2.siniestro[i];
    expect(claimCount).toBe(109);

    expect(year2.lam[0]).toBeCloseTo(0.0896120027, 6);
    expect(year2.siniestro[0]).toBe(0);

    expect(year2.lam[1]).toBeCloseTo(0.1068407074, 6);
    expect(year2.siniestro[1]).toBe(0);

    expect(year2.lam[8]).toBeCloseTo(0.0524064675, 6);
    expect(year2.lam[500]).toBeCloseTo(0.0186264217, 6);
    expect(year2.lam[999]).toBeCloseTo(0.0441009402, 6);
  });

  it("applies one year of claims-cost inflation to Year-2 severity", () => {
    // Compares realized/theoretical severity ratios across Year 1 (no
    // inflation) and Year 2 (inflated) instead of asserting an absolute
    // expected ratio directly: the Gamma sampler's realized mean and the
    // catastrophic-outlier mixture both bias realized severity away from
    // calcMediaSev()'s raw output by some factor common to both years, which
    // this cross-year ratio cancels out, isolating just the inflation effect.
    const universe = generateColombia(42, 50_000);
    const year2 = generateYear2Claims(universe, 42);

    let expectedY1 = 0;
    let realizedY1 = 0;
    let expectedY2 = 0;
    let realizedY2 = 0;
    let claimCountY2 = 0;
    for (let i = 0; i < universe.n; i++) {
      const e1 = getExposure(universe, i);
      if (universe.siniestro[i]) {
        expectedY1 += calcMediaSev(e1);
        realizedY1 += universe.sev[i];
      }
      if (year2.siniestro[i]) {
        const eYear2 = {
          ...e1,
          antig: e1.antig + 1,
          hist: universe.siniestro[i] ? Math.min(e1.hist + 1, 5) : e1.hist,
        };
        expectedY2 += calcMediaSev(eYear2);
        realizedY2 += year2.sev[i];
        claimCountY2++;
      }
    }

    const crossYearRatio = realizedY2 / expectedY2 / (realizedY1 / expectedY1);

    expect(claimCountY2).toBeGreaterThan(1000);
    expect(crossYearRatio).toBeCloseTo(1 + CLAIMS_INFLATION_ANNUAL, 1);
  });

  it("bumps history when Year 1 had a claim, which can raise Year-2 frequency", () => {
    // Row 1 (index 1) had a Year-1 claim (see generateColombia.test.ts), so
    // its Year-2 hist should be incremented, in turn raising calcLambda's
    // history-factor term relative to a same-risk exposure with no claim.
    const universe = generateColombia(42, 1000);
    expect(universe.siniestro[1]).toBe(1); // sanity check on the fixture this test depends on
    const year2 = generateYear2Claims(universe, 42);
    expect(year2.lam[1]).toBeGreaterThan(0);
  });
});
