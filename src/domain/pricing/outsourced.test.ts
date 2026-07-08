import { describe, expect, it } from "vitest";
import { generateColombia } from "../generation/generateColombia";
import { generateOutsourcedTariff, meanPremium, OUTSOURCED_TARGET_LOSS_RATIO, OUTSOURCED_CONSULTING_HAIRCUT } from "./outsourced";

function realizedAvgIncurred(u: ReturnType<typeof generateColombia>): number {
  let sum = 0;
  for (let i = 0; i < u.n; i++) if (u.siniestro[i]) sum += u.sev[i];
  return sum / u.n;
}

describe("generateOutsourcedTariff", () => {
  it("is deterministic: same universe produces identical premiums", () => {
    const u = generateColombia(42, 2000);
    const a = generateOutsourcedTariff(u);
    const b = generateOutsourcedTariff(u);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("every premium is positive", () => {
    const u = generateColombia(42, 2000);
    const premiums = generateOutsourcedTariff(u);
    for (let i = 0; i < u.n; i++) expect(premiums[i]).toBeGreaterThan(0);
  });

  it("calibrates its average premium to the universe's own realized claims experience, not the textbook formula's raw average", () => {
    // mean(premium) = realizedAvgIncurred * (1 - haircut) / targetLossRatio,
    // by construction (see generateOutsourcedTariff's rescaling) — this is
    // what makes OUTSOURCED_TARGET_LOSS_RATIO mean what it says regardless
    // of how far calcLambda x calcMediaSev's raw average drifts from what a
    // given seed actually realizes.
    const u = generateColombia(42, 5000);
    const premiums = generateOutsourcedTariff(u);
    const expected = realizedAvgIncurred(u) * ((1 - OUTSOURCED_CONSULTING_HAIRCUT) / OUTSOURCED_TARGET_LOSS_RATIO);
    const actual = meanPremium(premiums);
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.05);
  });

  it("implies a loss ratio worse than the unhealthy threshold once the consulting haircut is included", () => {
    const u = generateColombia(42, 5000);
    const premiums = generateOutsourcedTariff(u);
    const impliedLossRatio = realizedAvgIncurred(u) / meanPremium(premiums);
    expect(impliedLossRatio).toBeGreaterThan(OUTSOURCED_TARGET_LOSS_RATIO);
  });

  it("varies risk-appropriately across exposures (not a flat rate)", () => {
    const u = generateColombia(42, 2000);
    const premiums = generateOutsourcedTariff(u);
    const distinct = new Set(Array.from(premiums));
    expect(distinct.size).toBeGreaterThan(1);
  });
});

describe("meanPremium", () => {
  it("averages a Float32Array", () => {
    expect(meanPremium(new Float32Array([100, 200, 300]))).toBeCloseTo(200, 5);
  });
});
