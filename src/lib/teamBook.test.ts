import { describe, expect, it } from "vitest";
import { computeReservesForTeams } from "./teamBook";

describe("computeReservesForTeams", () => {
  it("remaps string team ids to/from the domain engine's numeric ids correctly", () => {
    const claimsByTeamId = new Map([
      ["team-a", [{ noticeMonth: 0, severity: 1_000_000 }]],
      ["team-b", [{ noticeMonth: 3, severity: 2_000_000 }]],
    ]);

    const schedules = computeReservesForTeams(claimsByTeamId);

    expect(schedules.has("team-a")).toBe(true);
    expect(schedules.has("team-b")).toBe(true);
    expect(schedules.get("team-a")!.reserva).toBeGreaterThanOrEqual(0);
    // team-b's claim is larger, so its schedule should reserve more.
    const totalA = schedules.get("team-a")!.payY1.reduce((s, v) => s + v, 0) + schedules.get("team-a")!.reserva;
    const totalB = schedules.get("team-b")!.payY1.reduce((s, v) => s + v, 0) + schedules.get("team-b")!.reserva;
    expect(totalB).toBeGreaterThan(totalA);
  });

  it("returns an empty map for no teams", () => {
    expect(computeReservesForTeams(new Map()).size).toBe(0);
  });
});
