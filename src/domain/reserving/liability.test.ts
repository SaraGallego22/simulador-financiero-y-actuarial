import { describe, expect, it } from "vitest";
import { computeLiabilitySchedules } from "./liability";
import { LAG_AVISO_PAGO, VAL_MONTH } from "./constants";

describe("computeLiabilitySchedules", () => {
  it("splits a book's ultimate between Year-1 payments and the post-valuation reserve, summing to 100%", () => {
    // What lands on each side is decided entirely by when each claim was
    // NOTICED: month 0 is paid inside Year 1, month 11 only after the
    // valuation date. Nothing is ever lost between the two.
    const claims = [
      { teamId: 1, noticeMonth: 0, severity: 600_000 },
      { teamId: 1, noticeMonth: 11, severity: 400_000 },
    ];
    const [schedule] = [...computeLiabilitySchedules(claims, [1]).values()];

    const paidInY1 = schedule.payY1.reduce((s, v) => s + v, 0);
    const reserveFromValuation = schedule.L.reduce((s, v) => s + v, 0);
    expect(paidInY1).toBeCloseTo(600_000, 0);
    expect(reserveFromValuation).toBeCloseTo(400_000, 0);
    expect(paidInY1 + reserveFromValuation).toBeCloseTo(1_000_000, 0);
    expect(schedule.reserva).toBeCloseTo(reserveFromValuation, 6);
    expect(schedule.hay).toBe(true);
  });

  it("settles a claim in full on a single month, LAG_AVISO_PAGO months after notice — nothing before, nothing after", () => {
    // Notified right at the valuation boundary so the payment lands in L[]'s
    // own first month rather than inside Year 1.
    const noticeMonth = VAL_MONTH - LAG_AVISO_PAGO;
    const claims = [{ teamId: 1, noticeMonth, severity: 1_000_000 }];
    const [schedule] = [...computeLiabilitySchedules(claims, [1]).values()];

    expect(schedule.L[0]).toBeCloseTo(1_000_000, 0);
    expect(schedule.L.slice(1).reduce((s, v) => s + v, 0)).toBeCloseTo(0, 6);
    expect(schedule.payY1.reduce((s, v) => s + v, 0)).toBeCloseTo(0, 6);
  });

  it("a claim noticed early enough in Year 1 is fully paid inside Year 1, three months later", () => {
    const claims = [{ teamId: 1, noticeMonth: 2, severity: 1_000_000 }];
    const [schedule] = [...computeLiabilitySchedules(claims, [1]).values()];
    expect(schedule.payY1[2 + LAG_AVISO_PAGO]).toBeCloseTo(1_000_000, 0);
    expect(schedule.reserva).toBeCloseTo(0, 6);
  });

  it("returns an empty, hay:false schedule for a team with no claims", () => {
    const claims = [{ teamId: 1, noticeMonth: 0, severity: 500_000 }];
    const byTeam = computeLiabilitySchedules(claims, [1, 2]);
    expect(byTeam.get(2)?.hay).toBe(false);
    expect(byTeam.get(2)?.reserva).toBe(0);
  });
});
