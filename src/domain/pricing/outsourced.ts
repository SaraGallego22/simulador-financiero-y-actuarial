import { getExposure } from "../generation/generateColombia";
import type { ColombiaUniverse } from "../generation/generateColombia";
import { calcLambda } from "./frequency";
import { calcMediaSev } from "./severity";

/**
 * Loss ratio (siniestros ÷ Prima Emitida) the "Tercerizar tarifas" emergency
 * tariff is priced to *in the risk band it actually competes for* — see
 * shapeMultiplier()'s doc comment for why this is no longer a single flat
 * loss ratio across every exposure. The consultancy's own fee is a P&G
 * expense on top, not a discount on the price (see
 * OUTSOURCED_CONSULTING_FEE_PCT).
 *
 * 0.95 is deliberately worse than underwriting break-even: once the RPND
 * holdback releases, Resultado Industrial = primaEmitida −
 * (gAdq+gCom+gAdmin = 25%) − costo, so break-even sits at loss ratio 0.75
 * (see this constant's own prior value/history in git blame). Pricing the
 * band it competes for to 0.95 leaves underwriting itself a real loss before
 * OUTSOURCED_CONSULTING_FEE_PCT is even charged — a worse outcome than the
 * original "break-even underwriting, the fee is what costs money" design,
 * by request: outsourcing should land a team clearly in the bottom of the
 * cohort (not top-half-with-an-asterisk), while staying well short of the
 * −$162B/quiebra scenario an earlier below-cost revision produced (see
 * shapeMultiplier()'s doc comment for why this version can't repeat that:
 * it no longer wins the whole market to begin with). Not yet re-verified
 * against a full 12-team replay for Cohorte 2026 (only 4 of 12 teams had
 * submitted Día 1 tariffs at the time this was calibrated) — re-check
 * against finBench() once the full cohort is in, the way the original 0.75
 * was calibrated against a real 12-team market (see this constant's git
 * history for that table).
 */
export const OUTSOURCED_TARGET_LOSS_RATIO = 0.95;

/**
 * The consultancy's fee, as a fraction of the team's Prima Emitida for the
 * year it priced. A real expense the team pays, NOT a discount on the
 * tariff: it raises that year's *gastos de adquisición* from FZ.gAdq to
 * FZ.gAdq + this (4% -> 12%), rather than adding a P&G line of its own — see
 * PnL.gadq in finBench.ts. Pricing the book is part of what it costs to
 * acquire it, so it sits inside Resultado Técnico with the rest of the
 * acquisition load (computeRt() in grading/composite.ts mirrors this), and
 * leaves the ALM's monthly cash as real money out alongside the ordinary
 * expense ratio (see almSimRealYear()'s extraGastosPct in alm.ts).
 *
 * At 8% it's deliberately large next to the ordinary expense ratios (gAdq
 * 4%, gCom 15%, gAdmin 6%) — it's the cost of having someone else do the
 * core technical work of the business, on top of a book that OUTSOURCED_TARGET_LOSS_RATIO
 * already leaves underpriced in the band it competes for.
 */
export const OUTSOURCED_CONSULTING_FEE_PCT = 0.08;

/**
 * How many times pricier than the competitive band's price
 * (rawPure × plateauFactor, see generateOutsourcedTariff) the tariff becomes
 * at the safest exposures in the universe — see shapeMultiplier(). The two
 * walls are deliberately asymmetric, not just calibrated to clear real
 * teams' Día 1 relativities (lowest-risk decile: 3.9x-6.5x across the 4
 * teams submitted so far in Cohorte 2026; highest-risk decile: 1.4x-1.8x —
 * see OUTSOURCED_WALL_MULTIPLIER_HIGH for why the high-risk side uses a much
 * smaller number): the safest exposures' raw risk is small in dollar terms
 * (low tens/hundreds of thousands), so even a large multiplier there barely
 * moves the tariff's Pearson correlation with real risk — it only has to
 * clear real teams' Día 1 relativity, which a flat multiplier does cheaply.
 * generateOutsourcedTariff stays a pure function of the universe alone (see
 * its own doc comment) — these are fixed multipliers picked from what real
 * teams' relativities look like historically, not a runtime lookup.
 */
