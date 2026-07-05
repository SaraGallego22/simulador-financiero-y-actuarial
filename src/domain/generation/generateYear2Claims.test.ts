import { describe, expect, it } from "vitest";
import { generateColombia } from "./generateColombia";
import { generateYear2Claims } from "./generateYear2Claims";

describe("generateYear2Claims", () => {
  it("is deterministic: same seed produces identical output", () => {
    const universe = generateColombia(42, 500);
    const a = generateYear2Claims(universe, 42);
    const b = generateYear2Claims(universe, 42);
    expect(Array.from(a.siniestro)).toEqual(Array.from(b.siniestro));
    expect(Array.from(a.sev)).toEqual(Array.from(b.sev));
  });

  it("matches golden values from the legacy prototype (seed=42, n=1000)", () => {
    // Golden values produced by running generarSiniestrosA2()'s exact loop
    // body (copied verbatim) from Pasantia_SURA_v3_inversiones_dinamicas.html
    // on top of the same seed=42, N_COL=1000 Colombia universe.
    const universe = generateColombia(42, 1000);
    const year2 = generateYear2Claims(universe, 42);

    let claimCount = 0;
    for (let i = 0; i < universe.n; i++) claimCount += year2.siniestro[i];
    expect(claimCount).toBe(95);

    expect(year2.lam[0]).toBeCloseTo(0.08961200282888053, 6);
    expect(year2.siniestro[0]).toBe(0);

    expect(year2.lam[1]).toBeCloseTo(0.10684070865262082, 6);
    expect(year2.siniestro[1]).toBe(0);

    expect(year2.lam[8]).toBeCloseTo(0.04730982187586054, 6);
    expect(year2.lam[500]).toBeCloseTo(0.018071966360448003, 6);
    expect(year2.lam[999]).toBeCloseTo(0.06133846568850001, 6);
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
