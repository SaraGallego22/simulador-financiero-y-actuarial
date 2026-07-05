import { KERNEL, BUILD_MONTHS, HORIZON, VAL_MONTH } from "./constants";

export interface ClaimForLiability {
  teamId: number;
  /** Month index of the notice date, counted from Jan of the base year (0 = Jan). */
  noticeMonth: number;
  severity: number;
}

export interface LiabilitySchedule {
  /** L[t] = expected payment in month t since the valuation date. */
  L: number[];
  /** payY1[t] = expected payment in month t of Year 1 itself. */
  payY1: number[];
  reserva: number;
  hay: boolean;
}

/**
 * Builds each team's liability payment schedule in one pass over all claims —
 * ported from precomputeAllLiab()/computeLiab() in the legacy prototype, line
 * ~1532. Convolves each claim's ultimate severity with the monthly payment
 * kernel, splitting the result into "paid within Year 1" vs. "reserve payable
 * from the valuation date onward" (post Year-1 close).
 */
export function computeLiabilitySchedules(
  claims: ClaimForLiability[],
  teamIds: number[]
): Map<number, LiabilitySchedule> {
  const ultimateByTeamMonth = new Map<number, Map<number, number>>();
  for (const claim of claims) {
    if (claim.severity <= 0) continue;
    let byMonth = ultimateByTeamMonth.get(claim.teamId);
    if (!byMonth) {
      byMonth = new Map();
      ultimateByTeamMonth.set(claim.teamId, byMonth);
    }
    byMonth.set(claim.noticeMonth, (byMonth.get(claim.noticeMonth) ?? 0) + claim.severity);
  }

  const result = new Map<number, LiabilitySchedule>();
  for (const teamId of teamIds) {
    const byMonth = ultimateByTeamMonth.get(teamId);
    const L = new Array(HORIZON).fill(0);
    const payY1 = new Array(BUILD_MONTHS).fill(0);
    if (byMonth) {
      for (const [noticeMonth, ultimate] of byMonth) {
        for (let m = 0; m < KERNEL.length; m++) {
          if (KERNEL[m] === 0) continue;
          const calendarMonth = noticeMonth + m;
          if (calendarMonth >= 0 && calendarMonth < BUILD_MONTHS) {
            payY1[calendarMonth] += ultimate * KERNEL[m];
          }
          const t = calendarMonth - VAL_MONTH;
          if (t >= 0 && t < HORIZON) L[t] += ultimate * KERNEL[m];
        }
      }
    }
    const reserva = L.reduce((s, v) => s + v, 0);
    result.set(teamId, { L, payY1, reserva, hay: reserva > 0 });
  }
  return result;
}
