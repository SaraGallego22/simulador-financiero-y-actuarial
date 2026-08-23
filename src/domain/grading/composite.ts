import { RT_EXPENSE_PCT, FZ } from "../finance/constants";

/** Shared input shape for computeRt() — see its doc comment for why this now mirrors finBench.ts's pyg() exactly. */
export interface RtInputs {
  /** Prima Emitida — what was actually charged/collected, before any RPND holdback. */
  totalPremium: number;
  claimsAmount: number;
  /** The PRIOR year's own 20% RPND holdback, now released as revenue this year (FZ.rpndPct × prior year's totalPremium) — 0/undefined for Año 1, which has no prior year. See finBench.ts's pyg() `rpndLiberada` param, which this must stay in lockstep with. */
  rpndLiberada?: number;
  /** OUTSOURCED_CONSULTING_FEE_PCT for a team that outsourced THIS year's tariff, 0/undefined otherwise — the consultancy's fee rides inside gastos de adquisición (see PnL.gadq in finBench.ts), so it's part of the expense load RT subtracts and this must stay in lockstep with pyg(). */
  acquisitionFeePct?: number;
}

/**
 * RT (resultado técnico) — Prima Devengada minus claims minus the
 * acquisition/commission expense load (RT_EXPENSE_PCT, still charged on
 * Prima Emitida — deliberately NOT gasto administrativo, which lands on
 * its own line, Resultado Industrial, see finBench.ts's pyg()), plus
 * `acquisitionFeePct` for a team that outsourced this year's tariff. Same
 * shape as finBench()'s own `rt` — kept as one shared definition so "RT"
 * means the same thing everywhere it's computed or displayed (grading
 * here, the P&L there, the admin panel), instead of two similarly-named
 * but different numbers.
 *
 * Built from Prima Devengada (totalPremium × (1 − FZ.rpndPct) +
 * rpndLiberada), not raw totalPremium — a team's technical result
 * genuinely depends on the unearned-premium accounting timing: only the
 * earned share of what it charged counts as revenue this year, exactly
 * like the real P&G it reports in Día 2+ (see finBench.ts's pyg() and
 * README §4.1's RPND roll-forward). For Año 1 (rpndLiberada omitted),
 * Prima Devengada is simply 80% of totalPremium, since there's no prior
 * year to release from.
 */
export function computeRt(r: RtInputs): number {
  const primaDevengada = r.totalPremium * (1 - FZ.rpndPct) + (r.rpndLiberada ?? 0);
  return primaDevengada - r.totalPremium * (RT_EXPENSE_PCT + (r.acquisitionFeePct ?? 0)) - r.claimsAmount;
}

/**
 * Target net technical margin — RT as a fraction of Prima Emitida (the
 * premium a team actually controls/prices to, same framing as the Día 1
 * guide's "margen técnico neto del 20% sobre la prima") — that counts as
 * "good performance" for notaTarifacionAbsoluta(). This can't reuse
 * analytics.ts's LR_BAJO (0.85, the "grow" threshold) directly the way an
 * earlier version of this function did: once RT already subtracts
 * RT_EXPENSE_PCT (19%) off Prima Emitida on top of the 20% RPND holdback
 * that never reaches Prima Devengada at all, a team merely hitting LR_BAJO
 * on claims alone (0.85 + 0.19 > 0.80 of premium) is still running a net
 * technical loss — realistic (many insurers run an underwriting loss offset
 * by investment income, graded separately via ALM), but not what "good
 * performance" should mean for this specific, underwriting-only score.
 *
 * 20% (not a thinner margin like 10%) is deliberate, and coincidentally
 * close to but distinct from RT_EXPENSE_PCT (19%) — the two are unrelated
 * constants that happen to land near each other: since RT_EXPENSE_PCT is a
 * fixed expense load regardless of how a team prices, RT swings by a lot for
 * perfectly ordinary changes in loss ratio — anchoring "good" to too thin a
 * margin made the reference RT small, which (per notaTarifacionAbsoluta's
 * comment below) also sets how *steeply* the score reacts to RT, and made
 * merely-mediocre (not actually bad) results score in the single digits.
 * 20% widens that reference so a genuinely bad result still reads as clearly
 * bad without every below-breakeven result collapsing toward 0.
 */
