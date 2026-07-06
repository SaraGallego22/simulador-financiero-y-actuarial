import { prisma } from "./prisma";
import { getTeamBookForDay, computeReservesForTeams, getSegmentDataForTeams } from "./teamBook";
import { computeFinBenchForCohort } from "./finBenchHelper";
import { getOrCreateActiveCohort } from "./cohort";
import { scoreFinanciero } from "@/domain/finance/alm";
import { isPortfolioDecisionV2 } from "@/domain/finance/instruments";
import { conceptosDia, scoreConcepto } from "@/domain/grading/concepts";
import type { Dia } from "@/domain/grading/concepts";
import { scoreAnalitica } from "@/domain/grading/analytics";
import type { Recommendation } from "@/domain/grading/analytics";
import { notaTarifacionAnio, notaPerfilDia, notaObjetivaDia, notaSubjetivaEquipo, notaDia } from "@/domain/grading/composite";
import type { Skill as CompositeSkill } from "@/domain/grading/composite";

export interface TeamConsolidado {
  teamId: string;
  teamName: string;
  color: string;
  perDay: { objective: number | null; subjective: number | null; nota: number | null }[];
  objectiveFinal: number | null;
  subjectiveFinal: number | null;
  notaFinal: number | null;
}

/**
 * Assembles the same per-day objective/subjective breakdown and 4-day final
 * grade as the legacy's renderConsolidado()/notaObjetivaDia() (line ~1263 &
 * 1418) — see CLAUDE.md's domain glossary. The domain functions
 * (notaTarifacionAnio, notaPerfilDia, notaObjetivaDia, notaSubjetivaEquipo,
 * notaDia) are already pure/tested; this is the app-specific plumbing that
 * feeds them from what's actually stored for a cohort.
 */
