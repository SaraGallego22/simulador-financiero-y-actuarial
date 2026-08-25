import { describe, expect, it } from "vitest";
import { generateColombia, getExposure } from "../generation/generateColombia";
import { calcLambda } from "./frequency";
import { calcMediaSev } from "./severity";
import { FZ } from "../finance/constants";
import { generateOutsourcedTariff, meanPremium, OUTSOURCED_TARGET_LOSS_RATIO, OUTSOURCED_CONSULTING_FEE_PCT } from "./outsourced";

function realizedAvgIncurred(u: ReturnType<typeof generateColombia>): number {
  let sum = 0;
  for (let i = 0; i < u.n; i++) if (u.siniestro[i]) sum += u.sev[i];
  return sum / u.n;
}

/** Real-risk percentile rank of every exposure (0=safest, 1=riskiest), same construction generateOutsourcedTariff uses internally. */
function riskRanks(u: ReturnType<typeof generateColombia>): Float64Array {
  const raw = new Float64Array(u.n);
  for (let i = 0; i < u.n; i++) {
    const e = getExposure(u, i);
    raw[i] = calcLambda(e) * calcMediaSev(e);
  }
  const order = new Int32Array(u.n);
  for (let i = 0; i < u.n; i++) order[i] = i;
  order.sort((a, b) => raw[a] - raw[b]);
  const rank = new Float64Array(u.n);
  for (let k = 0; k < u.n; k++) rank[order[k]] = k / (u.n - 1);
  return rank;
}

/** Mean premium/mean-real-risk factor for exposures whose risk rank falls in [lo, hi). */
function factorInRankBand(
  u: ReturnType<typeof generateColombia>,
  premiums: Float32Array,
  rank: Float64Array,
  lo: number,
  hi: number
): number {
  let sumRisk = 0;
  let sumPremium = 0;
  let count = 0;
  for (let i = 0; i < u.n; i++) {
    if (rank[i] < lo || rank[i] >= hi) continue;
    const e = getExposure(u, i);
    sumRisk += calcLambda(e) * calcMediaSev(e);
    sumPremium += premiums[i];
    count++;
  }
  return sumPremium / sumRisk;
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

  it("realizes exactly OUTSOURCED_TARGET_LOSS_RATIO inside the competitive middle band", () => {
    // Only exposures in the flat valley (shapeMultiplier===1) get the pure
    // rawPure × plateauFactor loading; that's where the target loss ratio
    // applies exactly, same as the old flat design did for every exposure.
    const u = generateColombia(42, 20000);
    const premiums = generateOutsourcedTariff(u);
    const rank = riskRanks(u);
    let incurred = 0;
    let premiumSum = 0;
    for (let i = 0; i < u.n; i++) {
      if (rank[i] < 0.4 || rank[i] > 0.7) continue; // safely inside [VALLEY_LOW, VALLEY_HIGH]
      if (u.siniestro[i]) incurred += u.sev[i];
      premiumSum += premiums[i];
    }
    const impliedLossRatio = incurred / premiumSum;
    expect(impliedLossRatio).toBeCloseTo(OUTSOURCED_TARGET_LOSS_RATIO, 1);
  });

  it("is deliberately worse than underwriting break-even (0.75) — an insufficient tariff by design", () => {
    // gAdq + gCom + gAdmin = 25%, so 0.75 is the break-even loss ratio; the
    // competitive band is priced above that on purpose (see this constant's
    // doc comment), unlike the original design which targeted break-even
    // exactly and let the consulting fee alone cause the loss.
    expect(OUTSOURCED_TARGET_LOSS_RATIO).toBeGreaterThan(1 - FZ.gAdq - FZ.gCom - FZ.gAdmin);
    expect(OUTSOURCED_TARGET_LOSS_RATIO).toBeLessThan(1);
    expect(OUTSOURCED_CONSULTING_FEE_PCT).toBeGreaterThan(0);
  });

  it("charges the safest and riskiest exposures well above what it charges the risk-median ones", () => {
    // The whole point of the U-shape: undercut the middle of the risk
    // distribution, stay uncompetitive at both extremes.
    const u = generateColombia(42, 20000);
    const premiums = generateOutsourcedTariff(u);
    const rank = riskRanks(u);
    const safeFactor = factorInRankBand(u, premiums, rank, 0, 0.1);
    const middleFactor = factorInRankBand(u, premiums, rank, 0.45, 0.55);
    const riskyFactor = factorInRankBand(u, premiums, rank, 0.9, 1.0);
    expect(safeFactor).toBeGreaterThan(middleFactor * 3);
    expect(riskyFactor).toBeGreaterThan(middleFactor);
  });

  it("is not monotonically increasing in real risk (Spearman correlation well below the old design's 1.0)", () => {
    const u = generateColombia(42, 20000);
    const premiums = generateOutsourcedTariff(u);
    const rank = riskRanks(u);
    // rank of the premium itself
    const order = new Int32Array(u.n);
    for (let i = 0; i < u.n; i++) order[i] = i;
    order.sort((a, b) => premiums[a] - premiums[b]);
    const premiumRank = new Float64Array(u.n);
    for (let k = 0; k < u.n; k++) premiumRank[order[k]] = k / (u.n - 1);

    let sx = 0, sy = 0;
    for (let i = 0; i < u.n; i++) { sx += rank[i]; sy += premiumRank[i]; }
    const mx = sx / u.n, my = sy / u.n;
    let cov = 0, vx = 0, vy = 0;
    for (let i = 0; i < u.n; i++) {
      const dx = rank[i] - mx, dy = premiumRank[i] - my;
      cov += dx * dy; vx += dx * dx; vy += dy * dy;
    }
    const spearman = cov / Math.sqrt(vx * vy);
    expect(spearman).toBeLessThan(0.85);
  });

  it("prices above cost on average — outsourcing is a bad deal, not an automatic insolvency", () => {
    // An earlier calibration priced BELOW cost across the whole book, which
    // made this tariff the cheapest option in any market and handed the
    // team the largest book in the cohort at a guaranteed per-policy loss.
    // The wall/valley shape keeps the tariff from being cheapest everywhere
    // even though the valley band alone is priced insufficiently.
    const u = generateColombia(42, 5000);
    const premiums = generateOutsourcedTariff(u);
    expect(meanPremium(premiums)).toBeGreaterThan(realizedAvgIncurred(u));
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