export const GOOD_PERFORMANCE_MARGIN_PCT = 0.2;

/**
 * Score at which a team hitting exactly GOOD_PERFORMANCE_MARGIN_PCT lands —
 * deliberately not closer to 100: a 20%-net-margin result is genuinely
 * excellent (see GOOD_PERFORMANCE_MARGIN_PCT's comment), so it shouldn't
 * score *only* marginally better than an ordinary result the way a 99 would
 * force the curve to. 75 keeps real headroom below it for exceptional
 * results, and — combined with the wider margin reference above — keeps the
 * whole curve gentler around RT=0 instead of punishing ordinary variation
 * as if it were catastrophic.
 */
export const GOOD_PERFORMANCE_SCORE = 75;

/** Sigmoid steepness solved so that x=1 (RT exactly at the "good performance" reference) scores GOOD_PERFORMANCE_SCORE — see notaTarifacionAbsoluta(). */
const SIGMOID_STEEPNESS = Math.log(GOOD_PERFORMANCE_SCORE / (100 - GOOD_PERFORMANCE_SCORE));

/**
 * Maps each team's loss ratio (claims ÷ Prima Emitida — the written
 * premium a team actually controls by pricing, not Prima Devengada) onto a
 * 0-100 score anchored to the *model's* own definition of good performance,
 * instead of to how the rest of the cohort happened to do this run. Both
 * Año 1 and Año 2 score through here; Año 2 used to have a cohort-relative
 * scorer of its own (percentile/ranking over the cohort's RT), which made the
 * two days' tariff notas mean different things and made a team's Año 2 grade
 * depend on who else showed up. A cohort-relative score means a team's grade
 * depends on who else showed up and how they priced — this doesn't, and
 * neither does book size:
 * RT itself is `netPremiumFrac × premium − claims` (see computeRt()), so
 * `RT ÷ claims = netPremiumFrac ÷ lossRatio − 1` — every `premium` cancels
 * out. Two teams with the same loss ratio score identically regardless of
 * how many pesos or policies either one wrote; only the ratio matters.
 *
 * A team that outsourced this year's tariff carries the consultancy's fee
 * (`acquisitionFeePct` × Prima Emitida — see RtInputs) in the numerator
 * alongside claims, so what's scored is the full cost its pricing decision
 * loaded onto the book, not just its claims. Adding it there rather than
 * anywhere else is what keeps every property above intact: RT with the fee is
 * `premium × (netPremiumFrac − feePct) − claims`, which is 0 exactly when
 * `lossRatio + feePct == netPremiumFrac` — so the effective ratio still
 * scores exactly 50 at RT=0, above 50 below it and below 50 above it, with
 * `netPremiumFrac` unchanged. The fee is proportional to premium, so
 * book-size independence survives too.
 *
 * "Good performance" is the cost ratio that would leave a team at exactly
 * GOOD_PERFORMANCE_MARGIN_PCT net technical margin on Prima Emitida, after
 * covering the same RT_EXPENSE_PCT expense load every team pays and that
 * year's own RPND accounting: solving `availableFrac − costRatio = MARGIN`
 * gives `goodCostRatio = availableFrac − MARGIN`.
 *
 * `availableFrac` is `netPremiumFrac + rpndLiberada ÷ premium`. For Año 1
 * there's no prior year to release from, so it's just netPremiumFrac (Prima
 * Devengada is exactly 80% of Prima Emitida). For Año 2 the prior year's own
 * holdback comes back as revenue, so a team genuinely has more earned premium
 * to cover the same claims with — the same term computeRt() already carries,
 * which is why one function can anchor both years instead of Año 2 needing a
 * cohort-relative scorer of its own.
 *
 * The ratio itself ranges over [0, ∞) with "good" on the low side, so it's
 * remapped through 1/costRatio (higher is better, like the RT it derives
 * from) and passed through a logistic curve scaled by goodCostRatio — this
 * is what guarantees, by construction and for any input, that costRatio ==
 * availableFrac (RT exactly 0) scores exactly 50, every lower ratio scores
 * >50, and every higher one scores <50 (the three properties this was
 * required to satisfy), while still asymptoting to [0, 100] instead of the
 * unbounded raw RT range. A team hitting goodCostRatio exactly scores
 * GOOD_PERFORMANCE_SCORE, likewise by construction, for any availableFrac.
 */
