import { describe, expect, it } from "vitest";
import { generateColombia } from "../generation/generateColombia";
import { FZ } from "../finance/constants";
import { generateOutsourcedTariff, meanPremium, OUTSOURCED_TARGET_LOSS_RATIO, OUTSOURCED_CONSULTING_FEE_PCT } from "./outsourced";

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
    // mean(premium) = realizedAvgIncurred / targetLossRatio, by construction
    // (see generateOutsourcedTariff's rescaling) — this is what makes
    // OUTSOURCED_TARGET_LOSS_RATIO mean what it says regardless of how far
    // calcLambda x calcMediaSev's raw average drifts from what a given seed
    // actually realizes.
    const u = generateColombia(42, 5000);
    const premiums = generateOutsourcedTariff(u);
    const expected = realizedAvgIncurred(u) / OUTSOURCED_TARGET_LOSS_RATIO;
    const actual = meanPremium(premiums);
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.05);
  });

  it("realizes exactly OUTSOURCED_TARGET_LOSS_RATIO — the consulting fee no longer distorts the price", () => {
    // The fee used to be a haircut on this tariff, which made the realized
    // loss ratio target/(1-fee) rather than the target itself. It's a P&G
    // expense now (PnL.gConsultoria), so the price says what it means.
    const u = generateColombia(42, 5000);
    const premiums = generateOutsourcedTariff(u);
    const impliedLossRatio = realizedAvgIncurred(u) / meanPremium(premiums);
    expect(impliedLossRatio).toBeCloseTo(OUTSOURCED_TARGET_LOSS_RATIO, 2);
  });

  it("prices above cost — outsourcing is a bad deal, not an automatic insolvency", () => {
    // An earlier calibration priced BELOW cost (effective loss ratio 1.14),
    // which made this tariff the cheapest in any market and handed the team
    // the largest book in the cohort at a guaranteed per-policy loss: a team
    // that outsourced ended Año 1 with negative patrimonio every time. See
    // OUTSOURCED_TARGET_LOSS_RATIO's doc comment for the replay this is
    // pinned against.
    const u = generateColombia(42, 5000);
    const premiums = generateOutsourcedTariff(u);
    expect(meanPremium(premiums)).toBeGreaterThan(realizedAvgIncurred(u));
    expect(OUTSOURCED_TARGET_LOSS_RATIO).toBeLessThan(1);
  });

  it("leaves underwriting at break-even, so the fee is what costs the team money", () => {
    // gAdq + gCom + gAdmin = 25% of Prima Emitida, so a 0.75 loss ratio is
    // exactly zero Resultado Industrial in steady state — before honorarios.
    expect(OUTSOURCED_TARGET_LOSS_RATIO + FZ.gAdq + FZ.gCom + FZ.gAdmin).toBeCloseTo(1, 10);
    expect(OUTSOURCED_CONSULTING_FEE_PCT).toBeGreaterThan(0);
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
