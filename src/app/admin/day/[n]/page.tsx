import Link from "next/link";
import { auth } from "@/lib/auth";
import { getCohortForSession, getOrCreateActiveCohort } from "@/lib/cohort";
import { prisma } from "@/lib/prisma";
import { getTeamBookForDay, computeReservesForTeams, getSectorStatsForSeed, getActiveColombiaUniverse } from "@/lib/teamBook";
import { computeFinBenchBundlesForCohort } from "@/lib/finBenchHelper";
import { scoreFinanciero, almLadder } from "@/domain/finance/alm";
import { isMinVarianceAllocation, isPortfolioDecisionV4 } from "@/domain/finance/instruments";
import { TARGET_RETURN, portfolioExpectedReturn, portfolioVariance, scoreMinVariance, solveLongOnlyMinVariance } from "@/domain/finance/markowitz";
import { conceptosDia, scoreConcepto, ownValueKey } from "@/domain/grading/concepts";
import type { ConceptGroup, Dia } from "@/domain/grading/concepts";
import {
  rankForCrecer,
  rankForDisminuir,
  groupSectorPicksByTeam,
  scoreSectorRecommendation,
  sectorKey,
  sectorLabel,
  SECTOR_MIN_COUNT,
} from "@/domain/grading/sectors";
import { notaTarifacionAbsoluta, notaPerfilDia, computeRt } from "@/domain/grading/composite";
import { FZ } from "@/domain/finance/constants";
import { OUTSOURCED_CONSULTING_FEE_PCT } from "@/domain/pricing/outsourced";
import { computeConsolidado } from "@/lib/consolidado";
import { memberPhotoDataUri } from "@/lib/memberPhoto";
import { MemberPhoto } from "@/components/MemberPhoto";
import { SoftSkillsRadarChart } from "@/components/SoftSkillsRadarChart";
import { TeamSelect } from "@/components/TeamSelect";
import { averageSoftSkillsByMember, ACTIVITY_TITLES } from "@/lib/softSkills";
import { INTERVIEW_SKILLS, INTERVIEW_SKILL_LABELS } from "@/lib/interview";
import type { InterviewSkill, InterviewSkillScore } from "@/lib/interview";
import { Dia1TeamDetail } from "./Dia1TeamDetail";
import { Dia2TeamDetail } from "./Dia2TeamDetail";
import { ReportesTeamDetail } from "./ReportesTeamDetail";
import { SectoresTeamDetail } from "./SectoresTeamDetail";
import { Dia2AlmTeamDetail } from "./Dia2AlmTeamDetail";
import { MemberEvaluationForm } from "./MemberEvaluationForm";
import { MemberComments } from "./MemberComments";
import { AptitudesRiesgosToggle } from "./AptitudesRiesgosToggle";
import { DeleteMemberButton } from "./DeleteMemberButton";
import { DayTabBar } from "@/components/DayTabBar";
import type { DayTabKey } from "@/components/DayTabBar";
import { DAY_TITLES, DAY_DESCRIPTIONS } from "@/lib/days";

// Never statically prerender — see admin/standings/page.tsx.
export const dynamic = "force-dynamic";

