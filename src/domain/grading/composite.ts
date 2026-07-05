export type ObjectiveMode = "relative" | "ranking";

export interface Skill {
  id: string;
  weight: number;
}

/**
 * Ranks/normalizes each team's Year-1 or Year-2 technical result (premium -
 * claims) into a 0-100 objective tariff score. Ported from
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
  for (const r of results) byTeam.set(r.teamId, r.totalPremium - r.claimsAmount);
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
