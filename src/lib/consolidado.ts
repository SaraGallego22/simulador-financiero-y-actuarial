import type { EvaluationProfile } from "@prisma/client";
import { prisma } from "./prisma";
import { getTeamBookForDay, computeReservesForTeams, getUniverseForSeed, getSectorStatsForSeed } from "./teamBook";
import type { ColombiaUniverse } from "@/domain/generation/generateColombia";
import { computeFinBenchForCohort } from "./finBenchHelper";
import type { FinBenchResult } from "@/domain/finance/finBench";
import type { LiabilitySchedule } from "@/domain/reserving/liability";
import { getOrCreateActiveCohort } from "./cohort";
import { scoreFinanciero } from "@/domain/finance/alm";
import { isMinVarianceAllocation, isPortfolioDecisionV4 } from "@/domain/finance/instruments";
import { scoreMinVariance } from "@/domain/finance/markowitz";
import { conceptosDia, scoreConcepto, ownValueKey } from "@/domain/grading/concepts";
import type { Dia } from "@/domain/grading/concepts";
import { rankForCrecer, rankForDisminuir, groupSectorPicksByTeam, scoreSectorRecommendation } from "@/domain/grading/sectors";
import { notaTarifacionAbsoluta, notaPerfilDia, notaObjetivaDia, notaSubjetivaEquipo, notaDia } from "@/domain/grading/composite";
import { FZ } from "@/domain/finance/constants";
import { OUTSOURCED_CONSULTING_FEE_PCT } from "@/domain/pricing/outsourced";
import { averageSoftSkillsByMember } from "@/lib/softSkills";
import type { SoftSkillCompetency } from "@/lib/softSkills";
import { perfilPredominante } from "@/domain/grading/composite";

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
 * Real, aggregate (never per-team) loss ratio across every team's DONE
 * result for a given day — siniestros reales de todo el mercado ÷ prima
 * DEVENGADA real de todo el mercado, both summed across teams, never broken
 * out per team. Devengada (not emitida), same as computeRt()/finBench()'s
 * own rt — this is the reference a team's own Loss Ratio Esperado (Día 2's
 * guide §2, itself now Prima Devengada-based to match) gets contrasted
 * against, so both sides of that comparison need the same premium base.
 * Shown regardless of how few teams have a result (even 1) — an admin
 * running a small test cohort still wants to see it.
 */
