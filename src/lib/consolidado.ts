import type { EvaluationProfile } from "@prisma/client";
import { prisma } from "./prisma";
import { getTeamBookForDay, computeReservesForTeams, getUniverseForSeed, getSectorStatsForSeed } from "./teamBook";
import { computeFinBenchForCohort } from "./finBenchHelper";
import { getOrCreateActiveCohort } from "./cohort";
import { scoreFinanciero } from "@/domain/finance/alm";
import { isMinVarianceAllocation, isPortfolioDecisionV4 } from "@/domain/finance/instruments";
import { scoreMinVariance } from "@/domain/finance/markowitz";
import { conceptosDia, scoreConcepto, ownValueKey } from "@/domain/grading/concepts";
import type { Dia } from "@/domain/grading/concepts";
import { rankForCrecer, rankForDisminuir, groupSectorPicksByTeam, scoreSectorRecommendation } from "@/domain/grading/sectors";
import { notaTarifacionAnio, notaTarifacionAbsoluta, notaPerfilDia, notaObjetivaDia, notaSubjetivaEquipo, notaDia } from "@/domain/grading/composite";
import { FZ } from "@/domain/finance/constants";
import { averageSoftSkillsByMember } from "@/lib/softSkills";
import type { SoftSkillCompetency } from "@/lib/softSkills";

export interface MarketLossRatio {
  lossRatio: number;
  teamCount: number;
}

/** teamId -> that team's latest DONE totalPremium (Prima Emitida) for a given day, keyed for cross-day lookups (e.g. Año 2's RPND liberada needs Año 1's own totalPremium per team). Only the latest run per team is kept. */
async function latestTotalPremiumByTeamId(cohortId: string, day: number): Promise<Map<string, number>> {
  const results = await prisma.teamSimResult.findMany({
    where: { simulationRun: { cohortId, day, status: "DONE" } },
    orderBy: { simulationRun: { createdAt: "desc" } },
  });
  const byTeamId = new Map<string, number>();
  for (const r of results) {
    if (!byTeamId.has(r.teamId)) byTeamId.set(r.teamId, r.totalPremium); // keep only the latest run per team
  }
  return byTeamId;
}

/**
 * Real, aggregate (never per-team) loss ratio across every team's published
 * result for a given day — siniestros reales de todo el mercado ÷ prima
 * DEVENGADA real de todo el mercado, both summed across teams, never broken
 * out per team. Devengada (not emitida), same as computeRt()/finBench()'s
 * own rt — this is the reference a team's own Loss Ratio Esperado (Día 2's
 * guide §2, itself now Prima Devengada-based to match) gets contrasted
 * against, so both sides of that comparison need the same premium base.
 * Shown regardless of how few teams are published (even 1) — an admin
 * running a small test cohort still wants to see it.
 */
