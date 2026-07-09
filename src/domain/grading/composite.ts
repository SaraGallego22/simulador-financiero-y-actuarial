import { GASTOS_TOTAL_PCT } from "../finance/constants";

export type ObjectiveMode = "relative" | "ranking";

export interface Skill {
  id: string;
  weight: number;
}

/**
 * RT (resultado técnico) — premium minus claims minus the standard
 * acquisition/commission/administration expense load (GASTOS_TOTAL_PCT).
 * Same shape as finBench()'s own `rt` (see finance/finBench.ts) — kept as
 * one shared definition so "RT" means the same thing everywhere it's
 * computed or displayed (grading here, the P&L there, the admin panel),
 * instead of two similarly-named but different numbers.
 */
export function computeRt(r: { totalPremium: number; claimsAmount: number }): number {
  return r.totalPremium * (1 - GASTOS_TOTAL_PCT) - r.claimsAmount;
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
  results: { teamId: number; totalPremium: number; claimsAmount: number }[],
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
 * Target net technical margin (RT as a fraction of premium, *after* both
 * claims and the standard GASTOS_TOTAL_PCT expense load) that counts as
 * "good performance" for notaTarifacionAbsoluta(). This can't reuse
 * analytics.ts's LR_BAJO (0.85, the "grow" threshold) directly the way an
 * earlier version of this function did: once RT already subtracts
 * GASTOS_TOTAL_PCT (20%), a team merely hitting LR_BAJO on claims alone
 * (0.85 + 0.20 > 1.0 of premium) is still running a net technical loss —
 * realistic (many insurers run an underwriting loss offset by investment
 * income, graded separately via ALM), but not what "good performance"
 * should mean for this specific, underwriting-only score.
 *
 * 20% (not a thinner margin like 10%) is deliberate: since GASTOS_TOTAL_PCT
 * is a fixed 20% of premium regardless of how a team prices, RT swings by a
 * lot for perfectly ordinary changes in loss ratio — anchoring "good" to too
 * thin a margin made the reference RT small, which (per notaTarifacionAbsoluta's
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
 * Maps each team's technical result (RT, see computeRt()) onto a 0-100
 * score anchored to the *model's* own definition of good performance,
 * instead of to how the rest of the cohort happened to do this run (see
 * notaTarifacionAnio() for the cohort-relative alternative, still used for
 * Año 2). A cohort-relative score means a team's grade depends on who else
 * showed up and how they priced — this doesn't.
 *
 * "Good performance" for a given team is defined as: what its RT *would
 * have been* had it priced its own actual book of claims (claimsAmount,
 * already known — not a population estimate) to land exactly at
 * GOOD_PERFORMANCE_MARGIN_PCT net technical margin, after also covering the
 * same GASTOS_TOTAL_PCT expense load every team pays. Solving
 * `premium*(1-GASTOS_TOTAL_PCT) - claims = premium*MARGIN` for premium and
 * substituting back into RT gives `goodRt = claims * MARGIN / (1 -
 * GASTOS_TOTAL_PCT - MARGIN)`. That reference RT scales with each team's
 * own claims volume, so a small and a large book are judged on the same
 * relative bar, not on who racked up more absolute COP of technical result
 * by writing more policies.
 *
 * RT itself ranges over all of (-∞, ∞), so it's passed through a logistic
 * curve centered on RT=0 (score 50) and scaled by that per-team reference —
 * this is what guarantees, by construction and for any input, that RT=0
 * scores exactly 50, every RT>0 scores >50, and every RT<0 scores <50 (the
 * three properties this was required to satisfy), while still asymptoting
 * to [0, 100] instead of the unbounded raw RT range.
 */
export function notaTarifacionAbsoluta(
  results: { teamId: number; totalPremium: number; claimsAmount: number }[]
): Map<number, number> {
  const map = new Map<number, number>();
  const goodMarginDenominator = 1 - GASTOS_TOTAL_PCT - GOOD_PERFORMANCE_MARGIN_PCT;
  for (const r of results) {
    const rt = computeRt(r);
    if (r.totalPremium <= 0 && r.claimsAmount <= 0) {
      map.set(r.teamId, 50); // no book at all to judge — neither a good nor a bad signal
      continue;
    }
    if (r.claimsAmount <= 0) {
      map.set(r.teamId, 100); // collected real premium against zero claims — as good as this measure gets
      continue;
    }
    const goodRt = r.claimsAmount * (GOOD_PERFORMANCE_MARGIN_PCT / goodMarginDenominator);
    const x = rt / goodRt;
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
 * Weighted-average rubric score for one team or member on one day. Ported
 * from notaSubjetivaDia()/notaSubjetivaMiembro(), line ~1267/1274.
 */
export function notaSubjetiva(
  skillScores: Partial<Record<string, number>>,
  skills: Skill[],
  maxScale: number
): SubjectiveResult {
  const sumWeight = skills.reduce((s, k) => s + (k.weight || 0), 0);
  if (sumWeight <= 0 || skills.length === 0) return { value: null, complete: false, missing: skills.length };

  let acc = 0;
  let missing = 0;
  for (const skill of skills) {
    const raw = skillScores[skill.id];
    const has = raw != null && !Number.isNaN(raw);
    if (!has) missing++;
    const v = has ? Math.max(0, Math.min(raw as number, maxScale)) : 0;
    acc += (skill.weight || 0) * (v / maxScale) * 100;
  }
  return { value: missing === skills.length ? null : acc / sumWeight, complete: missing === 0, missing };
}

/**
 * Team-level subjective score: averages per-member scores when a roster has
 * been uploaded, otherwise falls back to a single team-consensus score.
 * Ported from the branch in notaSubjetivaDia(), line ~1267.
 */
export function notaSubjetivaEquipo(
  memberSkillScores: Partial<Record<string, number>>[] | null,
  teamSkillScores: Partial<Record<string, number>>,
  skills: Skill[],
  maxScale: number
): SubjectiveResult {
  if (memberSkillScores && memberSkillScores.length > 0) {
    const results = memberSkillScores.map((s) => notaSubjetiva(s, skills, maxScale));
    const withValue = results.filter((r) => r.value != null);
    if (!withValue.length) return { value: null, complete: false, missing: memberSkillScores.length };
    const value = withValue.reduce((a, r) => a + (r.value as number), 0) / withValue.length;
    return {
      value,
      complete: withValue.length === memberSkillScores.length,
      missing: memberSkillScores.length - withValue.length,
    };
  }
  return notaSubjetiva(teamSkillScores, skills, maxScale);
}

/** Final per-day grade: objective/subjective weighted by pesoSubj. Ported from notaDia(), line ~1278. */
export function notaDia(objective: number | null, subjective: number | null, subjectiveWeight: number): number | null {
  if (objective != null && subjective != null) {
    return (1 - subjectiveWeight) * objective + subjectiveWeight * subjective;
  }
  return objective ?? subjective ?? null;
}
