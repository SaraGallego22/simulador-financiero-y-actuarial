import { FZ, CORR_MOD } from "./constants";
import { INSTRUMENT_BY_ID, VOL_MENU_AVG } from "./instruments";
import type { MonthlyAllocationEntry } from "./instruments";

/**
 * Solvency-derived market-share cap: how much premium volume — and, from
 * that, how many policies — a team's *available capital* can support
 * while keeping its solvency margin at CAPACITY_TARGET_MARGIN, using the
 * exact same risk-charge shape finBench() uses for Día 4 (rSusc/rFin/rOp
 * combined via CORR_MOD into rk, compared against fondosPropios). This is
 * finBench()'s solvency formula solved in the opposite direction:
 * finBench() asks "given this premium, what's your margin"; this asks
 * "given this capital, what premium keeps your margin at the target".
 *
 * Replaces the old uniform admin-set cuotaPct as what actually rejects
 * excess demand in runSimulation()/runSimulationYear2() — cuotaPct itself
 * stays as an absolute ceiling nobody can exceed regardless of capital,
 * but the *binding* constraint for most teams is now their own capital,
 * not a number every team shares. See README §(market) for the full
 * writeup and the two-year feedback loop this creates with Día 4.
 */

/** 1.0 = "exactly at the solvency line, no cushion" — deliberately distinct from FZ.targetMargin (1.5), which is the *dividend-eligibility* bar, a stricter target than merely staying solvent. Sizing capacity to the dividend bar would be needlessly conservative; sizing it to bare solvency is the realistic regulatory floor. */
export const CAPACITY_TARGET_MARGIN = 1.0;

/**
 * Of a team's total Year-1 incurred severity, ~86.1% remains as reserve at
 * the end of Year 1 — measured against generateColombia(42) via
 * computeLiabilitySchedules (see CAPITAL_SOCIAL's derivation in
 * constants.ts). This ratio comes from the universe-wide notice-lag +
 * payment-lag distributions alone, not from how big a team's book is, so
 * it generalizes to any team size/share.
 */
const RESERVE_TO_INCURRED_RATIO = 0.861;

/**
 * Reference loss ratio (siniestros ÷ Prima EMITIDA — deliberately not
 * Devengada, unlike every other "loss ratio" in this codebase, see below)
 * assumed for capacity sizing — the midpoint of the 0.85 ("grow") / 1.0
 * ("shrink") healthy band, not a number invented for this feature alone. A
 * team pricing to land inside that band is assumed sustainable; capacity is
 * sized as if every team does, since there's no way to know each team's
 * *actual* realized loss ratio before the market that determines it has
 * even cleared.
 *
 * Emitida, not Devengada, on purpose: this isn't a performance measure of a
 * completed year (that's computeRt()/finBench()'s `rt`/solSigmaLR, both
 * Devengada-based) — it's a forward-looking assumption converting a
 * reserve into the *written* premium volume needed to justify it, feeding
 * riskCapitalForPremium()'s `premium` argument, which is itself Prima
 * Emitida (the market-clearing variable maxPoliciesForCapital() ultimately
 * solves for — see its own doc comment). There's no earned/unearned split
 * to speak of before a policy has even been written.
 */
const REFERENCE_LOSS_RATIO = 0.925;

/** Reserve as a fraction of premium, for capacity sizing only — ≈0.796. Real reserves (once known) are computed properly by computeLiabilitySchedules(); this is only ever used to size a cap ahead of a market clearing, never to grade anything. */
export const RESERVE_TO_PREMIUM_RATIO = RESERVE_TO_INCURRED_RATIO * REFERENCE_LOSS_RATIO;

/**
 * Weighted-average volatility ratio of a plain {instrumentId: weight} map,
 * relative to VOL_MENU_AVG (1 = same as the menu average). Shared by
 * nominalPortfolioVolRatio() (extracts this shape from a schedule's month-0
 * checkpoint) and Año 1's capacity calc (capacityHelper.ts), which sources
 * the weights from a team's Día 1 minimum-variance submission instead — both
 * only ever need instrumentId+weight pairs, so this is the one
 * normalization implementation. No weights at all -> 1 (the flat,
 * pre-volatility charge).
 */
