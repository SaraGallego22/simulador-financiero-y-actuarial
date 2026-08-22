import { describe, expect, it } from "vitest";
import { computeReservesForTeams, computeDevelopmentForTeams, aggregateClaimsByTeamMonth } from "./teamBook";
import type { ClaimMonthAggregate } from "./teamBook";

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

/**
 * The whole justification for TeamClaimAggregate (and for not reading
 * `SimulationRun.resultData` on a page load) is that collapsing claims to
 * per-month totals changes nothing downstream. If that ever stops holding,
 * old runs served from `resultData` and new runs served from the aggregate
 * table would grade differently — silently. These pin the equivalence.
 */
describe("aggregateClaimsByTeamMonth", () => {
  const MS_PER_DAY = 86_400_000;
  const epochDay = (y: number, m: number, d: number) => Math.floor(Date.UTC(y, m, d, 12) / MS_PER_DAY);

  /** Several claims sharing notice months, plus a non-claim, a never-noticed claim, a zero severity, and an unassigned exposure. */
  function buildSource() {
    const rows = [
      { team: "a", siniestro: 1, sev: 1_000_000, day: epochDay(2027, 0, 10) },
      { team: "a", siniestro: 1, sev: 2_500_000, day: epochDay(2027, 0, 25) }, // same month as above
      { team: "a", siniestro: 1, sev: 400_000, day: epochDay(2027, 5, 3) },
      { team: "a", siniestro: 1, sev: 0, day: epochDay(2027, 5, 4) }, // skipped by both consumers
      { team: "b", siniestro: 1, sev: 7_000_000, day: epochDay(2027, 2, 1) },
      { team: "b", siniestro: 1, sev: 1_250_000, day: epochDay(2027, 2, 28) },
      { team: "b", siniestro: 1, sev: 900_000, day: epochDay(2028, 1, 14) },
      { team: "a", siniestro: 0, sev: 5_000_000, day: epochDay(2027, 3, 1) }, // no claim
      { team: "b", siniestro: 1, sev: 3_000_000, day: -1 }, // never noticed
      { team: null, siniestro: 1, sev: 9_000_000, day: epochDay(2027, 4, 4) }, // unassigned exposure
    ];
    const n = rows.length;
    const source = {
      siniestro: Uint8Array.from(rows.map((r) => r.siniestro)),
      sev: Float32Array.from(rows.map((r) => r.sev)),
      fechaAvisoEpochDay: Int32Array.from(rows.map((r) => r.day)),
    };
    return { rows, n, source, teamIdForIndex: (k: number) => rows[k].team };
  }

  /** What the pre-aggregate code built: one entry per claim, count always 1. */
  function individualClaims(
    rows: ReturnType<typeof buildSource>["rows"],
    source: ReturnType<typeof buildSource>["source"]
  ): Map<string, ClaimMonthAggregate[]> {
    const byTeam = new Map<string, ClaimMonthAggregate[]>();
    rows.forEach((r, k) => {
      if (!source.siniestro[k] || source.fechaAvisoEpochDay[k] < 0 || !r.team) return;
      const noticeMonth = (new Date(source.fechaAvisoEpochDay[k] * MS_PER_DAY).getFullYear() - 2027) * 12 + new Date(source.fechaAvisoEpochDay[k] * MS_PER_DAY).getMonth();
      if (!byTeam.has(r.team)) byTeam.set(r.team, []);
      byTeam.get(r.team)!.push({ noticeMonth, severity: source.sev[k], count: 1 });
    });
    return byTeam;
  }

  it("groups claims by team and notice month, counting only positive severities", () => {
    const { n, source, teamIdForIndex } = buildSource();
    const agg = aggregateClaimsByTeamMonth(source, n, teamIdForIndex);

    expect([...agg.keys()].sort()).toEqual(["a", "b"]);
    const janA = agg.get("a")!.find((m) => m.noticeMonth === 0)!;
    expect(janA.count).toBe(2);
    expect(janA.severity).toBeCloseTo(3_500_000, 0);
    // June has one real claim plus one zero-severity claim: the month exists,
    // but the zero contributes to neither the sum nor the count.
    const junA = agg.get("a")!.find((m) => m.noticeMonth === 5)!;
    expect(junA.count).toBe(1);
    expect(junA.severity).toBeCloseTo(400_000, 0);
    // 6 of the 10 exposures count: the non-claim, the never-noticed claim,
    // the unassigned exposure and the zero-severity claim are all excluded.
    const allCounts = [...agg.values()].flat().reduce((s, m) => s + m.count, 0);
    expect(allCounts).toBe(6);
  });

  it("produces the same reserves as the equivalent per-claim list", () => {
    const { rows, n, source, teamIdForIndex } = buildSource();
    const fromAggregates = computeReservesForTeams(aggregateClaimsByTeamMonth(source, n, teamIdForIndex));
    const fromIndividual = computeReservesForTeams(individualClaims(rows, source));

    expect([...fromAggregates.keys()].sort()).toEqual([...fromIndividual.keys()].sort());
    for (const [teamId, aggSchedule] of fromAggregates) {
      const indSchedule = fromIndividual.get(teamId)!;
      expect(aggSchedule.reserva).toBeCloseTo(indSchedule.reserva, 6);
      expect(aggSchedule.hay).toBe(indSchedule.hay);
      aggSchedule.L.forEach((v, i) => expect(v).toBeCloseTo(indSchedule.L[i], 6));
      aggSchedule.payY1.forEach((v, i) => expect(v).toBeCloseTo(indSchedule.payY1[i], 6));
    }
  });

  it("produces the same development (including claimCountY2) as the equivalent per-claim list", () => {
    const { rows, n, source, teamIdForIndex } = buildSource();
    const agg = aggregateClaimsByTeamMonth(source, n, teamIdForIndex);
    const ind = individualClaims(rows, source);

    const fromAggregates = computeDevelopmentForTeams(agg, agg);
    const fromIndividual = computeDevelopmentForTeams(ind, ind);

    expect([...fromAggregates.keys()].sort()).toEqual([...fromIndividual.keys()].sort());
    for (const [teamId, aggDev] of fromAggregates) {
      const indDev = fromIndividual.get(teamId)!;
      // claimCountY2 is the one figure that is NOT linear in the summed
      // severity — it is why ClaimMonthAggregate carries `count` at all.
      expect(aggDev.claimCountY2).toBe(indDev.claimCountY2);
      for (const key of Object.keys(indDev) as (keyof typeof indDev)[]) {
        expect(aggDev[key]).toBeCloseTo(indDev[key], 6);
      }
    }
  });
});
