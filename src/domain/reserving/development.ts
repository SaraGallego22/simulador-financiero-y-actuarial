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
  paidY1inY1: number;
  paidY1inY2: number;
  osY1endY2: number;
  ultY2: number;
  paidY2inY2: number;
  osY2endY2: number;
  /** Reserve at Year-2 close = Year-1 tail + Year-2 reserve. Always the true remaining unpaid ultimate (siniestralidad − pagos), never a market-wide estimate. */
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
    paidY1inY1: 0,
    paidY1inY2: 0,
    osY1endY2: 0,
    ultY2: 0,
    paidY2inY2: 0,
    osY2endY2: 0,
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
 * Models the Year-1 -> Year-2 calendar-year runoff of each team's own real
 * claims (true ultimate, true payment kernel timing — never a market-wide
 * IBNR proxy): how much of Year 1's claims are still unpaid once Year 2
 * closes, plus Year-2's own new-accident claims. Ported from
 * precomputeDevel() in the legacy prototype, line ~1590.
 */
export function computeDevelopment(year1Claims: Year1Claim[], year2Claims: Year2Claim[], teamIds: number[]): { byTeam: Map<number, TeamDevelopment> } {
  const acc = new Map<number, TeamDevelopment>();
  const get = (teamId: number): TeamDevelopment => {
    let a = acc.get(teamId);
    if (!a) {
      a = emptyDevelopment();
      acc.set(teamId, a);
    }
    return a;
  };

  for (const claim of year1Claims) {
    const ultimate = claim.ultimate;
    if (ultimate <= 0) continue;
    const am = claim.noticeMonth;
    const a = get(claim.teamId);
    const paidEndY1 = ultimate * cumulativeKernelAt(11 - am);
    const paidEndY2 = ultimate * cumulativeKernelAt(23 - am);
    const paidEndY3 = ultimate * cumulativeKernelAt(35 - am);
    a.paidY1inY1 += paidEndY1;
    a.paidY1inY2 += paidEndY2 - paidEndY1;
    a.osY1endY2 += ultimate - paidEndY2;
    a.devTailY1InY3 += paidEndY3 - paidEndY2;
    a.osY1endY3 += ultimate - paidEndY3;
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

  for (const teamId of teamIds) {
    const a = get(teamId);
    a.reservaFinY2 = a.osY1endY2 + a.osY2endY2;
    a.pagosY2 = a.paidY1inY2 + a.paidY2inY2;
  }

  return { byTeam: acc };
}