export function volRatioFromWeights(weights: Record<string, number> | null): number {
  if (!weights) return 1;
  const entries = Object.entries(weights).filter(([id, w]) => INSTRUMENT_BY_ID[id] && w > 0);
  const totalW = entries.reduce((s, [, w]) => s + w, 0);
  if (totalW <= 0) return 1;
  const avgVol = entries.reduce((s, [id, w]) => s + (w / totalW) * INSTRUMENT_BY_ID[id].volAnual, 0);
  return avgVol / VOL_MENU_AVG;
}

/**
 * Decision-only (no simulation) weighted-average volatility ratio of a
 * schedule's starting (month-0) allocation — see volRatioFromWeights(),
 * which this just extracts the {instrumentId: weight} pairs for.
 */
export function nominalPortfolioVolRatio(schedule: MonthlyAllocationEntry[] | null): number {
  if (!schedule || schedule.length === 0) return 1;
  return volRatioFromWeights(schedule[0].allocation);
}

/**
 * finBench()'s rk (total risk capital) re-expressed as a pure function of
 * premium volume, available capital, and volRatio alone — reserves and
 * inversiones are approximated proportionally to premium (via
 * RESERVE_TO_PREMIUM_RATIO and finBench()'s own fixed expense ratios),
 * and patrimonio is approximated as availableCapital itself (ignoring
 * retained earnings not yet known before the market clears — a
 * deliberately conservative simplification, since real patrimonio can
 * only be equal to or higher than this once earnings are in). Every term
 * is non-negative and non-decreasing in premium, so this is monotonically
 * increasing in premium — required for maxPremiumForCapital's binary
 * search to be well-posed.
 */
function riskCapitalForPremium(premium: number, availableCapital: number, volRatio: number): number {
  const reservas = RESERVE_TO_PREMIUM_RATIO * premium;
  const rPrimas = FZ.primeVol * premium;
  const rReservas = FZ.resVol * reservas;
  const rSusc = Math.sqrt(rPrimas * rPrimas + rReservas * rReservas + 2 * FZ.corrPR * rPrimas * rReservas);

  const cxp = FZ.cxpPct * premium;
  const caja = FZ.cajaPct * premium;
  const cxc = (FZ.diasRotacionCxc * premium) / 365;
  const inversiones = reservas + cxp + availableCapital - caja - cxc;
  const rFin = FZ.finRiskPct * inversiones * volRatio;
  const rOp = FZ.opPct * premium;

  const R = [rSusc, rFin, rOp];
  let rk2 = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rk2 += CORR_MOD[i][j] * R[i] * R[j];
  return Math.sqrt(Math.max(0, rk2));
}

/**
 * Maximum premium volume `availableCapital` can support while keeping
 * `availableCapital / riskCapitalForPremium(P, ...) >= CAPACITY_TARGET_MARGIN`
 * — solved by binary search (riskCapitalForPremium is monotonically
 * increasing in P, so the margin is monotonically decreasing, so there's a
 * unique crossing point) rather than a hand-derived closed form, so this
 * stays trivially auditable against the real formula above instead of an
 * algebraically-simplified stand-in for it.
 */
export function maxPremiumForCapital(availableCapital: number, volRatio: number): number {
  if (availableCapital <= 0) return 0;

  const targetRk = availableCapital / CAPACITY_TARGET_MARGIN;
  let hi = availableCapital;
  while (riskCapitalForPremium(hi, availableCapital, volRatio) < targetRk) hi *= 2;

  let lo = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (riskCapitalForPremium(mid, availableCapital, volRatio) < targetRk) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Converts a capital-derived maximum premium volume into a maximum policy
 * count, using the team's own average submitted tariff (known before the
 * market clears — it's the team's own CSV). This is the raw, pre-ceiling
 * cap runSimulation()/runSimulationYear2() clamp against the admin's
 * cuotaPct ceiling to get each team's actual Phase 2 limit.
 */
export function maxPoliciesForCapital(availableCapital: number, volRatio: number, avgOwnPremium: number): number {
  if (avgOwnPremium <= 0) return 0;
  return Math.floor(maxPremiumForCapital(availableCapital, volRatio) / avgOwnPremium);
}