const OUTSOURCED_WALL_MULTIPLIER_LOW = 8;

/**
 * The riskiest exposures' raw risk is already large in dollar terms (single
 * exposures near $9-10M), so this wall can't reuse
 * OUTSOURCED_WALL_MULTIPLIER_LOW without keeping the tariff almost perfectly
 * correlated with real risk — a large multiplier on an already-large value
 * dominates the whole array's variance and makes the valley's dip in the
 * middle a rounding error by comparison (measured: 6x on both sides left
 * Pearson r ≈0.98, barely different from the original flat design's 1.0).
 * 2.2x is still comfortably above every team's observed highest-risk-decile
 * relativity (1.4x-1.8x, see OUTSOURCED_WALL_MULTIPLIER_LOW) while keeping
 * the riskiest exposures' dollar contribution from swamping the shape —
 * this is what actually breaks the correlation (see this file's tests).
 */
const OUTSOURCED_WALL_MULTIPLIER_HIGH = 2.2;

/** Risk-percentile rank (0 = safest exposure in the universe, 1 = riskiest) below which shapeMultiplier() is at full wall height, no longer tapering. */
const WALL_LOW = 0.25;
/** Risk-percentile rank above which shapeMultiplier() has fully descended to the competitive valley — the wall-to-valley taper spans (WALL_LOW, VALLEY_LOW). */
const VALLEY_LOW = 0.35;
/** Risk-percentile rank below which shapeMultiplier() is still flat at the valley floor — the mirror of VALLEY_LOW on the high-risk side. */
const VALLEY_HIGH = 0.75;
/** Risk-percentile rank above which shapeMultiplier() is back at full wall height — the valley-to-wall taper spans (VALLEY_HIGH, WALL_HIGH). */
const WALL_HIGH = 0.85;

/** Smooth 0→1 ease used at both wall/valley tapers (3t²−2t³) — continuous first derivative, so the tariff has no price discontinuity an exposure could land right on. */
function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/**
 * Maps a risk-percentile rank (0=safest, 1=riskiest) to a multiplier on the
 * competitive-band price: 1× inside the valley [VALLEY_LOW, VALLEY_HIGH],
 * OUTSOURCED_WALL_MULTIPLIER× outside [WALL_LOW, WALL_HIGH], smoothly
 * tapered in between.
 *
 * This replaces the tariff's original shape — a single flat loading over
 * calcLambda×calcMediaSev, correlation ≈1.0 with real risk by construction
 * (see git history) — with a deliberately non-monotonic one, by request: the
 * emergency tariff should win the *middle* of the risk distribution cheaply
 * (an underpriced, insufficient book) while staying structurally
 * uncompetitive at both the safest and riskiest ends, rather than winning
 * the whole market by being the overall cheapest option (which is what a
 * uniformly-loaded, thin-margin, risk-correlated tariff does in
 * runSimulation()'s price-driven logit choice — see its doc comment: cheaper
 * relative to the rest of the market wins the exposure, full stop, with no
 * risk-band awareness of its own).
 *
 * The wall/valley split is a fixed shape in rank-space, not tuned against
 * any specific team's live tariff (that would break the "pure function of
 * the universe alone" contract generateOutsourcedTariff has always had —
 * see its doc comment) — it's informed by the shape real Día 1 tariffs
 * empirically take (see OUTSOURCED_WALL_MULTIPLIER's doc comment), not
 * dependent on it at runtime.
 */
function shapeMultiplier(rank: number): number {
  if (rank <= WALL_LOW) return OUTSOURCED_WALL_MULTIPLIER_LOW;
  if (rank >= WALL_HIGH) return OUTSOURCED_WALL_MULTIPLIER_HIGH;
  if (rank < VALLEY_LOW) {
    const t = smoothstep((rank - WALL_LOW) / (VALLEY_LOW - WALL_LOW));
    return OUTSOURCED_WALL_MULTIPLIER_LOW - (OUTSOURCED_WALL_MULTIPLIER_LOW - 1) * t;
  }
  if (rank <= VALLEY_HIGH) return 1;
  const t = smoothstep((rank - VALLEY_HIGH) / (WALL_HIGH - VALLEY_HIGH));
  return 1 + (OUTSOURCED_WALL_MULTIPLIER_HIGH - 1) * t;
}

