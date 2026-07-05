import { describe, expect, it } from "vitest";
import { computeLiabilitySchedules } from "./liability";
import { DEV_FRAC, LAG_AVISO_PAGO, VAL_MONTH } from "./constants";

describe("computeLiabilitySchedules", () => {
  it("splits a single claim's ultimate between Year-1 payments and the post-valuation reserve, summing to 100%", () => {
    // A claim notified in month 0 (Jan of Year 1) pays out entirely inside the
    // 48-month L[] + BUILD_MONTHS payY1[] window (kernel spans ~3+36 months).
    const claims = [{ teamId: 1, noticeMonth: 0, severity: 1_000_000 }];
    const [schedule] = [...computeLiabilitySchedules(claims, [1]).values()];

    const paidInY1 = schedule.payY1.reduce((s, v) => s + v, 0);
    const reserveFromValuation = schedule.L.reduce((s, v) => s + v, 0);
    expect(paidInY1 + reserveFromValuation).toBeCloseTo(1_000_000, 0);
    expect(schedule.reserva).toBeCloseTo(reserveFromValuation, 6);
    expect(schedule.hay).toBe(true);
  });

  it("pays out development-year fractions in the right proportions for a late-reported claim", () => {
    // Notified right at the valuation boundary so payments land entirely in L[],
    // making it easy to check against DEV_FRAC.
    const noticeMonth = VAL_MONTH - LAG_AVISO_PAGO;
    const claims = [{ teamId: 1, noticeMonth, severity: 1_000_000 }];
    const [schedule] = [...computeLiabilitySchedules(claims, [1]).values()];

    const year0 = schedule.L.slice(0, 12).reduce((s, v) => s + v, 0);
    const year1 = schedule.L.slice(12, 24).reduce((s, v) => s + v, 0);
    const year2 = schedule.L.slice(24, 36).reduce((s, v) => s + v, 0);
    expect(year0).toBeCloseTo(1_000_000 * DEV_FRAC[0], 0);
    expect(year1).toBeCloseTo(1_000_000 * DEV_FRAC[1], 0);
    expect(year2).toBeCloseTo(1_000_000 * DEV_FRAC[2], 0);
  });

  it("returns an empty, hay:false schedule for a team with no claims", () => {
    const claims = [{ teamId: 1, noticeMonth: 0, severity: 500_000 }];
    const byTeam = computeLiabilitySchedules(claims, [1, 2]);
    expect(byTeam.get(2)?.hay).toBe(false);
    expect(byTeam.get(2)?.reserva).toBe(0);
  });
});