export async function computeMarketLossRatio(cohortId: string, day: number): Promise<MarketLossRatio | null> {
  const results = await prisma.teamSimResult.findMany({
    where: { simulationRun: { cohortId, day, status: "DONE" }, published: true },
    orderBy: { simulationRun: { createdAt: "desc" } },
  });
  // Año 2's rpndLiberada needs each team's own Año 1 totalPremium — only
  // fetched when actually needed (day===2), never for the much more common
  // day===1 case (see computeRt()'s doc comment: rpndLiberada omitted means 0).
  const priorYearPremiumByTeamId = day === 2 ? await latestTotalPremiumByTeamId(cohortId, 1) : null;

  const seen = new Set<string>();
  let totalPrimaDevengada = 0;
  let totalClaims = 0;
  for (const r of results) {
    if (seen.has(r.teamId)) continue; // keep only the latest run per team
    seen.add(r.teamId);
    const rpndLiberada = priorYearPremiumByTeamId ? FZ.rpndPct * (priorYearPremiumByTeamId.get(r.teamId) ?? 0) : 0;
    totalPrimaDevengada += r.totalPremium * (1 - FZ.rpndPct) + rpndLiberada;
    totalClaims += r.claimsAmount;
  }
  const teamCount = seen.size;
  if (teamCount === 0 || totalPrimaDevengada <= 0) return null;
  return { lossRatio: totalClaims / totalPrimaDevengada, teamCount };
}

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

  const [teams, rubric] = await Promise.all([
    prisma.team.findMany({ where: { cohortId: cohort.id }, include: { members: true }, orderBy: { createdAt: "asc" } }),
    prisma.rubricConfig.upsert({ where: { cohortId: cohort.id }, update: {}, create: { cohortId: cohort.id } }),
  ]);
  const tolerance = { tolerancePerfect: rubric.tolerancePerfect, toleranceZero: rubric.toleranceZero };

  // Year 1 / Year 2 tariff-quality scores (notaTarifacionAnio), keyed by real
  // team.id via a local numeric remap (the domain fn works in plain numbers).
  // The relative-percentile ranking needs *every* team's raw result to be
  // correct, so publish status only gates which team's own score gets
  // attached below — not which rows feed the ranking itself.
  const tarifByDay = new Map<number, Map<string, number>>();
  // Año 2's RT needs each team's own Año 1 totalPremium to release its RPND
  // holdback as this year's revenue (see composite.ts's computeRt()) — fetched
  // once, before the loop, so day===2's iteration below can look it up per team.
  const year1TotalPremiumByTeamId = await latestTotalPremiumByTeamId(cohort.id, 1);
  for (const day of [1, 2]) {
    const results = await prisma.teamSimResult.findMany({
      where: { simulationRun: { cohortId: cohort.id, day, status: "DONE" } },
      orderBy: { simulationRun: { createdAt: "desc" } },
    });
    const seen = new Set<string>();
    const numericIdByTeamId = new Map<string, number>();
    const publishedTeamIds = new Set<string>();
    const rows: { teamId: number; totalPremium: number; claimsAmount: number; rpndLiberada?: number }[] = [];
    for (const r of results) {
      if (seen.has(r.teamId)) continue; // keep only the latest run per team
      seen.add(r.teamId);
      if (r.published) publishedTeamIds.add(r.teamId);
      const numericId = numericIdByTeamId.size + 1;
      numericIdByTeamId.set(r.teamId, numericId);
      const rpndLiberada = day === 2 ? FZ.rpndPct * (year1TotalPremiumByTeamId.get(r.teamId) ?? 0) : undefined;
      rows.push({ teamId: numericId, totalPremium: r.totalPremium, claimsAmount: r.claimsAmount, rpndLiberada });
    }
    // Año 1's actuarial score is anchored to the model's own definition of
    // good performance (see notaTarifacionAbsoluta's doc comment) rather
    // than to how the rest of the cohort priced this run — Año 2 keeps the
    // admin-configurable cohort-relative mode.
    const map = day === 1 ? notaTarifacionAbsoluta(rows) : notaTarifacionAnio(rows, rubric.objectiveMode as "relative" | "ranking");
    const byTeamId = new Map<string, number>();
    for (const [teamId, numericId] of numericIdByTeamId) {
      if (respectPublished && !publishedTeamIds.has(teamId)) continue;
      const v = map.get(numericId);
      if (v != null) byTeamId.set(teamId, v);
    }
    tarifByDay.set(day, byTeamId);
  }

  const finBenchByTeamId = await computeFinBenchForCohort(cohort.id);

  // Año 1's real ALM schedule is submitted Día 2 (not Día 1 — Día 1 is the
  // minimum-variance exercise, scored separately below).
  const almScoreByTeamId = new Map<string, number>();
  const book1 = await getTeamBookForDay(cohort.id, 1);
  if (book1) {
    const reserves1 = computeReservesForTeams(book1.claimsByTeamId);
    const scheduleAllocations = await prisma.portfolioAllocation.findMany({ where: { day: 2, team: { cohortId: cohort.id } } });
    for (const a of scheduleAllocations) {
      const reserves = reserves1.get(a.teamId);
      if (reserves && isPortfolioDecisionV4(a.allocation)) {
        const s = scoreFinanciero(reserves, a.allocation);
        if (s) almScoreByTeamId.set(a.teamId, s.nota);
      }
    }
  }

  // Día 1's minimum-variance exercise — scored against the true optimal
  // portfolio at the team's own achieved return, never per-team (see
  // markowitz.ts).
  const minVarScoreByTeamId = new Map<string, number>();
  const minVarAllocations = await prisma.portfolioAllocation.findMany({ where: { day: 1, team: { cohortId: cohort.id } } });
  for (const a of minVarAllocations) {
    if (isMinVarianceAllocation(a.allocation)) {
      minVarScoreByTeamId.set(a.teamId, scoreMinVariance(a.allocation));
    }
  }

  // Día 4's sector exercise — graded against the one true, universe-wide
  // ranking (never per-team, see sectors.ts's doc comment on why a team's
  // own book is a biased sample).
  const hasAnalitica = conceptosDia("d4").some((c) => c.tipo === "auto_analitica");
  const analiticaScoreByTeamId = new Map<string, number>();
  if (hasAnalitica) {
    const universeRun = await prisma.universeRun.findFirst({
      where: { cohortId: cohort.id, kind: "colombia", status: "DONE" },
      orderBy: { createdAt: "desc" },
      select: { seed: true },
    });
    if (universeRun) {
      const universe = getUniverseForSeed(universeRun.seed);
      const sectorStats = getSectorStatsForSeed(universeRun.seed, universe);
      const trueCrecer = rankForCrecer(sectorStats);
      const trueDisminuir = rankForDisminuir(sectorStats);
      const recs = await prisma.analyticsRecommendation.findMany({ where: { day: 4, team: { cohortId: cohort.id } } });
      const picksByTeamId = groupSectorPicksByTeam(recs);
      for (const [teamId, picks] of picksByTeamId) {
        const score = scoreSectorRecommendation(picks, trueCrecer, trueDisminuir, tolerance);
        if (score != null) analiticaScoreByTeamId.set(teamId, score);
      }
    }
  }

  const allDeliverables = await prisma.deliverable.findMany({ where: { team: { cohortId: cohort.id } } });
  const deliverableValueByTeamDay = new Map<string, number>();
  // Per-team, keyed `${day}:${conceptId}` across EVERY day at once (not just
  // the day being graded) — a "formula" concept's own inputs can live on an
  // earlier day (see concepts.ts's ownValueKey()/FormulaTerm.day doc
  // comments, e.g. Balance Año 1's %-of-premium lines need Día 2's own
  // Prima Emitida).
  const ownValuesByTeamId = new Map<string, Map<string, number>>();
  for (const d of allDeliverables) {
    deliverableValueByTeamDay.set(`${d.teamId}:${d.day}:${d.conceptId}`, d.value);
    if (!ownValuesByTeamId.has(d.teamId)) ownValuesByTeamId.set(d.teamId, new Map());
    ownValuesByTeamId.get(d.teamId)!.set(ownValueKey(`d${d.day}` as Dia, d.conceptId), d.value);
  }

  // Subjective grading is person-level only, and only for Días 2-4 — Día 1
  // has no subjective grade at all (see MemberDayEvaluation's doc comment).
  const allMemberEvaluations = await prisma.memberDayEvaluation.findMany({
    where: { teamMember: { team: { cohortId: cohort.id } } },
  });
  const notaGeneralByMemberDay = new Map<string, { value: number | null; published: boolean }>();
  for (const e of allMemberEvaluations) {
    notaGeneralByMemberDay.set(`${e.teamMemberId}:${e.day}`, { value: e.notaGeneral, published: e.published });
  }

  const results: TeamConsolidado[] = teams.map((team) => {
    const perDay = [1, 2, 3, 4].map((day) => {
      const dayKey = `d${day}` as Dia;
      const reportConcepts = conceptosDia(dayKey).filter((c) => c.tipo === "reporte");
      const bench = finBenchByTeamId.get(team.id) ?? null;

      const actScores: number[] = [];
      const finScores: number[] = [];
      const ownValues = ownValuesByTeamId.get(team.id) ?? new Map<string, number>();

      if (day <= 2) {
        const tarifScore = tarifByDay.get(day)?.get(team.id);
        if (tarifScore != null) actScores.push(tarifScore);
      }
      for (const c of reportConcepts) {
        const value = deliverableValueByTeamDay.get(`${team.id}:${day}:${c.id}`) ?? null;
        const scored = scoreConcepto(c.id, value, bench, tolerance, ownValues);
        if (scored?.score != null) (c.perfil === "act" ? actScores : finScores).push(scored.score);
      }
      if (day === 1) {
        const minVar = minVarScoreByTeamId.get(team.id);
        if (minVar != null) finScores.push(minVar);
      }
      if (day === 2) {
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

      // Día 1 has no subjective grade at all (see MemberDayEvaluation's doc
      // comment) — pass an empty array so notaSubjetivaEquipo reports null
      // without treating it as "still pending".
      const memberNotas: (number | null)[] =
        day === 1
          ? []
          : team.members.map((m) => {
              const ev = notaGeneralByMemberDay.get(`${m.id}:${day}`);
              if (!ev || (respectPublished && !ev.published)) return null;
              return ev.value;
            });
      const subjective = notaSubjetivaEquipo(memberNotas).value;

      return { objective, subjective, nota: notaDia(objective, subjective, rubric.subjectiveWeight) };
    });

    const objectiveFinal = notaPerfilDia(perDay.map((d) => d.objective).filter((v): v is number => v != null));
    const subjectiveFinal = notaPerfilDia(perDay.map((d) => d.subjective).filter((v): v is number => v != null));
    const notaFinal = notaDia(objectiveFinal, subjectiveFinal, rubric.subjectiveWeight);

    return { teamId: team.id, teamName: team.name, color: team.color, perDay, objectiveFinal, subjectiveFinal, notaFinal };
  });

  return results.sort((a, b) => (b.notaFinal ?? -1) - (a.notaFinal ?? -1));
}