export function notaTarifacionAbsoluta(results: (RtInputs & { teamId: number })[]): Map<number, number> {
  const map = new Map<number, number>();
  const netPremiumFrac = 1 - FZ.rpndPct - RT_EXPENSE_PCT;
  for (const r of results) {
    // The consultancy's fee is part of what this year's pricing decision
    // loaded onto the book, so it's scored alongside claims — see this
    // function's doc comment for why the numerator is where it has to go.
    const cost = r.claimsAmount + (r.acquisitionFeePct ?? 0) * r.totalPremium;
    if (r.totalPremium <= 0 && cost <= 0) {
      map.set(r.teamId, 50); // no book at all to judge — neither a good nor a bad signal
      continue;
    }
    if (cost <= 0) {
      map.set(r.teamId, 100); // collected real premium at no cost at all — as good as this measure gets
      continue;
    }
    const availableFrac = netPremiumFrac + (r.totalPremium > 0 ? (r.rpndLiberada ?? 0) / r.totalPremium : 0);
    const goodCostRatio = availableFrac - GOOD_PERFORMANCE_MARGIN_PCT;
    // totalPremium===0 here (never negative in practice) makes costRatio
    // Infinity, not a throw — availableFrac/Infinity is a well-defined 0 in
    // IEEE 754, so x still comes out finite (-goodCostRatio/MARGIN) instead
    // of NaN, same graceful behavior the old RT/goodRt formulation had for
    // this same edge case (real claims, zero premium collected).
    const costRatio = cost / r.totalPremium;
    const x = (availableFrac / costRatio - 1) * (goodCostRatio / GOOD_PERFORMANCE_MARGIN_PCT);
    map.set(r.teamId, 100 / (1 + Math.exp(-SIGMOID_STEEPNESS * x)));
  }
  return map;
}

/** Averages a profile's (actuarial or financial) individual concept scores. Ported from notaPerfilDia(), line ~1262. */
export function notaPerfilDia(scores: number[]): number | null {
  if (!scores.length) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Combines a day's actuarial and financial objective scores by the
 * actuarial/financial weight split. Ported from notaObjetivaDia(), line ~1263.
 */
export function notaObjetivaDia(
  actuarialScore: number | null,
  financialScore: number | null,
  actuarialWeight: number
): number | null {
  if (actuarialScore != null && financialScore != null) {
    return actuarialWeight * actuarialScore + (1 - actuarialWeight) * financialScore;
  }
  return actuarialScore ?? financialScore ?? null;
}

export interface SubjectiveResult {
  value: number | null;
  complete: boolean;
  missing: number;
}

/**
 * Fixed scale for the per-member "Nota general del Día" (§ MemberDayEvaluation) —
 * not admin-configurable, unlike the old per-skill rubric's maxScale.
 */
export const SUBJECTIVE_MAX_SCALE = 5;

/**
 * Team-level subjective score for one day: the average of each member's
 * "Nota general del Día" (1-5), scaled to 0-100. Día 1 has no subjective
 * grade at all — callers should pass an empty array for it, which this
 * reports as `{ value: null, complete: false, missing: 0 }` (nothing to
 * average, not "still pending").
 */
export function notaSubjetivaEquipo(memberNotas: (number | null | undefined)[]): SubjectiveResult {
  if (memberNotas.length === 0) return { value: null, complete: false, missing: 0 };
  const withValue = memberNotas.filter((v): v is number => v != null && !Number.isNaN(v));
  if (!withValue.length) return { value: null, complete: false, missing: memberNotas.length };
  const avg = withValue.reduce((a, b) => a + b, 0) / withValue.length;
  const value = (Math.max(0, Math.min(avg, SUBJECTIVE_MAX_SCALE)) / SUBJECTIVE_MAX_SCALE) * 100;
  return { value, complete: withValue.length === memberNotas.length, missing: memberNotas.length - withValue.length };
}

/** Final per-day grade: objective/subjective weighted by pesoSubj. Ported from notaDia(), line ~1278. */
export function notaDia(objective: number | null, subjective: number | null, subjectiveWeight: number): number | null {
  if (objective != null && subjective != null) {
    return (1 - subjectiveWeight) * objective + subjectiveWeight * subjective;
  }
  return objective ?? subjective ?? null;
}