export async function computeConsolidado(cohortId?: string, respectPublished = false): Promise<TeamConsolidado[]> {
  const cohort = cohortId ? { id: cohortId } : await getOrCreateActiveCohort();

  const [teams, rubric, skills] = await Promise.all([
    prisma.team.findMany({ where: { cohortId: cohort.id }, include: { members: true }, orderBy: { createdAt: "asc" } }),
    prisma.rubricConfig.upsert({ where: { cohortId: cohort.id }, update: {}, create: { cohortId: cohort.id } }),
    prisma.skill.findMany({ where: { rubricConfig: { cohortId: cohort.id } } }),
  ]);
  const skillDefs: CompositeSkill[] = skills.map((s) => ({ id: s.id, weight: s.weight }));
  const tolerance = { tolerancePerfect: rubric.tolerancePerfect, toleranceZero: rubric.toleranceZero };

  // Year 1 / Year 2 tariff-quality scores (notaTarifacionAnio), keyed by real
  // team.id via a local numeric remap (the domain fn works in plain numbers).
  // The relative-percentile ranking needs *every* team's raw result to be
  // correct, so publish status only gates which team's own score gets
  // attached below — not which rows feed the ranking itself.
  const tarifByDay = new Map<number, Map<string, number>>();
  for (const day of [1, 2]) {
    const results = await prisma.teamSimResult.findMany({
      where: { simulationRun: { cohortId: cohort.id, day, status: "DONE" } },
      orderBy: { simulationRun: { createdAt: "desc" } },
    });
    const seen = new Set<string>();
    const numericIdByTeamId = new Map<string, number>();
    const publishedTeamIds = new Set<string>();
    const rows: { teamId: number; totalPremium: number; claimsAmount: number }[] = [];
    for (const r of results) {
      if (seen.has(r.teamId)) continue; // keep only the latest run per team
      seen.add(r.teamId);
      if (r.published) publishedTeamIds.add(r.teamId);
      const numericId = numericIdByTeamId.size + 1;
      numericIdByTeamId.set(r.teamId, numericId);
      rows.push({ teamId: numericId, totalPremium: r.totalPremium, claimsAmount: r.claimsAmount });
    }
    const map = notaTarifacionAnio(rows, rubric.objectiveMode as "relative" | "ranking");
    const byTeamId = new Map<string, number>();
    for (const [teamId, numericId] of numericIdByTeamId) {
      if (respectPublished && !publishedTeamIds.has(teamId)) continue;
      const v = map.get(numericId);
      if (v != null) byTeamId.set(teamId, v);
    }
    tarifByDay.set(day, byTeamId);
  }

  const finBenchByTeamId = await computeFinBenchForCohort(cohort.id);

  const almScoreByTeamId = new Map<string, number>();
  const book1 = await getTeamBookForDay(cohort.id, 1);
  if (book1) {
    const reserves1 = computeReservesForTeams(book1.claimsByTeamId);
    const allocations1 = await prisma.portfolioAllocation.findMany({ where: { day: 1, team: { cohortId: cohort.id } } });
    for (const a of allocations1) {
      const reserves = reserves1.get(a.teamId);
      if (reserves && isPortfolioDecisionV2(a.allocation)) {
        const s = scoreFinanciero(reserves, a.allocation);
        if (s) almScoreByTeamId.set(a.teamId, s.nota);
      }
    }
  }

  const hasAnalitica = conceptosDia("d4").some((c) => c.tipo === "auto_analitica");
  const analiticaScoreByTeamId = new Map<string, number>();
  if (hasAnalitica) {
    const segmentDataByTeamId = await getSegmentDataForTeams(cohort.id);
    if (segmentDataByTeamId) {
      const recs = await prisma.analyticsRecommendation.findMany({ where: { day: 4, team: { cohortId: cohort.id } } });
      const recsByTeamId = new Map<string, Record<string, Recommendation>>();
      for (const r of recs) {
        if (!recsByTeamId.has(r.teamId)) recsByTeamId.set(r.teamId, {});
        recsByTeamId.get(r.teamId)![r.segmentKey] = r.recommendation as Recommendation;
      }
      for (const [teamId, segData] of segmentDataByTeamId) {
        const score = scoreAnalitica(recsByTeamId.get(teamId) ?? {}, segData);
        if (score != null) analiticaScoreByTeamId.set(teamId, score);
      }
    }
  }

  const allDeliverables = await prisma.deliverable.findMany({ where: { team: { cohortId: cohort.id } } });
  const deliverableValueByTeamDay = new Map<string, number>();
  for (const d of allDeliverables) deliverableValueByTeamDay.set(`${d.teamId}:${d.day}:${d.conceptId}`, d.value);

  const allTeamScores = await prisma.score.findMany({ where: { team: { cohortId: cohort.id } } });
  const allMemberScores = await prisma.memberScore.findMany({
    where: { teamMember: { team: { cohortId: cohort.id } } },
  });

  const results: TeamConsolidado[] = teams.map((team) => {
    const perDay = [1, 2, 3, 4].map((day) => {
      const dayKey = `d${day}` as Dia;
      const reportConcepts = conceptosDia(dayKey).filter((c) => c.tipo === "reporte");
      const bench = finBenchByTeamId.get(team.id) ?? null;

      const actScores: number[] = [];
      const finScores: number[] = [];

      if (day <= 2) {
        const tarifScore = tarifByDay.get(day)?.get(team.id);
        if (tarifScore != null) actScores.push(tarifScore);
      }
      for (const c of reportConcepts) {
        const value = deliverableValueByTeamDay.get(`${team.id}:${day}:${c.id}`) ?? null;
        const scored = scoreConcepto(c.id, value, bench, tolerance);
        if (scored?.score != null) (c.perfil === "act" ? actScores : finScores).push(scored.score);
      }
      if (day === 1) {
        const alm = almScoreByTeamId.get(team.id);
        if (alm != null) finScores.push(alm);
      }
      if (day === 4 && hasAnalitica) {
        const analitica = analiticaScoreByTeamId.get(team.id);
        if (analitica != null) actScores.push(analitica);
      }

      const actAvg = notaPerfilDia(actScores);
      const finAvg = notaPerfilDia(finScores);
      const objective = notaObjetivaDia(actAvg, finAvg, rubric.actuarialWeight);

      const teamScoreValues: Partial<Record<string, number>> = {};
      for (const s of allTeamScores) {
        if (s.teamId === team.id && s.day === day && s.value != null && (!respectPublished || s.published)) {
          teamScoreValues[s.skillId] = s.value;
        }
      }
      const memberScoreArrays: Partial<Record<string, number>>[] = team.members.map((m) => {
        const values: Partial<Record<string, number>> = {};
        for (const s of allMemberScores) {
          if (s.teamMemberId === m.id && s.day === day && s.value != null && (!respectPublished || s.published)) {
            values[s.skillId] = s.value;
          }
        }
        return values;
      });
      const subjectiveResult = notaSubjetivaEquipo(
        memberScoreArrays.length > 0 ? memberScoreArrays : null,
        teamScoreValues,
        skillDefs,
        rubric.maxScale
      );
      const subjective = subjectiveResult.value;

      return { objective, subjective, nota: notaDia(objective, subjective, rubric.subjectiveWeight) };
    });

    const objectiveFinal = notaPerfilDia(perDay.map((d) => d.objective).filter((v): v is number => v != null));
    const subjectiveFinal = notaPerfilDia(perDay.map((d) => d.subjective).filter((v): v is number => v != null));
    const notaFinal = notaDia(objectiveFinal, subjectiveFinal, rubric.subjectiveWeight);

    return { teamId: team.id, teamName: team.name, color: team.color, perDay, objectiveFinal, subjectiveFinal, notaFinal };
  });

  return results.sort((a, b) => (b.notaFinal ?? -1) - (a.notaFinal ?? -1));
}