export interface MemberConsolidadoRow {
  teamMemberId: string;
  memberName: string;
  teamId: string;
  teamName: string;
  teamColor: string;
  perDay: { day: number; notaGeneral: number | null; aprobado: boolean | null; perfil: EvaluationProfile | null; aptitudesRiesgos: boolean }[];
  promedio: number | null;
  diasAprobados: number;
  diasEvaluados: number;
  // Días 2-4 where the "Mostró aptitudes para Riesgos" checkpoint was
  // marked, out of 3 — independent of notaGeneral (see
  // MemberDayEvaluation.aptitudesRiesgos's doc comment), so this is out of a
  // fixed 3, not out of diasEvaluados like diasAprobados above.
  aptitudesRiesgosCount: number;
  // Not shown in /admin/standings' on-screen table (which is why this isn't
  // published-gated like perDay above) — carried only for the CSV export
  // (/api/members/consolidado-csv), which is the admin's own private copy.
  comments: { day: number; author: string; text: string }[];
  // Habilidades blandas: never published to teams (see softSkills.ts's doc
  // comment) — this whole function is only ever called from admin routes, so
  // no gating needed here. One nota per competency, averaging
  // RATING_SCORES across whichever of the 3 activities rated that
  // competency for this member (missing if none did).
  softSkills: Partial<Record<SoftSkillCompetency, number>>;
  softSkillComments: { activity: number; text: string }[];
}