export async function computeMarketLossRatio(cohortId: string, day: number): Promise<MarketLossRatio | null> {
  const results = await prisma.teamSimResult.findMany({
    where: { simulationRun: { cohortId, day, status: "DONE" } },
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
 * (notaTarifacionAbsoluta, notaPerfilDia, notaObjetivaDia, notaSubjetivaEquipo,
 * notaDia) are already pure/tested; this is the app-specific plumbing that
 * feeds them from what's actually stored for a cohort.
 *
 * `maxDay`, when passed, drops every day after it from `perDay` entirely
 * (objective, subjective and blended nota all null), so it never reaches
 * objectiveFinal/subjectiveFinal/notaFinal. Both the team-facing standings
 * page and the admin "Consolidado final" pass `cohort.openDay - 1`, so the
 * ranking only reflects days already closed — never the one in progress, and
 * never one the team can't open yet (which would otherwise score ~0, see the
 * guard in the perDay map). The per-day admin grading view (admin/day/[n])
 * passes nothing, so every day counts there as soon as it's graded.
 *
 * `universeOverride` lets a caller that already generated (or already has)
 * the Colombia universe this request pass it through instead of triggering
 * another regeneration inside computeFinBenchForCohort()/getTeamBookForDay()
 * — see those functions' doc comments.
 *
 * `finBenchByTeamIdOverride`/`reserves1ByTeamIdOverride` go a step further:
 * even with `universeOverride`, this function used to independently rerun
 * computeFinBenchForCohort() (every team's finBench/ALM computation, plus
 * the O(n) pass over the universe's 1,000,000 exposures that
 * getTeamBookForDay()/getYear2ClaimsByTeamId() do to rebuild each team's
 * claims) and, on Día 2, a second O(n) pass + chain-ladder run for Año 1's
 * reserves — both already computed once by admin/day/[n] for its own
 * tables. Passing the already-computed maps through skips that duplicate
 * work entirely instead of just deduplicating the universe object itself.
 */
export async function computeConsolidado(
  cohortId?: string,
  maxDay?: number,
  universeOverride?: ColombiaUniverse,
  finBenchByTeamIdOverride?: Map<string, FinBenchResult>,
  reserves1ByTeamIdOverride?: Map<string, LiabilitySchedule>
): Promise<TeamConsolidado[]> {
  const cohort = cohortId ? { id: cohortId } : await getOrCreateActiveCohort();

  const [teams, rubric] = await Promise.all([
    prisma.team.findMany({
      where: { cohortId: cohort.id },
      // `select` on members, not `include`: TeamMember carries a `photo`
      // bytea, and pulling every member's headshot for a whole cohort
      // measured ~35s on this database. Only the id is read below (to look
      // up each member's notaGeneral), so nothing else is worth fetching.
      include: { members: { select: { id: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.rubricConfig.upsert({ where: { cohortId: cohort.id }, update: {}, create: { cohortId: cohort.id } }),
  ]);
  const tolerance = { tolerancePerfect: rubric.tolerancePerfect, toleranceZero: rubric.toleranceZero };

  // Year 1 / Year 2 tariff-quality scores (notaTarifacionAbsoluta), keyed by real
  // team.id via a local numeric remap (the domain fn works in plain numbers).
  const tarifByDay = new Map<number, Map<string, number>>();
  // Año 2's RT needs each team's own Año 1 totalPremium to release its RPND
  // holdback as this year's revenue (see composite.ts's computeRt()) — fetched
  // once, before the loop, so day===2's iteration below can look it up per team.
  const year1TotalPremiumByTeamId = await latestTotalPremiumByTeamId(cohort.id, 1);
  for (const day of [1, 2]) {
    const byTeamId = new Map<string, number>();
    if (maxDay == null || day <= maxDay) {
      const results = await prisma.teamSimResult.findMany({
        where: { simulationRun: { cohortId: cohort.id, day, status: "DONE" } },
        orderBy: { simulationRun: { createdAt: "desc" } },
      });
      // Teams that outsourced THIS day's tariff pay the consultancy's fee
      // inside gastos de adquisición, so it's part of the expense load RT
      // subtracts — see computeRt()/PnL.gadq.
      const outsourcedThisDay = new Set(
        (
          await prisma.tariffSubmission.findMany({
            where: { day, outsourced: true, team: { cohortId: cohort.id } },
            select: { teamId: true },
          })
        ).map((s) => s.teamId)
      );
      const seen = new Set<string>();
      const numericIdByTeamId = new Map<string, number>();
      const rows: { teamId: number; totalPremium: number; claimsAmount: number; rpndLiberada?: number; acquisitionFeePct?: number }[] = [];
      for (const r of results) {
        if (seen.has(r.teamId)) continue; // keep only the latest run per team
        seen.add(r.teamId);
        const numericId = numericIdByTeamId.size + 1;
        numericIdByTeamId.set(r.teamId, numericId);
        const rpndLiberada = day === 2 ? FZ.rpndPct * (year1TotalPremiumByTeamId.get(r.teamId) ?? 0) : undefined;
        rows.push({
          teamId: numericId,
          totalPremium: r.totalPremium,
          claimsAmount: r.claimsAmount,
          rpndLiberada,
          acquisitionFeePct: outsourcedThisDay.has(r.teamId) ? OUTSOURCED_CONSULTING_FEE_PCT : 0,
        });
      }
      // Both years score the same way: anchored to the model's own definition
      // of good performance (see notaTarifacionAbsoluta's doc comment) rather
      // than to how the rest of the cohort happened to price this run. Año 2
      // used to use a cohort-relative scorer of its own; that made the two
      // days' tariff notas mean different things and a team's Año 2 grade
      // depend on who else showed up.
      const map = notaTarifacionAbsoluta(rows);
      for (const [teamId, numericId] of numericIdByTeamId) {
        const v = map.get(numericId);
        if (v != null) byTeamId.set(teamId, v);
      }
    }
    tarifByDay.set(day, byTeamId);
  }

  const finBenchByTeamId = finBenchByTeamIdOverride ?? (await computeFinBenchForCohort(cohort.id, universeOverride));

  // Año 1's real ALM schedule is submitted Día 2 (not Día 1 — Día 1 is the
  // minimum-variance exercise, scored separately below).
  const almScoreByTeamId = new Map<string, number>();
  let reserves1 = reserves1ByTeamIdOverride ?? null;
  if (!reserves1) {
    const book1 = await getTeamBookForDay(cohort.id, 1, universeOverride);
    if (book1) reserves1 = computeReservesForTeams(book1.claimsByTeamId);
  }
  if (reserves1) {
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
      // getUniverseForSeed/getSectorStatsForSeed are already module-scope
      // cached by seed (see teamBook.ts) — passing universeOverride through
      // here would still need the seed for that cache key, so it isn't
      // worth threading separately; the DB lookup above is cheap, unlike
      // the finBench/ALM recomputation universeOverride avoids above.
      const universe = universeOverride ?? getUniverseForSeed(universeRun.seed);
      const sectorStats = getSectorStatsForSeed(universeRun.seed, universe);
      const trueCrecer = rankForCrecer(sectorStats);
      const trueDisminuir = rankForDisminuir(sectorStats);
      const recs = await prisma.analyticsRecommendation.findMany({ where: { day: 4, team: { cohortId: cohort.id } } });
      const picksByTeamId = groupSectorPicksByTeam(recs);
      for (const [teamId, picks] of picksByTeamId) {
        const score = scoreSectorRecommendation(picks, trueCrecer, trueDisminuir);
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
  const notaGeneralByMemberDay = new Map<string, number | null>();
  for (const e of allMemberEvaluations) {
    notaGeneralByMemberDay.set(`${e.teamMemberId}:${e.day}`, e.notaGeneral);
  }

  const results: TeamConsolidado[] = teams.map((team) => {
    const perDay = [1, 2, 3, 4].map((day) => {
      // A day past the cap contributes nothing — not a partial objective, not
      // a subjective. scoreConcepto() scores an unsubmitted "reporte" concept
      // as ~0 against its finBench value (concepts.ts), so without this a day
      // the team can't even open yet would still land in objectiveFinal as a
      // near-zero, dragging the whole ranking down. Nulls are dropped by the
      // objectiveFinal/subjectiveFinal filters below.
      if (maxDay != null && day > maxDay) {
        return { objective: null, subjective: null, nota: null };
      }
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
      // without treating it as "still pending". (Days beyond `maxDay` already
      // returned above.)
      const memberNotas: (number | null)[] =
        day === 1 ? [] : team.members.map((m) => notaGeneralByMemberDay.get(`${m.id}:${day}`) ?? null);
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
  // Most common `perfil` across perDay, most-recent-day-wins on a tie — see
  // perfilPredominante()'s doc comment.
  perfilPredominante: EvaluationProfile | null;
  diasAprobados: number;
  diasEvaluados: number;
  // Días 2-4 where the "Mostró aptitudes para Riesgos" checkpoint was
  // marked, out of 3 — independent of notaGeneral (see
  // MemberDayEvaluation.aptitudesRiesgos's doc comment), so this is out of a
  // fixed 3, not out of diasEvaluados like diasAprobados above.
  aptitudesRiesgosCount: number;
  // Not shown in /admin/standings' on-screen table — carried only for the
  // CSV export (/api/members/consolidado-csv), which is the admin's own
  // private copy.
  comments: { day: number; author: string; text: string }[];
  // Habilidades blandas: teams never see this (see softSkills.ts's doc
  // comment) — this whole function is only ever called from admin routes.
  // One nota per competency, averaging
  // RATING_SCORES across whichever of the 3 activities rated that
  // competency for this member — missing if none did, and also missing if
  // every rating was "No se evidencia", which is NA rather than a low score
  // (see softSkills.ts).
  softSkills: Partial<Record<SoftSkillCompetency, number>>;
  softSkillComments: { activity: number; text: string }[];
  // TH's one-on-one interview comments (see interview.ts) — same CSV-only
  // treatment as softSkillComments above; always authored by
  // INTERVIEW_COMMENT_AUTHOR, so that's not carried per-row here either.
  interviewComments: { text: string }[];
}

/**
 * Per-person subjective-grading summary across Días 2-4 (Día 1 has no
 * subjective grade — see MemberDayEvaluation's doc comment), so an evaluator
 * can compare/rank people across the whole cohort instead of only within
 * their own team's day-by-day view. Sorted by `promedio` like
 * computeConsolidado() sorts teams by `notaFinal`. Admin-only (teams never
 * see subjective grading), so unlike computeConsolidado there's no
 * team-facing caller and no need to withhold anything.
 */
export async function computeMemberConsolidado(cohortId?: string): Promise<MemberConsolidadoRow[]> {
  const cohort = cohortId ? { id: cohortId } : await getOrCreateActiveCohort();

  const teams = await prisma.team.findMany({
    where: { cohortId: cohort.id },
    // Only id/name are read below — never the `photo` bytea. See
    // computeConsolidado()'s equivalent query for why that matters.
    include: { members: { select: { id: true, name: true } } },
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

  // Habilidades blandas: grouped by member, then by competency, so each
  // competency's nota can average across whichever activities actually
  // rated it.
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

  const interviewCommentsRaw = await prisma.interviewComment.findMany({
    where: { teamMember: { team: { cohortId: cohort.id } } },
    orderBy: { createdAt: "asc" },
  });
  const interviewCommentsByMemberId = new Map<string, { text: string }[]>();
  for (const c of interviewCommentsRaw) {
    if (!interviewCommentsByMemberId.has(c.teamMemberId)) interviewCommentsByMemberId.set(c.teamMemberId, []);
    interviewCommentsByMemberId.get(c.teamMemberId)!.push({ text: c.text });
  }

  const rows: MemberConsolidadoRow[] = [];
  for (const team of teams) {
    for (const member of team.members) {
      const perDay = [2, 3, 4].map((day) => {
        const e = evalByMemberDay.get(`${member.id}:${day}`);
        if (!e) return { day, notaGeneral: null, aprobado: null, perfil: null, aptitudesRiesgos: false };
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
        perfilPredominante: perfilPredominante(perDay),
        diasAprobados: perDay.filter((d) => d.aprobado === true).length,
        diasEvaluados: notas.length,
        aptitudesRiesgosCount: perDay.filter((d) => d.aptitudesRiesgos).length,
        comments: (commentsByMemberId.get(member.id) ?? []).map((c) => ({ day: c.day, author: c.author, text: c.text })),
        softSkills,
        softSkillComments: softSkillCommentsByMemberId.get(member.id) ?? [],
        interviewComments: interviewCommentsByMemberId.get(member.id) ?? [],
      });
    }
  }

  return rows.sort((a, b) => (b.promedio ?? -1) - (a.promedio ?? -1));
}
