import { cumulativeKernelAt } from "./constants";

export interface Year1Claim {
  teamId: number;
  /** Month index of the notice date, counted from Jan of the base year (0 = Jan of Year 1). */
  noticeMonth: number;
  ultimate: number;
}

export interface Year2Claim {
  teamId: number;
  /** Month index of the notice date, same base as Year1Claim (Year-2 claims land in months 12-23+). */
  noticeMonth: number;
  ultimate: number;
}

export interface TeamDevelopment {
  reportedUltY1: number;
  lateUltY1: number;
  caseOsEndY1: number;
  paidY1inY1: number;
  paidY1inY2: number;
  osY1endY2: number;
  avY2N: number;
  avY2Ult: number;
  avY2OsEndY2: number;
  ibnrFutUlt: number;
  ultY2: number;
  paidY2inY2: number;
  osY2endY2: number;
  /** IBNR expected at Year-1 close, inferred from the market-wide reporting factor. */
  expectedIBNR: number;
  /** Best-estimate reserve booked at Year-1 close = case reserve (avisado) + expected IBNR. */
  bookedReserveEndY1: number;
  /** Year-1 development = actual late-emerging ultimate - expected IBNR. */
  development: number;
  /** Reserve at Year-2 close = Year-1 tail + Year-2 reserve. */
  reservaFinY2: number;
  /** Claims paid during calendar Year 2. */
  pagosY2: number;
  /** Year-1 claims' 3rd (final) development-year payment, landing within calendar Year 3 — exact, from real claim-level data (see DEV_FRAC's 3rd tranche). */
  devTailY1InY3: number;
  /** Year-2 claims' 2nd development-year payment, landing within calendar Year 3. */
  devTailY2InY3: number;
  /** What's left open on Year-1 claims after Year 3 closes — small but not always zero: DEV_FRAC's 3-year kernel needs a full 39 months from notice (LAG_AVISO_PAGO + 36) to fully resolve, so a claim noticed late in Year 1 still has a sliver open at month 35 (the same reason HORIZON=48 exists, see README §3). */
  osY1endY3: number;
  /** What's left open on Year-2 claims after their own 2nd development year (Year 3). */
  osY2endY3: number;
  /** Count of Year-2's own accident-year claims — needed to derive an average frequency/severity for projecting Year 3's own (not-yet-real) accident-year claims. */
  claimCountY2: number;
}

function emptyDevelopment(): TeamDevelopment {
  return {
    reportedUltY1: 0,
    lateUltY1: 0,
    caseOsEndY1: 0,
    paidY1inY1: 0,
    paidY1inY2: 0,
    osY1endY2: 0,
    avY2N: 0,
    avY2Ult: 0,
    avY2OsEndY2: 0,
    ibnrFutUlt: 0,
    ultY2: 0,
    paidY2inY2: 0,
    osY2endY2: 0,
    expectedIBNR: 0,
    bookedReserveEndY1: 0,
    development: 0,
    reservaFinY2: 0,
    pagosY2: 0,
    devTailY1InY3: 0,
    devTailY2InY3: 0,
    osY1endY3: 0,
    osY2endY3: 0,
    claimCountY2: 0,
  };
}

/**
 * Models the Year-1 -> Year-2 calendar-year runoff: which Year-1 claims were
 * reported within Year 1 (known at close) vs. reported in Year 2 (emerging
 * IBNR), and Year-2's own new-accident claims. Ported from precomputeDevel()
 * in the legacy prototype, line ~1590. The Year-2 P&L cost is "ultimate of
 * Year-2 accidents + development of Year-1 claims" (calendar-year incurred).
 */
export function computeDevelopment(
  year1Claims: Year1Claim[],
  year2Claims: Year2Claim[],
  teamIds: number[]
): { byTeam: Map<number, TeamDevelopment>; marketDevelopmentFactor: number } {
  const acc = new Map<number, TeamDevelopment>();
  const get = (teamId: number): TeamDevelopment => {
    let a = acc.get(teamId);
    if (!a) {
      a = emptyDevelopment();
      acc.set(teamId, a);
    }
    return a;
  };

  let totalReportedY1 = 0;
  let totalUltimate = 0;

  for (const claim of year1Claims) {
    const ultimate = claim.ultimate;
    if (ultimate <= 0) continue;
    const am = claim.noticeMonth;
    const a = get(claim.teamId);
    const paidEndY1 = ultimate * cumulativeKernelAt(11 - am);
    const paidEndY2 = ultimate * cumulativeKernelAt(23 - am);
    const paidEndY3 = ultimate * cumulativeKernelAt(35 - am);
    a.paidY1inY2 += paidEndY2 - paidEndY1;
    a.osY1endY2 += ultimate - paidEndY2;
    a.devTailY1InY3 += paidEndY3 - paidEndY2;
    a.osY1endY3 += ultimate - paidEndY3;
    totalUltimate += ultimate;

    if (am <= 11) {
      a.reportedUltY1 += ultimate;
      a.caseOsEndY1 += ultimate - paidEndY1;
      a.paidY1inY1 += paidEndY1;
      totalReportedY1 += ultimate;
    } else {
      a.lateUltY1 += ultimate;
      if (am <= 23) {
        a.avY2N++;
        a.avY2Ult += ultimate;
        a.avY2OsEndY2 += ultimate - paidEndY2;
      } else {
        a.ibnrFutUlt += ultimate;
      }
    }
  }

  for (const claim of year2Claims) {
    const ultimate = claim.ultimate;
    if (ultimate <= 0) continue;
    const am = claim.noticeMonth;
    const a = get(claim.teamId);
    const paidEndY2 = ultimate * cumulativeKernelAt(23 - am);
    const paidEndY3 = ultimate * cumulativeKernelAt(35 - am);
    a.ultY2 += ultimate;
    a.paidY2inY2 += paidEndY2;
    a.osY2endY2 += ultimate - paidEndY2;
    a.devTailY2InY3 += paidEndY3 - paidEndY2;
    a.osY2endY3 += ultimate - paidEndY3;
    a.claimCountY2 += 1;
  }

  const marketDevelopmentFactor = totalUltimate > 0 ? totalReportedY1 / totalUltimate : 1;
  const f = marketDevelopmentFactor;

  for (const teamId of teamIds) {
    const a = get(teamId);
    a.expectedIBNR = f > 0 ? (a.reportedUltY1 * (1 - f)) / f : 0;
    a.bookedReserveEndY1 = a.caseOsEndY1 + a.expectedIBNR;
    a.development = a.lateUltY1 - a.expectedIBNR;
    a.reservaFinY2 = a.osY1endY2 + a.osY2endY2;
    a.pagosY2 = a.paidY1inY2 + a.paidY2inY2;
  }

  return { byTeam: acc, marketDevelopmentFactor };
}
