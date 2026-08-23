import { getExposure } from "../generation/generateColombia";
import type { ColombiaUniverse } from "../generation/generateColombia";
import { calcLambda } from "./frequency";
import { calcMediaSev } from "./severity";

/**
 * Loss ratio (siniestros ÷ Prima Emitida) the "Tercerizar tarifas" emergency
 * tariff is priced to. This is the ONLY thing that shapes the tariff — the
 * consultancy's own fee is a P&G expense, not a discount on the price (see
 * OUTSOURCED_CONSULTING_FEE_PCT).
 *
 * 0.75 is exactly the underwriting break-even of this model in steady state:
 * once the RPND holdback releases, Resultado Industrial = primaEmitida −
 * (gAdq+gCom+gAdmin = 25%) − costo, so a 0.75 loss ratio leaves precisely
 * zero. In other words the consultancy prices the book to make no money and
 * lose none either, and then charges its fee on top — the fee is what puts
 * the team under. That's the whole shape of the penalty, and it's why these
 * two constants have to stay separate.
 *
 * Calibrated empirically against a replay of a real 12-team Día 1 market
 * (the demo cohort's own submitted tariffs, seed 42), repricing this tariff
 * across a range of levels and reading off the Año-1 P&L and patrimonio each
 * produced (fee held at 8% of Prima Emitida throughout):
 *
 *   LR 0.85 -> prima media $2.79M, patrimonio  +$15B  (9th of 12)
 *   LR 0.80 -> prima media $2.96M, patrimonio  +$38B  (9th of 12)
 *   LR 0.75 -> prima media $3.16M, patrimonio  +$64B  (8th of 12)
 *   LR 0.70 -> prima media $3.39M, patrimonio  +$80B  (8th of 12)
 *   LR 0.60 -> prima media $3.95M, patrimonio +$105B  (6th of 12)
 *
 * An earlier revision priced this tariff *below* cost (an effective loss
 * ratio of 1.14, once a consulting "haircut" was taken out of the premium
 * itself). That was an automatic bankruptcy, not a penalty: pricing below
 * cost made it the cheapest tariff in any market, which won it the largest
 * book in the cohort — a guaranteed per-policy loss multiplied by the
 * biggest possible volume, ending Año 1 at −$162B of patrimonio against a
 * $120B Capital Social. A team that outsources has to still have a Día
 * 2/3/4 to play.
 *
 * Emitida, not Devengada, on purpose — same reasoning as capacity.ts's
 * REFERENCE_LOSS_RATIO (see its own doc comment): this sets a *price per
 * policy* before any policy has been written, let alone earned out, so
 * there's no unearned-premium split to divide by yet. It's a pricing input,
 * not a performance measure of a completed year (that's computeRt()/
 * finBench()'s `rt` and solSigmaLR, both Devengada-based). Note that Año 1's
 * own RPND holdback still makes 0.75 an Año-1 technical loss, as it is for
 * most of the cohort — break-even only arrives once the holdback releases.
 */
export const OUTSOURCED_TARGET_LOSS_RATIO = 0.75;

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
 * It used to be modeled as a haircut on the tariff instead, which had it
 * exactly backwards: paying a consultant made the team's prices *lower*,
 * which won it more business — a fee that behaved like a competitive
 * advantage. As an expense line it does what a fee actually does: leaves the
 * price alone and takes money off the bottom line.
 *
 * At 8% it's deliberately large next to the ordinary expense ratios (gAdq
 * 4%, gCom 15%, gAdmin 6%) — it's the cost of having someone else do the
 * core technical work of the business, and it's what turns
 * OUTSOURCED_TARGET_LOSS_RATIO's break-even book into a losing one.
 */
export const OUTSOURCED_CONSULTING_FEE_PCT = 0.08;

/**
 * Deterministic, per-exposure "emergency tariff" for a team that couldn't
 * price in time — narratively, a Chilean consultancy with no experience in
 * the Colombian market. Uses the *real* frequency/severity model
 * (calcLambda/calcMediaSev — the same relativities the actual market runs
 * on, so an inexperienced-but-not-incompetent firm still ranks risks
 * correctly) loaded to OUTSOURCED_TARGET_LOSS_RATIO: a thinner margin than a
 * team pricing its own book carefully tends to leave itself, so the tariff
 * comes out cheap, wins a large book, and earns nothing on it — before the
 * consultancy's own fee (OUTSOURCED_CONSULTING_FEE_PCT), which the P&G then
 * charges separately.
 *
 * The loading is uniform, so the risk ranking stays correct and the realized
 * loss ratio is the designed one however the market clears — including under
 * Phase 2 rationing, which keeps a team's highest-premium policies and
 * therefore, for a risk-proportional tariff, its highest-cost ones in the
 * same proportion. What the market decides is the *volume* that ratio
 * applies to, which is what makes the cost of outsourcing depend on where
 * the rest of the cohort priced.
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
 * Pure function of the universe alone (no team-specific randomness) — like
 * the universe itself, this is never persisted as a stored array (see
 * getTariffArray() in lib/tariffAccess.ts); it's regenerated on demand from
 * the same seed every time, at the same ~1M-row typed-array cost as the rest
 * of the engine (see CLAUDE.md §4.1).
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

  const loadFactor = scaleCorrection / OUTSOURCED_TARGET_LOSS_RATIO;
  const premiums = new Float32Array(n);
  for (let i = 0; i < n; i++) premiums[i] = rawPure[i] * loadFactor;
  return premiums;
}

export function meanPremium(premiums: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < premiums.length; i++) sum += premiums[i];
  return sum / premiums.length;
}