/**
 * Per-person subjective-grading summary across Días 2-4 (Día 1 has no
 * subjective grade — see MemberDayEvaluation's doc comment), so an evaluator
 * can compare/rank people across the whole cohort instead of only within
 * their own team's day-by-day view. Sorted by `promedio` like
 * computeConsolidado() sorts teams by `notaFinal`.
 */
export async function computeMemberConsolidado(cohortId?: string, respectPublished = false): Promise<MemberConsolidadoRow[]> {
  const cohort = cohortId ? { id: cohortId } : await getOrCreateActiveCohort();

  const teams = await prisma.team.findMany({
    where: { cohortId: cohort.id },
    include: { members: true },
    orderBy: { createdAt: "asc" },
  });
  const evaluations = await prisma.memberDayEvaluation.findMany({
    where: { teamMember: { team: { cohortId: cohort.id } } },
  });
  const evalByMemberDay = new Map<string, (typeof evaluations)[number]>();
  for (const e of evaluations) evalByMemberDay.set(`${e.teamMemberId}:${e.day}`, e);

  const comments = await prisma.memberComment.findMany({
    where: { teamMember: { team: { cohortId: cohort.id } } },
    orderBy: [{ day: "asc" }, { createdAt: "asc" }],
  });
  const commentsByMemberId = new Map<string, (typeof comments)[number][]>();
  for (const c of comments) {
    if (!commentsByMemberId.has(c.teamMemberId)) commentsByMemberId.set(c.teamMemberId, []);
    commentsByMemberId.get(c.teamMemberId)!.push(c);
  }

  // Habilidades blandas: never gated by `respectPublished` (see this
  // function's doc comment on softSkills) — grouped by member, then by
  // competency, so each competency's nota can average across whichever
  // activities actually rated it.
  const softSkillEvals = await prisma.softSkillEvaluation.findMany({
    where: { teamMember: { team: { cohortId: cohort.id } } },
  });
  const softSkillsByMemberId = averageSoftSkillsByMember(softSkillEvals);

  const softSkillCommentsRaw = await prisma.softSkillComment.findMany({
    where: { teamMember: { team: { cohortId: cohort.id } } },
    orderBy: [{ activity: "asc" }, { createdAt: "asc" }],
  });
  const softSkillCommentsByMemberId = new Map<string, { activity: number; text: string }[]>();
  for (const c of softSkillCommentsRaw) {
    if (!softSkillCommentsByMemberId.has(c.teamMemberId)) softSkillCommentsByMemberId.set(c.teamMemberId, []);
    softSkillCommentsByMemberId.get(c.teamMemberId)!.push({ activity: c.activity, text: c.text });
  }

  const rows: MemberConsolidadoRow[] = [];
  for (const team of teams) {
    for (const member of team.members) {
      const perDay = [2, 3, 4].map((day) => {
        const e = evalByMemberDay.get(`${member.id}:${day}`);
        if (!e || (respectPublished && !e.published)) return { day, notaGeneral: null, aprobado: null, perfil: null, aptitudesRiesgos: false };
        return { day, notaGeneral: e.notaGeneral, aprobado: e.aprobado, perfil: e.perfil, aptitudesRiesgos: e.aptitudesRiesgos };
      });
      const notas = perDay.map((d) => d.notaGeneral).filter((v): v is number => v != null);

      const softSkills = softSkillsByMemberId.get(member.id) ?? {};

      rows.push({
        teamMemberId: member.id,
        memberName: member.name,
        teamId: team.id,
        teamName: team.name,
        teamColor: team.color,
        perDay,
        promedio: notaPerfilDia(notas),
        diasAprobados: perDay.filter((d) => d.aprobado === true).length,
        diasEvaluados: notas.length,
        aptitudesRiesgosCount: perDay.filter((d) => d.aptitudesRiesgos).length,
        comments: (commentsByMemberId.get(member.id) ?? []).map((c) => ({ day: c.day, author: c.author, text: c.text })),
        softSkills,
        softSkillComments: softSkillCommentsByMemberId.get(member.id) ?? [],
      });
    }
  }

  return rows.sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1));
}