export default async function AdminDayPage({
  params,
  searchParams,
}: {
  params: Promise<{ n: string }>;
  searchParams: Promise<{ tab?: string; team?: string }>;
}) {
  const { n } = await params;
  const day = Number(n);
  const includeSim = day <= 2;
  // Día 1 hosts the minimum-variance exercise; the real ALM tree is submitted
  // once, on Día 2 (graded against bookYear=1's reserves) — Día 3 no longer
  // offers a rebalance, it was cut to lighten an already-packed day. Año 2
  // still uses whatever tree was submitted on Día 2.
  const hasMinVariance = day === 1;
  const hasPortfolioSchedule = day === 2;
  const bookYear = day === 2 ? 1 : null;
  const { tab, team: selectedTeamId } = await searchParams;
  const activeTab = (tab as DayTabKey) ?? "resultados";
  const session = await auth();
  const cohort = session ? await getCohortForSession(session) : await getOrCreateActiveCohort();

  const reportConcepts = conceptosDia(`d${day}` as Dia).filter((c) => c.tipo === "reporte");
  const hasAnalitica = conceptosDia(`d${day}` as Dia).some((c) => c.tipo === "auto_analitica");

  // Everything below is independent of everything else in this batch (none
  // of these read each other's results) — fired together instead of one
  // round trip at a time, since each Neon round trip has its own baseline
  // latency that otherwise just adds up sequentially for no reason.
  const [
    teams,
    memberEvaluations,
    memberComments,
    historicalEvaluations,
    historicalComments,
    latestRun,
    universe,
    deliverables,
    rubric,
    universeRunForSectors,
    analyticsRecs,
    softSkillEvals,
    softSkillComments,
    interviewSkillRatings,
    interviewComments,
  ] = await Promise.all([
    prisma.team.findMany({
      where: { cohortId: cohort.id },
      include: {
        tariffSubmissions: { where: { day }, select: { meanPremium: true, medianPremium: true, outsourced: true } },
        portfolioAllocations: { where: { day }, select: { allocation: true } },
        // Explicitly WITHOUT the `photo`/`photoMimeType` bytea columns:
        // headshots are only rendered in the "subj" tab, and only for the
        // one selected team, so they're fetched separately below
        // (selectedTeamMembers) instead of for all ~12 teams on every tab.
        // Pulling the whole cohort's photos here measured ~35s per load.
        members: { select: { id: true, name: true, carrera: true, universidad: true, semestre: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    // Día 1 has no subjective grade at all (see MemberDayEvaluation's doc comment).
    day >= 2
      ? prisma.memberDayEvaluation.findMany({
          where: { day, teamMember: { team: { cohortId: cohort.id } } },
          include: { teamMember: { select: { teamId: true } } },
        })
      : Promise.resolve([]),
    day >= 2
      ? prisma.memberComment.findMany({
          where: { day, teamMember: { team: { cohortId: cohort.id } } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    // Historial: earlier days' nota/aprobado/perfil for the same members, so
    // grading Día 3 can show what was recorded on Día 2 without navigating
    // away.
    day > 2
      ? prisma.memberDayEvaluation.findMany({
          where: { day: { gte: 2, lt: day }, teamMember: { team: { cohortId: cohort.id } } },
        })
      : Promise.resolve([]),
    day > 2
      ? prisma.memberComment.findMany({
          where: { day: { gte: 2, lt: day }, teamMember: { team: { cohortId: cohort.id } } },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    prisma.simulationRun.findFirst({
      where: { cohortId: cohort.id, day },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, teamResults: true },
    }),
    // Generated once and reused below for every call that would otherwise
    // regenerate its own copy this same request (getTeamBookForDay,
    // computeFinBenchBundlesForCohort's internal Día 1/Año 2 lookups) — see
    // getActiveColombiaUniverse()'s doc comment; this exact redundancy
    // (three separate 1,000,000-row regenerations) caused a production OOM
    // on the Día 2 *simulation trigger* (/api/simulation), and made this
    // page slow to load for the same reason.
    day >= 1 ? getActiveColombiaUniverse(cohort.id) : Promise.resolve(null),
    // Deliverables: teams self-report numeric concepts, graded against
    // finBench's computed benchmark within a tolerance band — fetched across
    // ALL days (not just this one), since a "formula" concept can reference a
    // prior day's own submission (e.g. Día 3's Balance Año 1 lines need Día
    // 2's own Prima Emitida — see concepts.ts's FormulaTerm.day doc comment).
    reportConcepts.length > 0 ? prisma.deliverable.findMany({ where: { team: { cohortId: cohort.id } } }) : Promise.resolve([]),
    prisma.rubricConfig.findUnique({ where: { cohortId: cohort.id } }),
    // Just the seed — the universe-wide sector "true answer" (see
    // sectors.ts) is computed below, after `universe` (already being
    // resolved above) is available; Promise.all entries can't depend on
    // each other's results.
    hasAnalitica
      ? prisma.universeRun.findFirst({ where: { cohortId: cohort.id, kind: "colombia", status: "DONE" }, orderBy: { createdAt: "desc" }, select: { seed: true } })
      : Promise.resolve(null),
    hasAnalitica
      ? prisma.analyticsRecommendation.findMany({ where: { day, team: { cohortId: cohort.id } } })
      : Promise.resolve([]),
    // Habilidades blandas (radar) and TH interview (Excel/Programación +
    // comments) shown read-only alongside this day's subjective grading —
    // same "day >= 2" gate as memberEvaluations above, not activeTab, so
    // switching tabs doesn't need another round trip.
    day >= 2 ? prisma.softSkillEvaluation.findMany({ where: { teamMember: { team: { cohortId: cohort.id } } } }) : Promise.resolve([]),
    day >= 2
      ? prisma.softSkillComment.findMany({ where: { teamMember: { team: { cohortId: cohort.id } } }, orderBy: [{ activity: "asc" }, { createdAt: "asc" }] })
      : Promise.resolve([]),
    day >= 2 ? prisma.interviewSkillRating.findMany({ where: { teamMember: { team: { cohortId: cohort.id } } } }) : Promise.resolve([]),
    day >= 2
      ? prisma.interviewComment.findMany({ where: { teamMember: { team: { cohortId: cohort.id } } }, orderBy: { createdAt: "asc" } })
      : Promise.resolve([]),
  ]);

  const evaluationByMemberId = new Map<string, (typeof memberEvaluations)[number]>();
  for (const e of memberEvaluations) {
    evaluationByMemberId.set(e.teamMemberId, e);
  }

  const commentsByMemberId = new Map<string, (typeof memberComments)[number][]>();
  for (const c of memberComments) {
    if (!commentsByMemberId.has(c.teamMemberId)) commentsByMemberId.set(c.teamMemberId, []);
    commentsByMemberId.get(c.teamMemberId)!.push(c);
  }

  // Historial: previous days' evaluation + comments, grouped by member then
  // by day, for the read-only recap shown above each member's current-day
  // form (see admin/day/[n]/page.tsx's "subj" tab below).
  const historicalEvaluationsByMemberDay = new Map<string, (typeof historicalEvaluations)[number]>();
  for (const e of historicalEvaluations) historicalEvaluationsByMemberDay.set(`${e.teamMemberId}:${e.day}`, e);
  const historicalCommentsByMemberDay = new Map<string, (typeof historicalComments)[number][]>();
  for (const c of historicalComments) {
    const key = `${c.teamMemberId}:${c.day}`;
    if (!historicalCommentsByMemberDay.has(key)) historicalCommentsByMemberDay.set(key, []);
    historicalCommentsByMemberDay.get(key)!.push(c);
  }

  // Habilidades blandas (radar) and TH interview (read-only summary) for the
  // redesigned "subj" tab below.
  const softSkillsByMemberId = averageSoftSkillsByMember(softSkillEvals);
  const softSkillCommentsByMemberId = new Map<string, (typeof softSkillComments)[number][]>();
  for (const c of softSkillComments) {
    if (!softSkillCommentsByMemberId.has(c.teamMemberId)) softSkillCommentsByMemberId.set(c.teamMemberId, []);
    softSkillCommentsByMemberId.get(c.teamMemberId)!.push(c);
  }
  const interviewRatingsByMemberId = new Map<string, Partial<Record<InterviewSkill, InterviewSkillScore>>>();
  for (const r of interviewSkillRatings) {
    if (!interviewRatingsByMemberId.has(r.teamMemberId)) interviewRatingsByMemberId.set(r.teamMemberId, {});
    interviewRatingsByMemberId.get(r.teamMemberId)![r.skill as InterviewSkill] = r.rating as InterviewSkillScore;
  }
  const interviewCommentsByMemberId = new Map<string, (typeof interviewComments)[number][]>();
  for (const c of interviewComments) {
    if (!interviewCommentsByMemberId.has(c.teamMemberId)) interviewCommentsByMemberId.set(c.teamMemberId, []);
    interviewCommentsByMemberId.get(c.teamMemberId)!.push(c);
  }

  const resultByTeamId = new Map((latestRun?.teamResults ?? []).map((r) => [r.teamId, r]));
  const submittedCount = teams.filter((t) => t.tariffSubmissions[0]?.meanPremium != null).length;

  // Día 4 sector exercise: the one true global ranking (never per-team —
  // see sectors.ts's doc comment on why a team's own book is a biased
  // sample), and each team's score against it.
  const sectorStats = hasAnalitica && universe && universeRunForSectors ? getSectorStatsForSeed(universeRunForSectors.seed, universe) : [];
  const trueCrecer = rankForCrecer(sectorStats);
  const trueDisminuir = rankForDisminuir(sectorStats);

  const picksByTeamId = groupSectorPicksByTeam(analyticsRecs);

  // ALM score per team: needs Año 1's book of claims (bookYear is only ever
  // 1, on Día 2 — see hasPortfolioSchedule above) to compute reserves, plus
  // whatever tree they uploaded. This is the *fictitious* ALM only (what's
  // graded for the Día 2 ALM nota) — the real ALM (below, via
  // finBenchBundlesByTeamId) is a completely separate, 12-months-at-a-time
  // computation, not a variant of this one (see README §5.3).
  // Both only depend on `universe` (already resolved above), not on each
  // other, so they run together instead of one after the other.
  const [book, finBenchBundlesByTeamId] = await Promise.all([
    bookYear != null ? getTeamBookForDay(cohort.id, bookYear, universe ?? undefined) : Promise.resolve(null),
    // finBench (P&L/balance/solvency) only needs Year 1's simulation to be
    // DONE — p1 (Year-1 RT/gastos) is meaningful from Day 1 itself, even
    // before any portfolio/Year-2 data exists (it falls back to a default
    // reinvestment yield when almYear1 is null). finBenchBundlesByTeamId
    // additionally exposes the exact real-ALM runs (realAlmYear1/2) that
    // fed bench.p1/p2/bal1/bal2 — used below to show the real ALM ladder
    // without a second, separately-computed "real" run that could drift
    // out of sync with what's actually graded (see finBenchHelper.ts's
    // doc comment).
    day >= 1 ? computeFinBenchBundlesForCohort(cohort.id, universe ?? undefined) : Promise.resolve(new Map()),
  ]);
  const finBenchByTeamId = new Map([...finBenchBundlesByTeamId].map(([teamId, b]) => [teamId, b.bench]));

  const almScoreByTeamId = new Map<string, ReturnType<typeof scoreFinanciero>>();
  const almLadderByTeamId = new Map<string, ReturnType<typeof almLadder>>();
  // Also handed to computeConsolidado() below (Día 2 only — its own Año 1
  // ALM score needs the same reserves) so it doesn't rebuild them itself.
  let reservesByTeamId: ReturnType<typeof computeReservesForTeams> | undefined;
  if (book && hasPortfolioSchedule) {
    reservesByTeamId = computeReservesForTeams(book.claimsByTeamId);
    for (const team of teams) {
      const rawAllocation = team.portfolioAllocations[0]?.allocation;
      const reserves = reservesByTeamId.get(team.id);
      if (reserves && isPortfolioDecisionV4(rawAllocation)) {
        almScoreByTeamId.set(team.id, scoreFinanciero(reserves, rawAllocation));
        if (activeTab === "resultados") almLadderByTeamId.set(team.id, almLadder(reserves, rawAllocation));
      }
    }
  }

  // Fetched here (not in an earlier Promise.all) so it can be handed
  // `finBenchByTeamId`/`reservesByTeamId` above, already computed for this
  // page's own tables — without them, computeConsolidado() used to rerun
  // every team's finBench/ALM computation (and Día 2's reserves chain-ladder)
  // a second time in the same request just to derive objectiveByTeamId below.
  const consolidadoRows =
    activeTab === "top" || activeTab === "resultados"
      ? await computeConsolidado(cohort.id, undefined, universe ?? undefined, finBenchByTeamId, reservesByTeamId)
      : null;

  // This day's final "nota objetiva" per team, read straight off
  // computeConsolidado() rather than re-derived here — Día 2's real blend
  // also folds in the full Año 1 P&G's report-concept scores (see
  // concepts.ts's "d2" entries — Prima Emitida through Utilidad Neta, no
  // reserves line, those live in Día 3's Balance), not just the
  // tariff/ALM scores shown alongside it below, so recomputing it by hand
  // here would drift from what's actually graded.
  const objectiveByTeamId = new Map<string, number>();
  for (const row of consolidadoRows ?? []) {
    const objective = row.perDay[day - 1]?.objective;
    if (objective != null) objectiveByTeamId.set(row.teamId, objective);
  }

  // Actuarial (tarifación) score per team for this day's results — same
  // function computeConsolidado() uses for the final grade, so what the admin
  // sees here always matches what actually gets graded. Both days are
  // model-anchored (notaTarifacionAbsoluta), and Día 2 needs finBenchByTeamId
  // above to release Año 1's own RPND holdback as Año 2's revenue — see
  // composite.ts's computeRt().
  const actuarialScoreByTeamId = new Map<string, number>();
  // Teams that outsourced this day's tariff carry the consultancy's fee inside
  // gastos de adquisición, part of the expense load RT subtracts — see
  // computeRt()/PnL.gadq.
  const outsourcedThisDay = new Set(teams.filter((t) => t.tariffSubmissions[0]?.outsourced).map((t) => t.id));
  if (includeSim && latestRun?.teamResults.length) {
    const numericIdByTeamId = new Map(latestRun.teamResults.map((r, i) => [r.teamId, i + 1]));
    const rows = latestRun.teamResults.map((r) => ({
      teamId: numericIdByTeamId.get(r.teamId)!,
      totalPremium: r.totalPremium,
      claimsAmount: r.claimsAmount,
      rpndLiberada: day === 2 ? FZ.rpndPct * (finBenchByTeamId.get(r.teamId)?.p1.primaEmitida ?? 0) : undefined,
      acquisitionFeePct: outsourcedThisDay.has(r.teamId) ? OUTSOURCED_CONSULTING_FEE_PCT : 0,
    }));
    const scoreByNumericId = notaTarifacionAbsoluta(rows);
    for (const [teamId, numericId] of numericIdByTeamId) {
      const score = scoreByNumericId.get(numericId);
      if (score != null) actuarialScoreByTeamId.set(teamId, score);
    }
  }

  const tolerance = {
    tolerancePerfect: rubric?.tolerancePerfect ?? 0.05,
    toleranceZero: rubric?.toleranceZero ?? 0.4,
  };

  const analiticaScoreByTeamId = new Map<string, number>();
  for (const [teamId, picks] of picksByTeamId) {
    const score = scoreSectorRecommendation(picks, trueCrecer, trueDisminuir, tolerance);
    if (score != null) analiticaScoreByTeamId.set(teamId, score);
  }

  // Día 1's minimum-variance exercise, per team — scored against the true
  // optimal portfolio at the team's own achieved return, never per-team
  // (see markowitz.ts).
  const minVarScoreByTeamId = new Map<string, number>();
  const minVarWeightsByTeamId = new Map<string, Record<string, number>>();
  if (hasMinVariance) {
    for (const team of teams) {
      const rawAllocation = team.portfolioAllocations[0]?.allocation;
      if (isMinVarianceAllocation(rawAllocation)) {
        minVarWeightsByTeamId.set(team.id, rawAllocation);
        minVarScoreByTeamId.set(team.id, scoreMinVariance(rawAllocation));
      }
    }
  }
  const minVarReferenceWeights = solveLongOnlyMinVariance(TARGET_RETURN);

  const deliverablesByTeamId = new Map<string, Record<string, number>>();
  // Per-team, keyed `${day}:${conceptId}` — what scoreConcepto()'s formula
  // concepts read their own inputs from (see concepts.ts's ownValueKey()).
  const ownValuesByTeamId = new Map<string, Map<string, number>>();
  for (const d of deliverables) {
    if (!deliverablesByTeamId.has(d.teamId)) deliverablesByTeamId.set(d.teamId, {});
    deliverablesByTeamId.get(d.teamId)![d.conceptId] = d.value;
    if (!ownValuesByTeamId.has(d.teamId)) ownValuesByTeamId.set(d.teamId, new Map());
    ownValuesByTeamId.get(d.teamId)!.set(ownValueKey(`d${d.day}` as Dia, d.conceptId), d.value);
  }

  // The actAvg/finAvg components of this day's objective grade — averages of
  // the report concepts of each perfil, the same way computeConsolidado()
  // does, so the breakdown shown in "Top del día" adds up to the nota next
  // to it. Which concepts fall on which side varies by day: Día 2 is all
  // "fin" (the 2027 P&G), Día 3 splits the Balance's reservas técnicas lines
  // into "act", Día 4's only "act" input is the analítica sectorial (not a
  // "reporte" concept — folded in below, same as computeConsolidado does).
  // Día 1 has no report concepts at all: its financial component is the
  // mín-var score alone, shown separately in its own tables.
  const actReportScoreByTeamId = new Map<string, number>();
  const finReportScoreByTeamId = new Map<string, number>();
  if (day >= 2) {
    for (const team of teams) {
      const values = deliverablesByTeamId.get(team.id) ?? {};
      const bench = finBenchByTeamId.get(team.id) ?? null;
      const ownValues = ownValuesByTeamId.get(team.id) ?? new Map<string, number>();
      const actScores: number[] = [];
      const finScores: number[] = [];
      for (const c of reportConcepts) {
        const score = scoreConcepto(c.id, values[c.id] ?? null, bench, tolerance, ownValues)?.score;
        if (score != null) (c.perfil === "act" ? actScores : finScores).push(score);
      }
      if (hasAnalitica) {
        const analitica = analiticaScoreByTeamId.get(team.id);
        if (analitica != null) actScores.push(analitica);
      }
      const actAvg = notaPerfilDia(actScores);
      if (actAvg != null) actReportScoreByTeamId.set(team.id, actAvg);
      const finAvg = notaPerfilDia(finScores);
      if (finAvg != null) finReportScoreByTeamId.set(team.id, finAvg);
    }
  }

  // "subj" tab shows one team at a time (see its section below) — falls back
  // to the first team when no ?team= is selected or it doesn't match.
  const selectedSubjTeam = teams.find((t) => t.id === selectedTeamId) ?? teams[0];
  // Headshots for just that one team, and only on the tab that renders them
  // — the cohort-wide `teams` query above deliberately omits the `photo`
  // bytea (see its comment). Keyed by member id for the lookup below.
  const photoByMemberId = new Map<string, string | null>(
    activeTab === "subj" && selectedSubjTeam
      ? (
          await prisma.teamMember.findMany({
            where: { teamId: selectedSubjTeam.id },
            select: { id: true, photo: true, photoMimeType: true },
          })
        ).map((m) => [m.id, memberPhotoDataUri(m.photo, m.photoMimeType)])
      : []
  );
  // TeamSelect is a Client Component — pass only the plain fields it needs,
  // never the full `teams` query result (its `members` include nested Bytes
  // photo columns, which React's Flight serializer cannot send across the
  // server/client boundary: "ArrayBuffer is not detachable and could not be
  // cloned").
  const teamOptions = teams.map((t) => ({ id: t.id, name: t.name, color: t.color }));

  // Días 1-2's merged "Resultados" tab (see DayTabBar.tsx) — market results,
  // the P&G down to RT for one selected team, and the portfolio (min-var on
  // Día 1, the Día 2 tree on Día 2), all ranked/formatted the same way:
  // millones de pesos, best nota first.
  const fmtM = (v: number | null | undefined) => (v == null ? "—" : `$${Math.round(v / 1e6).toLocaleString("es-CO")} M`);
  const fmtCop = (v: number | null | undefined) => (v == null ? "—" : `$${Math.round(v).toLocaleString("es-CO")}`);
  const totalInsuredThisYear = includeSim ? teams.reduce((s, t) => s + (resultByTeamId.get(t.id)?.insuredCount ?? 0), 0) : 0;
  // Results table (below) ranks by the Tarifas/actuarial score alone
  // (notaTarifacionAbsoluta), not the blended objective nota — see
  // actuarialScoreByTeamId above.
  const teamsByActScoreDesc = [...teams].sort(
    (a, b) => (actuarialScoreByTeamId.get(b.id) ?? -Infinity) - (actuarialScoreByTeamId.get(a.id) ?? -Infinity)
  );
  // Min-variance portfolio table ranks by its own score, not the blended
  // objective nota — a team's tariff pricing shouldn't affect where its
  // portfolio submission lands in this list.
  const teamsByMinVarScoreDesc = [...teams].sort(
    (a, b) => (minVarScoreByTeamId.get(b.id) ?? -Infinity) - (minVarScoreByTeamId.get(a.id) ?? -Infinity)
  );

  // "Estado de cargues": which of this day's submissions each team has
  // completed. Which columns exist varies by day — the tariff stops after
  // Día 2, Día 3's portfolio rebalance is optional (see TAB_NOTES), and the
  // sector recommendation only exists on Día 4. Día 1 builds its own version
  // of this table inline: its portfolio is the mín-var exercise, read from a
  // different map.
  type UploadCell = { text: string; state: "done" | "partial" | "none" };
  const uploadColumns: { label: string; cell: (team: (typeof teams)[number]) => UploadCell }[] = [];
  if (day <= 2) {
    uploadColumns.push({
      label: "Tarifa",
      cell: (t) => (t.tariffSubmissions[0]?.meanPremium != null ? { text: "✓", state: "done" } : { text: "—", state: "none" }),
    });
  }
  if (day <= 3) {
    uploadColumns.push({
      label: day === 3 ? "Portafolio (opc.)" : "Portafolio",
      cell: (t) => (t.portfolioAllocations[0] != null ? { text: "✓", state: "done" } : { text: "—", state: "none" }),
    });
  }
  if (reportConcepts.length > 0) {
    uploadColumns.push({
      label: "Reportes",
      cell: (t) => {
        const values = deliverablesByTeamId.get(t.id) ?? {};
        const done = reportConcepts.filter((c) => values[c.id] != null).length;
        if (done === reportConcepts.length) return { text: "✓", state: "done" };
        return { text: `${done}/${reportConcepts.length}`, state: done > 0 ? "partial" : "none" };
      },
    });
  }
  if (hasAnalitica) {
    uploadColumns.push({
      label: "Analítica",
      cell: (t) => {
        const picks = picksByTeamId.get(t.id);
        const all = [...(picks?.crecer ?? []), ...(picks?.disminuir ?? [])];
        // groupSectorPicksByTeam() always returns both lists padded to their
        // full length, so `all.length` is the expected total whenever the
        // team has submitted anything at all.
        const total = all.length > 0 ? all.length : 6;
        const done = all.filter((p) => p != null).length;
        if (done === total) return { text: "✓", state: "done" };
        return { text: `${done}/${total}`, state: done > 0 ? "partial" : "none" };
      },
    });
  }
  const uploadCellClass = (state: UploadCell["state"]) =>
    state === "done"
      ? "text-[var(--color-brand-green)]"
      : state === "partial"
        ? "text-[var(--color-brand-yellow)]"
        : "text-[var(--color-brand-text-secondary)]";

  // Per-team rows for ReportesTeamDetail, grouped into the statement blocks
  // (Estado de resultados / Balance, por año) the concepts themselves
  // declare — shared by every day that has "reporte" concepts (Días 2-4).
  const reportesTeamOptions =
    activeTab === "resultados" && reportConcepts.length > 0
      ? teams.map((team) => {
          const values = deliverablesByTeamId.get(team.id) ?? {};
          const bench = finBenchByTeamId.get(team.id) ?? null;
          const ownValues = ownValuesByTeamId.get(team.id) ?? new Map<string, number>();
          const rows = reportConcepts.map((c) => {
            const result = scoreConcepto(c.id, values[c.id] ?? null, bench, tolerance, ownValues);
            return { id: c.id, label: c.label, unit: c.unit, val: result?.val ?? null, bench: result?.bench ?? null, score: result?.score ?? null, group: c.group };
          });
          const scored = rows.filter((r) => r.score != null);
          const avgScore = scored.length > 0 ? scored.reduce((s, r) => s + r.score!, 0) / scored.length : null;

          const groupOrder: ConceptGroup[] = [];
          const rowsByGroup = new Map<ConceptGroup, typeof rows>();
          const ungrouped: typeof rows = [];
          for (const row of rows) {
            if (row.group) {
              if (!rowsByGroup.has(row.group)) {
                rowsByGroup.set(row.group, []);
                groupOrder.push(row.group);
              }
              rowsByGroup.get(row.group)!.push(row);
            } else {
              ungrouped.push(row);
            }
          }

          return {
            id: team.id,
            name: team.name,
            color: team.color,
            avgScore,
            groups: groupOrder.map((group) => ({ group, rows: rowsByGroup.get(group)! })),
            ungrouped,
          };
        })
      : [];

  // Per-team rows for SectoresTeamDetail (Día 4) — each pick resolved
  // against the one true global ranking here, server-side, so the client
  // component only formats what it's handed.
  const sectoresTeamOptions =
    activeTab === "resultados" && hasAnalitica
      ? teams.map((team) => {
          const picks = picksByTeamId.get(team.id);
          const resolve = (listKey: "crecer" | "disminuir") => {
            const trueRanking = listKey === "crecer" ? trueCrecer : trueDisminuir;
            const listPicks = picks?.[listKey] ?? [null, null, null];
            return listPicks.map((pick) => {
              if (!pick) return { label: null, truePosition: null, trueMultiplier: null, estimatedMultiplier: null };
              const trueIdx = trueRanking.findIndex((s) => sectorKey(s) === sectorKey(pick));
              return {
                label: sectorLabel(pick),
                truePosition: trueIdx === -1 ? null : trueIdx + 1,
                trueMultiplier: trueIdx === -1 ? null : trueRanking[trueIdx].multiplier,
                estimatedMultiplier: pick.estimatedMultiplier,
              };
            });
          };
          return {
            id: team.id,
            name: team.name,
            color: team.color,
            score: analiticaScoreByTeamId.get(team.id) ?? null,
            crecer: resolve("crecer"),
            disminuir: resolve("disminuir"),
          };
        })
      : [];

  return (
    <main className={`mx-auto flex w-full flex-1 flex-col gap-4 p-8 ${activeTab === "subj" ? "max-w-7xl" : "max-w-6xl"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-condensed)] text-2xl font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
            Día {day} — {DAY_TITLES[day]}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">{DAY_DESCRIPTIONS[day]}</p>
          <p className="mt-1 text-sm text-[var(--color-brand-text-secondary)]">
            {submittedCount} de {teams.length} equipos han subido su tarifa completa.
          </p>
        </div>
        <Link
          href={`/admin/day/${day}/guia`}
          className="shrink-0 rounded-full px-3 py-2 font-[family-name:var(--font-condensed)] text-xs font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)] bg-[var(--color-brand-blue-accent)]/12 shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 active:translate-y-0 hover:bg-[var(--color-brand-blue-accent)]/20 hover:shadow-[var(--shadow-md)]"
        >
          📄 Guía del pasante
        </Link>
      </div>

      <DayTabBar basePath="/admin/day" day={day} activeTab={activeTab} />

      {activeTab === "resultados" && day === 1 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] p-4">
            <h3 className="mb-3 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              Estado de cargues — Día {day}
            </h3>
            <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
              {[teams.slice(0, Math.ceil(teams.length / 2)), teams.slice(Math.ceil(teams.length / 2))].map((group, gi) => (
                <table key={gi} className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                      <th className="py-1">Equipo</th>
                      <th className="py-1 text-center">Tarifa</th>
                      <th className="py-1 text-center">Portafolio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((team) => {
                      const tariffDone = team.tariffSubmissions[0]?.meanPremium != null;
                      const portfolioDone = minVarWeightsByTeamId.has(team.id);
                      return (
                        <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                          <td className="py-1">
                            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                            {team.name}
                          </td>
                          <td className={`py-1 text-center ${tariffDone ? "text-[var(--color-brand-green)]" : "text-[var(--color-brand-text-secondary)]"}`}>
                            {tariffDone ? "✓" : "—"}
                          </td>
                          <td className={`py-1 text-center ${portfolioDone ? "text-[var(--color-brand-green)]" : "text-[var(--color-brand-text-secondary)]"}`}>
                            {portfolioDone ? "✓" : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)]">
            <div className="p-4 pb-0">
              <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                Resultados por equipo — Día {day}
              </h3>
              <p className="mt-1 text-[15px] italic text-[var(--color-brand-text-secondary)]">
                Cifras en millones de pesos · ordenado de mejor a peor nota.
              </p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                  <th className="px-4 py-2">Equipo</th>
                  <th className="px-4 py-2">Market</th>
                  <th className="px-4 py-2"># pólizas</th>
                  <th className="px-4 py-2">Limite</th>
                  <th className="px-4 py-2">Tarifa mediana</th>
                  <th className="px-4 py-2">Cobro mediano</th>
                  <th className="px-4 py-2">Loss ratio</th>
                  <th className="px-4 py-2">RT</th>
                  <th className="px-4 py-2">Nota</th>
                </tr>
              </thead>
              <tbody>
                {teamsByActScoreDesc.map((team) => {
                  const result = resultByTeamId.get(team.id);
                  const bench = finBenchByTeamId.get(team.id)?.p1;
                  const lossRatio = bench && bench.primaDevengada > 0 ? bench.costo / bench.primaDevengada : null;
                  const marketShare = result && totalInsuredThisYear > 0 ? result.insuredCount / totalInsuredThisYear : null;
                  const capExtra = result?.extra as { capacityLimit?: number; medianWonPremium?: number | null } | null;
                  const actScore = actuarialScoreByTeamId.get(team.id);
                  const medianTariff = team.tariffSubmissions[0]?.medianPremium;
                  return (
                    <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                      <td className="px-4 py-2">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                        {team.name}
                      </td>
                      <td className="px-4 py-2">{marketShare != null ? `${(marketShare * 100).toFixed(0)}%` : "—"}</td>
                      <td className="px-4 py-2">{result ? result.insuredCount.toLocaleString("es-CO") : "—"}</td>
                      <td className="px-4 py-2">{capExtra?.capacityLimit != null ? capExtra.capacityLimit.toLocaleString("es-CO") : "—"}</td>
                      <td className="px-4 py-2">{fmtCop(medianTariff)}</td>
                      <td className="px-4 py-2">{fmtCop(capExtra?.medianWonPremium)}</td>
                      <td className="px-4 py-2">{lossRatio != null ? `${(lossRatio * 100).toFixed(0)}%` : "—"}</td>
                      <td className="px-4 py-2">{bench ? fmtM(bench.rt) : "—"}</td>
                      <td className="px-4 py-2 font-semibold text-[var(--color-brand-blue-accent)]">{actScore != null ? actScore.toFixed(0) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Dia1TeamDetail
            teams={teams.map((t) => ({
              id: t.id,
              name: t.name,
              color: t.color,
              pnl: finBenchByTeamId.get(t.id)?.p1 ?? null,
              weights: minVarWeightsByTeamId.get(t.id) ?? null,
            }))}
            referenceWeights={minVarReferenceWeights}
          />

          <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] p-5">
            <h3 className="mb-2 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              Portafolio de mínima varianza — Día {day}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                    <th className="py-1 pr-4">Equipo</th>
                    <th className="py-1 pr-4">Retorno logrado</th>
                    <th className="py-1 pr-4">Varianza lograda</th>
                    <th className="py-1 pr-4">Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {teamsByMinVarScoreDesc.map((team) => {
                    const weights = minVarWeightsByTeamId.get(team.id);
                    const score = minVarScoreByTeamId.get(team.id);
                    return (
                      <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                        <td className="py-1 pr-4">
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                          {team.name}
                        </td>
                        <td className="py-1 pr-4">{weights ? `${(portfolioExpectedReturn(weights) * 100).toFixed(2)}%` : "—"}</td>
                        <td className="py-1 pr-4">{weights ? portfolioVariance(weights).toFixed(6) : "—"}</td>
                        <td className="py-1 pr-4">{score != null ? score.toFixed(0) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "resultados" && day >= 2 && uploadColumns.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] p-4">
          <h3 className="mb-3 font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
            Estado de cargues — Día {day}
          </h3>
          <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
            {[teams.slice(0, Math.ceil(teams.length / 2)), teams.slice(Math.ceil(teams.length / 2))].map((group, gi) => (
              <table key={gi} className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                    <th className="py-1">Equipo</th>
                    {uploadColumns.map((col) => (
                      <th key={col.label} className="py-1 text-center">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.map((team) => (
                    <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                      <td className="py-1">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                        {team.name}
                      </td>
                      {uploadColumns.map((col) => {
                        const { text, state } = col.cell(team);
                        return (
                          <td key={col.label} className={`py-1 text-center ${uploadCellClass(state)}`}>
                            {text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </div>
      )}

      {activeTab === "resultados" && day === 2 && (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)]">
          <div className="p-4 pb-0">
            <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              Resultados por equipo — Día {day}
            </h3>
            <p className="mt-1 text-[15px] italic text-[var(--color-brand-text-secondary)]">
              Cifras en millones de pesos · ordenado de mejor a peor nota.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                <th className="px-4 py-2">Equipo</th>
                <th className="px-4 py-2">Market</th>
                <th className="px-4 py-2"># pólizas</th>
                <th className="px-4 py-2">Limite</th>
                <th className="px-4 py-2">Tarifa mediana</th>
                <th className="px-4 py-2">Cobro mediano</th>
                <th className="px-4 py-2">Loss ratio</th>
                <th className="px-4 py-2">RT</th>
                <th className="px-4 py-2">Nota</th>
              </tr>
            </thead>
            <tbody>
              {teamsByActScoreDesc.map((team) => {
                const result = resultByTeamId.get(team.id);
                const bench = finBenchByTeamId.get(team.id)?.p2;
                const lossRatio = bench && bench.primaDevengada > 0 ? bench.costo / bench.primaDevengada : null;
                const marketShare = result && totalInsuredThisYear > 0 ? result.insuredCount / totalInsuredThisYear : null;
                const capExtra = result?.extra as { capacityLimit?: number; medianWonPremium?: number | null } | null;
                const actScore = actuarialScoreByTeamId.get(team.id);
                const medianTariff = team.tariffSubmissions[0]?.medianPremium;
                return (
                  <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                    <td className="px-4 py-2">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                      {team.name}
                    </td>
                    <td className="px-4 py-2">{marketShare != null ? `${(marketShare * 100).toFixed(0)}%` : "—"}</td>
                    <td className="px-4 py-2">{result ? result.insuredCount.toLocaleString("es-CO") : "—"}</td>
                    <td className="px-4 py-2">{capExtra?.capacityLimit != null ? capExtra.capacityLimit.toLocaleString("es-CO") : "—"}</td>
                    <td className="px-4 py-2">{fmtCop(medianTariff)}</td>
                    <td className="px-4 py-2">{fmtCop(capExtra?.medianWonPremium)}</td>
                    <td className="px-4 py-2">{lossRatio != null ? `${(lossRatio * 100).toFixed(0)}%` : "—"}</td>
                    <td className="px-4 py-2">{bench ? fmtM(bench.rt) : "—"}</td>
                    <td className="px-4 py-2 font-semibold text-[var(--color-brand-blue-accent)]">{actScore != null ? actScore.toFixed(0) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "resultados" && day === 2 && (
        <Dia2TeamDetail
          teams={teams.map((t) => {
            const rawAllocation = t.portfolioAllocations[0]?.allocation;
            const decision = isPortfolioDecisionV4(rawAllocation) ? rawAllocation : undefined;
            return {
              id: t.id,
              name: t.name,
              color: t.color,
              pnl: finBenchByTeamId.get(t.id)?.p2 ?? null,
              weights: decision?.schedule[0]?.allocation ?? null,
            };
          })}
        />
      )}

      {activeTab === "resultados" && reportesTeamOptions.length > 0 && <ReportesTeamDetail day={day} teams={reportesTeamOptions} />}

      {activeTab === "resultados" && day === 2 && hasPortfolioSchedule && (
        <Dia2AlmTeamDetail
          teams={teams.map((team) => {
            const almScore = almScoreByTeamId.get(team.id) ?? null;
            const ladder = almLadderByTeamId.get(team.id);
            const bundle = finBenchBundlesByTeamId.get(team.id);
            const rawAllocation = team.portfolioAllocations[0]?.allocation;
            const decision = isPortfolioDecisionV4(rawAllocation) ? rawAllocation : undefined;
            return {
              id: team.id,
              name: team.name,
              color: team.color,
              almScore,
              ladderRows: ladder?.rows ?? null,
              schedule: decision?.schedule ?? null,
              realAlmYear: bundle?.realAlmYear1,
            };
          })}
        />
      )}

      {activeTab === "resultados" && hasAnalitica && (
            <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)]">
              <div className="p-4 pb-0">
                <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                  Sectores reales — Día {day}
                </h3>
                <p className="mt-1 text-[15px] italic text-[var(--color-brand-text-secondary)]">
                  Multiplicador = pérdida agregada del sector ÷ pérdida agregada de <strong>todo el universo</strong> (base = 1.0×; por encima es más
                  riesgoso que el promedio del mercado, por debajo menos). Pérdida agregada combina frecuencia y severidad: es la mediana de severidad
                  de los siniestros del sector, ponderada por qué fracción de sus expuestos efectivamente reclamó. Se usa la <strong>mediana</strong>{" "}
                  (no el promedio) porque el universo incluye siniestros atípicamente altos (outliers) que distorsionarían un promedio simple —
                  detalle completo en el README, deliberadamente no explicado a los equipos. Solo se listan sectores con al menos{" "}
                  {SECTOR_MIN_COUNT.toLocaleString("es-CO")} expuestos en el universo completo — es la misma verdad global contra la que se califica a
                  todos los equipos, no la cartera propia de ninguno.
                </p>
                <p className="mt-1 text-[15px] italic text-[var(--color-brand-text-secondary)]">
                  <strong>Nota solo para administradores</strong> (no mencionar a los equipos): los cruces que involucran &quot;historial de
                  siniestros&quot; (hist) se excluyen deliberadamente de estos rankings reales. Es una variable trampa: sigue disponible para que un
                  equipo la elija en su recomendación, pero un conteo de siniestros pasados por póliza no define un sector de mercado, así que
                  cualquier equipo que la priorice debería perder puntos frente a quienes reconocieron que no aporta y buscaron cruces entre las
                  demás variables.
                </p>
                <p className="mt-1 text-[15px] italic text-[var(--color-brand-text-secondary)]">
                  Cada posición nombrada vale por dos cosas, 50/50: acertar la posición en el ranking real, y estimar el multiplicador de ese sector
                  dentro de la misma banda de tolerancia que el resto de entregables numéricos — nombrar el sector sin estimar su multiplicador (o
                  nombrar uno que no aparece en el ranking real) da 0 en esa mitad.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                    Top 10 para crecer (menor riesgo relativo)
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                        <th className="py-1 pr-2">#</th>
                        <th className="py-1 pr-2">Sector</th>
                        <th className="py-1 pr-2">Multiplicador</th>
                        <th className="py-1">Expuestos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trueCrecer.slice(0, 10).map((s, i) => (
                        <tr key={sectorKey(s)} className="border-t border-[var(--color-brand-gray-light)]">
                          <td className="py-1 pr-2">{i + 1}</td>
                          <td className="py-1 pr-2">{sectorLabel(s)}</td>
                          <td className="py-1 pr-2">{s.multiplier.toFixed(2)}×</td>
                          <td className="py-1">{s.count.toLocaleString("es-CO")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                    Top 10 para disminuir (mayor riesgo relativo)
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                        <th className="py-1 pr-2">#</th>
                        <th className="py-1 pr-2">Sector</th>
                        <th className="py-1 pr-2">Multiplicador</th>
                        <th className="py-1">Expuestos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trueDisminuir.slice(0, 10).map((s, i) => (
                        <tr key={sectorKey(s)} className="border-t border-[var(--color-brand-gray-light)]">
                          <td className="py-1 pr-2">{i + 1}</td>
                          <td className="py-1 pr-2">{sectorLabel(s)}</td>
                          <td className="py-1 pr-2">{s.multiplier.toFixed(2)}×</td>
                          <td className="py-1">{s.count.toLocaleString("es-CO")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

      {activeTab === "resultados" && sectoresTeamOptions.length > 0 && <SectoresTeamDetail day={day} teams={sectoresTeamOptions} />}

      {/* Financiero (finBench): en Día 2 acompaña al desglose de la nota en "Top del día"; en Días 3-4 cierra la pestaña "Resultados", debajo de los entregables que alimenta. */}
      {((activeTab === "top" && day === 2) || (activeTab === "resultados" && day >= 3)) && finBenchByTeamId.size > 0 && (
            <div className="overflow-x-auto rounded-b-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-cyan)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)]">
              <div className="p-4 pb-0">
                <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                  Financiero (finBench) — 2027 / 2028
                </h3>
                <p className="mt-1 text-[15px] italic text-[var(--color-brand-text-secondary)]">
                  Cifras en millones de pesos · Riesgo mercado suma tasa, inflación y acciones.
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                    <th className="px-4 py-2">Equipo</th>
                    <th className="px-4 py-2">Reservas 2027</th>
                    <th className="px-4 py-2">U. neta 2027</th>
                    <th className="px-4 py-2">U. neta 2028</th>
                    <th className="px-4 py-2">Riesgo mercado</th>
                    <th className="px-4 py-2">Capital (RK)</th>
                    <th className="px-4 py-2">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => {
                    const bench = finBenchByTeamId.get(team.id);
                    if (!bench) return null;
                    return (
                      <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                        <td className="px-4 py-2">
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                          {team.name}
                        </td>
                        <td className="px-4 py-2">{fmtM(bench.resTotal)}</td>
                        <td className="px-4 py-2">{fmtM(bench.p1.uneta)}</td>
                        <td className="px-4 py-2">{fmtM(bench.p2?.uneta)}</td>
                        <td className="px-4 py-2">{fmtM(bench.solRMercado)}</td>
                        <td className="px-4 py-2">{fmtM(bench.solRk)}</td>
                        <td className="px-4 py-2">{bench.solMargen.toFixed(2)}×</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
      )}

      {activeTab === "resultados" && day >= 3 && finBenchByTeamId.size > 0 && (
            <div className="overflow-x-auto rounded-b-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] border-t-4 border-t-[var(--color-brand-cyan)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)]">
              <div className="p-4 pb-0">
                <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                  Balance y proyección 2029
                </h3>
                <p className="mt-1 text-[15px] italic text-[var(--color-brand-text-secondary)]">
                  Cifras en millones de pesos · activos y patrimonio son saldos a cierre de año · el dividendo es el sugerido por el motor.
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                    <th className="px-4 py-2">Equipo</th>
                    <th className="px-4 py-2">Activos 2027</th>
                    <th className="px-4 py-2">Activos 2028</th>
                    <th className="px-4 py-2">Patrimonio 2028</th>
                    <th className="px-4 py-2">U. neta 2029 (proy.)</th>
                    <th className="px-4 py-2">Dividendo</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => {
                    const bench = finBenchByTeamId.get(team.id);
                    if (!bench) return null;
                    return (
                      <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                        <td className="px-4 py-2">
                          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                          {team.name}
                        </td>
                        <td className="px-4 py-2">{fmtM(bench.bal1.activos)}</td>
                        <td className="px-4 py-2">{fmtM(bench.bal2?.activos)}</td>
                        <td className="px-4 py-2">{fmtM(bench.bal2?.patrimonio)}</td>
                        <td className="px-4 py-2">{fmtM(bench.p3?.uneta)}</td>
                        <td className="px-4 py-2">{fmtM(bench.div)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
      )}

      {activeTab === "subj" && (
        <div className="flex flex-col gap-6">
          {day === 1 ? (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] p-5 text-sm text-[var(--color-brand-text-secondary)]">
              El Día 1 no tiene calificación subjetiva — todavía no ha habido suficiente contacto con los equipos para evaluar a cada integrante. Empieza en el Día 2.
            </div>
          ) : teams.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] p-5 text-sm text-[var(--color-brand-text-secondary)]">
              Este cohorte todavía no tiene equipos.
            </div>
          ) : (
            <>
              {selectedSubjTeam && (
                <TeamSelect teams={teamOptions} selectedTeamId={selectedSubjTeam.id} basePath={`/admin/day/${day}`} extraParams={{ tab: "subj" }} />
              )}

              {selectedSubjTeam &&
                (() => {
                  const team = selectedSubjTeam;
                  return (
                    <div className="rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)] p-8">
                      <h3 className="mb-6 font-[family-name:var(--font-condensed)] text-lg font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                        {team.name}
                      </h3>

                      {team.members.length === 0 ? (
                        <p className="text-sm text-[var(--color-brand-text-secondary)]">
                          Este equipo no tiene integrantes cargados. La calificación subjetiva es por integrante — sube el{" "}
                          <a href="/admin/config" className="text-[var(--color-brand-blue-accent)] underline">
                            roster
                          </a>{" "}
                          primero.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-8">
                          {team.members.map((member) => {
                            const ev = evaluationByMemberId.get(member.id);
                            const priorDays = Array.from({ length: day - 2 }, (_, i) => i + 2); // [2..day-1]
                            const hasHistorial = priorDays.some(
                              (d) => historicalEvaluationsByMemberDay.has(`${member.id}:${d}`) || historicalCommentsByMemberDay.has(`${member.id}:${d}`)
                            );
                            const interviewRatings = interviewRatingsByMemberId.get(member.id);
                            const interviewMemberComments = interviewCommentsByMemberId.get(member.id) ?? [];
                            const hasInterview = (interviewRatings && Object.keys(interviewRatings).length > 0) || interviewMemberComments.length > 0;
                            const softSkillMemberComments = softSkillCommentsByMemberId.get(member.id) ?? [];
                            return (
                              <div key={member.id} className="rounded-lg border border-[var(--color-brand-gray-light)] p-6">
                                <div className="flex flex-col gap-6 lg:flex-row">
                                  <div className="flex shrink-0 flex-col items-center gap-3 lg:w-48">
                                    <MemberPhoto dataUri={photoByMemberId.get(member.id) ?? null} name={member.name} size={128} />
                                    <p className="text-center text-base font-semibold text-[var(--color-foreground)]">{member.name}</p>
                                    <AptitudesRiesgosToggle teamMemberId={member.id} day={day} active={ev?.aptitudesRiesgos ?? false} />
                                    <DeleteMemberButton teamMemberId={member.id} memberName={member.name} day={day} />
                                  </div>

                                  <div className="grid min-w-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
                                    <div className="flex min-w-0 flex-col gap-4">
                                      <div>
                                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                                          Habilidades blandas
                                        </p>
                                        <SoftSkillsRadarChart scores={softSkillsByMemberId.get(member.id) ?? {}} size={440} />
                                      </div>

                                      <div className="rounded-[var(--radius-sm)] border border-[var(--color-brand-gray-light)] p-4">
                                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                                          Comentarios de habilidades blandas
                                        </p>
                                        {softSkillMemberComments.length > 0 ? (
                                          <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1">
                                            {softSkillMemberComments.map((c) => (
                                              <div key={c.id} className="rounded bg-[var(--color-brand-blue-light)] px-2 py-1.5">
                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                                                  {ACTIVITY_TITLES[c.activity] ?? `Actividad ${c.activity}`}
                                                </p>
                                                <p className="mt-0.5 break-words text-xs text-[var(--color-foreground)]">&ldquo;{c.text}&rdquo;</p>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <p className="text-xs text-[var(--color-brand-text-secondary)]">Sin comentarios registrados todavía.</p>
                                        )}
                                        <Link href="/admin/actividad/1" className="mt-1.5 inline-block text-xs text-[var(--color-brand-blue-accent)] underline">
                                          Editar en Habilidades blandas →
                                        </Link>
                                      </div>
                                    </div>

                                    <div className="flex min-w-0 flex-col gap-4">
                                      <div className="rounded-[var(--radius-sm)] border border-[var(--color-brand-gray-light)] p-4">
                                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                                          Entrevista TH
                                        </p>
                                        {hasInterview ? (
                                          <>
                                            <p className="text-xs text-[var(--color-foreground)]">
                                              {INTERVIEW_SKILLS.map((skill) => {
                                                const rating = interviewRatings?.[skill];
                                                return `${INTERVIEW_SKILL_LABELS[skill]}: ${rating ? `${rating}/5` : "Sin definir"}`;
                                              }).join(" · ")}
                                            </p>
                                            {interviewMemberComments.length > 0 && (
                                              <div className="mt-1.5 flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1">
                                                {interviewMemberComments.map((c) => (
                                                  <div key={c.id} className="rounded bg-[var(--color-brand-blue-light)] px-2 py-1.5">
                                                    <p className="break-words text-xs text-[var(--color-foreground)]">&ldquo;{c.text}&rdquo;</p>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </>
                                        ) : (
                                          <p className="text-xs text-[var(--color-brand-text-secondary)]">Sin entrevista registrada todavía.</p>
                                        )}
                                        <Link href="/admin/entrevista" className="mt-1.5 inline-block text-xs text-[var(--color-brand-blue-accent)] underline">
                                          Editar en Entrevista individual →
                                        </Link>
                                      </div>

                                      {hasHistorial && (
                                        <details className="rounded-[var(--radius-sm)] border border-[var(--color-brand-gray-light)]">
                                          <summary className="cursor-pointer px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
                                            Historial (Días anteriores)
                                          </summary>
                                          <div className="flex flex-col gap-2 border-t border-[var(--color-brand-gray-light)] p-4">
                                            {priorDays.map((d) => {
                                              const priorEv = historicalEvaluationsByMemberDay.get(`${member.id}:${d}`);
                                              const priorComments = historicalCommentsByMemberDay.get(`${member.id}:${d}`) ?? [];
                                              if (!priorEv && priorComments.length === 0) return null;
                                              return (
                                                <div key={d} className="text-sm">
                                                  <p className="font-semibold text-[var(--color-brand-text-secondary)]">Día {d}</p>
                                                  <p className="text-xs text-[var(--color-foreground)]">
                                                    Nota: {priorEv?.notaGeneral ?? "—"} · Aprobó: {priorEv?.aprobado == null ? "—" : priorEv.aprobado ? "Sí" : "No"} · Perfil:{" "}
                                                    {priorEv?.perfil ?? "—"}
                                                  </p>
                                                  {priorComments.map((c) => (
                                                    <p key={c.id} className="text-xs text-[var(--color-brand-text-secondary)]">
                                                      &ldquo;{c.text}&rdquo; — {c.author}
                                                    </p>
                                                  ))}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </details>
                                      )}
                                    </div>

                                    <div className="flex min-w-0 flex-col gap-4">
                                      <MemberEvaluationForm
                                        // Keyed by the saved values so a successful save
                                        // remounts the (uncontrolled) form instead of
                                        // leaving its <select>s at whatever the native
                                        // post-action form reset left them at — without
                                        // this they visually snap to "Sin definir" even
                                        // though the save succeeded.
                                        key={`${member.id}:${ev?.notaGeneral ?? ""}:${ev?.aprobado ?? ""}:${ev?.perfil ?? ""}`}
                                        id={member.id}
                                        day={day}
                                        initial={{
                                          notaGeneral: ev?.notaGeneral ?? null,
                                          aprobado: ev?.aprobado ?? null,
                                          perfil: ev?.perfil ?? null,
                                        }}
                                      />
                                      <MemberComments teamMemberId={member.id} day={day} comments={commentsByMemberId.get(member.id) ?? []} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
            </>
          )}
        </div>
      )}

      {activeTab === "top" && day === 1 && (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-brand-blue)] text-left text-white">
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">#</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Nota tarifas</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Nota mín var</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Nota objetiva</th>
              </tr>
            </thead>
            <tbody>
              {(consolidadoRows ?? [])
                .map((r) => ({ r, nota: r.perDay[day - 1]?.nota ?? -Infinity }))
                .sort((a, b) => b.nota - a.nota)
                .map(({ r }, i) => {
                  const d = r.perDay[day - 1];
                  const actScore = actuarialScoreByTeamId.get(r.teamId);
                  const finScore = minVarScoreByTeamId.get(r.teamId);
                  return (
                    <tr key={r.teamId} className="border-t border-[var(--color-brand-gray-light)]">
                      <td className="px-4 py-2">{i + 1}</td>
                      <td className="px-4 py-2">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                        {r.teamName}
                      </td>
                      <td className="px-4 py-2">{actScore != null ? actScore.toFixed(1) : "—"}</td>
                      <td className="px-4 py-2">{finScore != null ? finScore.toFixed(1) : "—"}</td>
                      <td className="px-4 py-2 font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue-accent)]">
                        {d?.objective != null ? d.objective.toFixed(1) : "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "top" && day !== 1 && (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-brand-blue)] text-left text-white">
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">#</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Equipo</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Objetivo</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Subjetivo</th>
                <th className="px-4 py-2 font-[family-name:var(--font-condensed)] text-xs uppercase tracking-wide">Nota del día</th>
              </tr>
            </thead>
            <tbody>
              {(consolidadoRows ?? [])
                .map((r) => ({ r, nota: r.perDay[day - 1]?.nota ?? -Infinity }))
                .sort((a, b) => b.nota - a.nota)
                .map(({ r }, i) => {
                  const d = r.perDay[day - 1];
                  return (
                    <tr key={r.teamId} className="border-t border-[var(--color-brand-gray-light)]">
                      <td className="px-4 py-2">{i + 1}</td>
                      <td className="px-4 py-2">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                        {r.teamName}
                      </td>
                      <td className="px-4 py-2">{d?.objective != null ? d.objective.toFixed(1) : "—"}</td>
                      <td className="px-4 py-2">{d?.subjective != null ? d.subjective.toFixed(1) : "—"}</td>
                      <td className="px-4 py-2 font-[family-name:var(--font-condensed)] font-bold text-[var(--color-brand-blue-accent)]">
                        {d?.nota != null ? d.nota.toFixed(1) : "—"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "top" && day === 2 && (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)]">
          <div className="p-4 pb-0">
            <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              Componentes de la nota objetiva — Día {day}
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                <th className="px-4 py-2">Equipo</th>
                <th className="px-4 py-2">RT</th>
                <th className="px-4 py-2">Tarifas</th>
                <th className="px-4 py-2">Nota financiera</th>
                <th className="px-4 py-2">Nota objetiva</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                const result = resultByTeamId.get(team.id);
                // Día 2's RT releases Año 1's own RPND holdback as revenue — see composite.ts's computeRt().
                const rpndLiberada = FZ.rpndPct * (finBenchByTeamId.get(team.id)?.p1.primaEmitida ?? 0);
                const rt = result
                  ? computeRt({
                      ...result,
                      rpndLiberada,
                      acquisitionFeePct: outsourcedThisDay.has(team.id) ? OUTSOURCED_CONSULTING_FEE_PCT : 0,
                    })
                  : null;
                const actuarialScore = actuarialScoreByTeamId.get(team.id);
                const finScore = finReportScoreByTeamId.get(team.id);
                const objective = objectiveByTeamId.get(team.id);
                return (
                  <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                    <td className="px-4 py-2">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                      {team.name}
                    </td>
                    <td className="px-4 py-2">{rt != null ? `$${Math.round(rt).toLocaleString("es-CO")}` : "—"}</td>
                    <td className="px-4 py-2">{actuarialScore != null ? actuarialScore.toFixed(1) : "—"}</td>
                    <td className="px-4 py-2">{finScore != null ? finScore.toFixed(1) : "—"}</td>
                    <td className="px-4 py-2 font-semibold text-[var(--color-brand-blue-accent)]">{objective != null ? objective.toFixed(1) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="p-4 pt-2 text-[15px] italic text-[var(--color-brand-text-secondary)]">
            &ldquo;Nota financiera&rdquo; es el promedio de las 13 líneas del estado de resultados del 2027 reportadas (pestaña Resultados) —{" "}
            <strong>pero no es el componente financiero completo de la nota objetiva</strong>: ese promedia esta columna junto con la Nota ALM (ver la
            sección &ldquo;ALM — calce del portafolio vs. reservas&rdquo; más abajo). La columna &ldquo;Tarifas&rdquo; sí es solo la tarifa: Día 2 no
            tiene ningún reporte actuarial aparte — las reservas técnicas de 2027 se reportan hasta Día 3, como línea del Balance.
          </p>
        </div>
      )}

      {/* Mismo desglose que en Día 2, sin las columnas de mercado: Días 3-4 ya no corren simulación, así que sus dos componentes salen enteros de los entregables. */}
      {activeTab === "top" && day >= 3 && (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--color-brand-gray-light)] bg-[var(--color-brand-surface)] shadow-[var(--shadow-sm)]">
          <div className="p-4 pb-0">
            <h3 className="font-[family-name:var(--font-condensed)] text-sm font-bold uppercase tracking-wide text-[var(--color-brand-blue-accent)]">
              Componentes de la nota objetiva — Día {day}
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--color-brand-text-secondary)]">
                <th className="px-4 py-2">Equipo</th>
                <th className="px-4 py-2">Nota actuarial</th>
                <th className="px-4 py-2">Nota financiera</th>
                <th className="px-4 py-2">Nota objetiva</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                const actScore = actReportScoreByTeamId.get(team.id);
                const finScore = finReportScoreByTeamId.get(team.id);
                const objective = objectiveByTeamId.get(team.id);
                return (
                  <tr key={team.id} className="border-t border-[var(--color-brand-gray-light)]">
                    <td className="px-4 py-2">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: team.color }} />
                      {team.name}
                    </td>
                    <td className="px-4 py-2">{actScore != null ? actScore.toFixed(1) : "—"}</td>
                    <td className="px-4 py-2">{finScore != null ? finScore.toFixed(1) : "—"}</td>
                    <td className="px-4 py-2 font-semibold text-[var(--color-brand-blue-accent)]">{objective != null ? objective.toFixed(1) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="p-4 pt-2 text-[15px] italic text-[var(--color-brand-text-secondary)]">
            {day === 3
              ? "Nota actuarial: las líneas de Reservas técnicas del Balance. Nota financiera: el resto de los entregables del día — el estado de resultados del 2028, la proyección del 2029 y las demás líneas del Balance de los tres años."
              : "Nota actuarial: la analítica sectorial. Nota financiera: los entregables de solvencia — RK, fondos propios, margen, dividendos y los tres riesgos de mercado."}{" "}
            La nota objetiva pondera ambas columnas con el peso actuarial configurado en la rúbrica; el detalle línea por línea está en la pestaña
            Resultados.
          </p>
        </div>
      )}

    </main>
  );
}