/**
 * Deterministic, per-exposure "emergency tariff" for a team that couldn't
 * price in time — narratively, a Chilean consultancy with no experience in
 * the Colombian market. Uses the *real* frequency/severity model
 * (calcLambda/calcMediaSev — the same relativities the actual market runs
 * on, so an inexperienced-but-not-incompetent firm still ranks risk
 * correctly within the band it competes for) loaded to
 * OUTSOURCED_TARGET_LOSS_RATIO across a risk-percentile "valley", shaped by
 * shapeMultiplier() to be structurally uncompetitive at both risk extremes —
 * see that function's doc comment for the full rationale. Since
 * runSimulation()'s market clears purely on relative price, this means the
 * tariff tends to win the *middle* of the risk distribution at a loss,
 * rather than the whole market at a thin margin.
 *
 * The loading is uniform *within* the valley, so relative risk ranking stays
 * correct there, and the realized loss ratio for whatever the market awards
 * it in that band is the designed one however the market clears — same
 * reasoning as the original flat design (see git history), just scoped to
 * the band that's actually competitive now instead of the whole book.
 *
 * calcLambda x calcMediaSev is the textbook pure-premium formula and ranks
 * relative risk across exposures correctly, but its population average can
 * drift from what a given universe draw actually realizes (measured against
 * generateColombia(42): the textbook average and the realized
 * claims-experience average differ by ~30%, since `sev`'s Gamma draws and
 * `siniestro`'s occurrence draws both add sampling variance on top of the
 * formula's point estimate). Rescaling to the universe's own realized
 * average incurred cost (`siniestro`/`sev`, already generated) keeps
 * OUTSOURCED_TARGET_LOSS_RATIO meaning what it says for any seed, instead of
 * silently pricing worse (or better) than intended.
 *
 * Pure function of the universe alone (no team-specific randomness, no
 * dependency on any other team's submitted tariff) — like the universe
 * itself, this is never persisted as a stored array (see getTariffArray() in
 * lib/tariffAccess.ts); it's regenerated on demand from the same seed every
 * time, at the same ~1M-row typed-array cost as the rest of the engine (see
 * CLAUDE.md §4.1). The one added cost versus the original flat design is a
 * single O(n log n) sort of exposure indices by raw risk to derive each
 * exposure's percentile rank — the same "sort an Int32Array of indices with
 * a numeric comparator" pattern runSimulation() already uses for its Phase 2
 * rationing, not a new one.
 */
export function generateOutsourcedTariff(universe: ColombiaUniverse): Float32Array {
  const n = universe.n;
  const rawPure = new Float32Array(n);
  let rawSum = 0;
  let realizedSum = 0;
  for (let i = 0; i < n; i++) {
    const e = getExposure(universe, i);
    const p = calcLambda(e) * calcMediaSev(e);
    rawPure[i] = p;
    rawSum += p;
    if (universe.siniestro[i]) realizedSum += universe.sev[i];
  }
  const rawAvg = rawSum / n;
  const scaleCorrection = rawAvg > 0 ? realizedSum / n / rawAvg : 1;
  const plateauFactor = scaleCorrection / OUTSOURCED_TARGET_LOSS_RATIO;

  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => rawPure[a] - rawPure[b]);
  const rank = new Float32Array(n);
  for (let k = 0; k < n; k++) rank[order[k]] = n > 1 ? k / (n - 1) : 0;

  const premiums = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    premiums[i] = rawPure[i] * plateauFactor * shapeMultiplier(rank[i]);
  }
  return premiums;
}

export function meanPremium(premiums: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < premiums.length; i++) sum += premiums[i];
  return sum / premiums.length;
}
