import { RT_EXPENSE_PCT, FZ } from "../finance/constants";

export type ObjectiveMode = "relative" | "ranking";

/** Shared input shape for computeRt() — see its doc comment for why this now mirrors finBench.ts's pyg() exactly. */
export interface RtInputs {
  /** Prima Emitida — what was actually charged/collected, before any RPND holdback. */
  totalPremium: number;
  claimsAmount: number;
  /** The PRIOR year's own 20% RPND holdback, now released as revenue this year (FZ.rpndPct × prior year's totalPremium) — 0/undefined for Año 1, which has no prior year. See finBench.ts's pyg() `rpndLiberada` param, which this must stay in lockstep with. */
  rpndLiberada?: number;
}

/**
 * RT (resultado técnico) — Prima Devengada minus claims minus the
 * acquisition/commission expense load (RT_EXPENSE_PCT, still charged on
 * Prima Emitida — deliberately NOT gasto administrativo, which lands on
 * its own line, Resultado Industrial, see finBench.ts's pyg()). Same
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
  return primaDevengada - r.totalPremium * RT_EXPENSE_PCT - r.claimsAmount;
}

/**
 * Ranks/normalizes each team's Year-1 or Year-2 technical result (RT, see
 * computeRt()) into a 0-100 objective tariff score. Ported from
 * notaTarifacionAnio(), line ~1241.
 *
 * "relative" mode normalizes between the 10th and 90th percentile of the
 * result (robust to one catastrophic team compressing everyone else's
 * score); "ranking" mode is a linear score by finishing position.
 */
export function notaTarifacionAnio(
  results: (RtInputs & { teamId: number })[],
  mode: ObjectiveMode
): Map<number, number> {
  const byTeam = new Map<number, number>();
  for (const r of results) byTeam.set(r.teamId, computeRt(r));
  const teamIds = [...byTeam.keys()];
  const map = new Map<number, number>();
  if (teamIds.length === 0) return map;

  if (mode === "ranking") {
    const sorted = [...teamIds].sort((a, b) => byTeam.get(b)! - byTeam.get(a)!);
    sorted.forEach((teamId, i) => {
      map.set(teamId, teamIds.length > 1 ? (100 * (teamIds.length - 1 - i)) / (teamIds.length - 1) : 100);
    });
  } else {
    const vals = [...byTeam.values()].sort((a, b) => a - b);
    const pct = (p: number) => {
      if (vals.length === 1) return vals[0];
      const idx = (vals.length - 1) * p;
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      return vals[lo] + (vals[hi] - vals[lo]) * (idx - lo);
    };
    const lo = pct(0.1);
    const hi = pct(0.9);
    const range = hi - lo;
    for (const teamId of teamIds) {
      const v = byTeam.get(teamId)!;
      map.set(teamId, range > 0 ? Math.max(0, Math.min(100, (100 * (v - lo)) / range)) : 100);
    }
  }
  return map;
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
 * instead of to how the rest of the cohort happened to do this run (see
 * notaTarifacionAnio() for the cohort-relative alternative, still used for
 * Año 2). A cohort-relative score means a team's grade depends on who else
 * showed up and how they priced — this doesn't, and neither does book size:
 * RT itself is `netPremiumFrac × premium − claims` (see computeRt()), so
 * `RT ÷ claims = netPremiumFrac ÷ lossRatio − 1` — every `premium` cancels
 * out. Two teams with the same loss ratio score identically regardless of
 * how many pesos or policies either one wrote; only the ratio matters.
 *
 * "Good performance" is the loss ratio that would leave a team at exactly
 * GOOD_PERFORMANCE_MARGIN_PCT net technical margin on Prima Emitida, after
 * covering the same RT_EXPENSE_PCT expense load every team pays and the
 * RPND holdback every Año 1 book carries (this function is only ever used
 * for Año 1 — see notaTarifacionAnio() for Año 2 — so rpndLiberada is
 * always 0 here, i.e. Prima Devengada is always exactly 80% of Prima
 * Emitida): solving `netPremiumFrac − lossRatio = MARGIN` for lossRatio
 * gives `goodLossRatio = netPremiumFrac − MARGIN`.
 *
 * The ratio itself ranges over [0, ∞) with "good" on the low side, so it's
 * remapped through 1/lossRatio (higher is better, like the RT it derives
 * from) and passed through a logistic curve scaled by goodLossRatio — this
 * is what guarantees, by construction and for any input, that lossRatio ==
 * netPremiumFrac (RT exactly 0) scores exactly 50, every lower loss ratio
 * scores >50, and every higher one scores <50 (the three properties this
 * was required to satisfy), while still asymptoting to [0, 100] instead of
 * the unbounded raw RT range.
 */
export function notaTarifacionAbsoluta(
  results: { teamId: number; totalPremium: number; claimsAmount: number }[]
): Map<number, number> {
  const map = new Map<number, number>();
  const netPremiumFrac = 1 - FZ.rpndPct - RT_EXPENSE_PCT;
  const goodLossRatio = netPremiumFrac - GOOD_PERFORMANCE_MARGIN_PCT;
  for (const r of results) {
    if (r.totalPremium <= 0 && r.claimsAmount <= 0) {
      map.set(r.teamId, 50); // no book at all to judge — neither a good nor a bad signal
      continue;
    }
    if (r.claimsAmount <= 0) {
      map.set(r.teamId, 100); // collected real premium against zero claims — as good as this measure gets
      continue;
    }
    // totalPremium===0 here (never negative in practice) makes lossRatio
    // Infinity, not a throw — netPremiumFrac/Infinity is a well-defined 0 in
    // IEEE 754, so x still comes out finite (-goodLossRatio/MARGIN) instead
    // of NaN, same graceful behavior the old RT/goodRt formulation had for
    // this same edge case (real claims, zero premium collected).
    const lossRatio = r.claimsAmount / r.totalPremium;
    const x = (netPremiumFrac / lossRatio - 1) * (goodLossRatio / GOOD_PERFORMANCE_MARGIN_PCT);
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
