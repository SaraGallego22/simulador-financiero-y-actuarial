import { describe, expect, it } from "vitest";
import { computeDevelopment } from "./development";

describe("computeDevelopment — Year-3 tails", () => {
  it("conserves a Year-1 claim's ultimate across paid-in-Y1 + paid-in-Y2 + Year-3 tail + still-open-after-Y3", () => {
    const claims = [{ teamId: 1, noticeMonth: 0, ultimate: 1_000_000 }];
    const { byTeam } = computeDevelopment(claims, [], [1]);
    const dev = byTeam.get(1)!;

    expect(dev.paidY1inY1 + dev.paidY1inY2 + dev.devTailY1InY3 + dev.osY1endY3).toBeCloseTo(1_000_000, 4);
    // Development keeps flowing out, never back in.
    expect(dev.devTailY1InY3).toBeGreaterThan(0);
    // A late-Year-1 notice still has a sliver open past month 35 (LAG + 36 = 39
    // months needed to fully resolve) — see osY1endY3's doc comment — but it's
    // strictly less than what was still open one year earlier.
    expect(dev.osY1endY3).toBeGreaterThanOrEqual(0);
    expect(dev.osY1endY3).toBeLessThan(dev.osY1endY2);
  });

  it("a Year-1 claim noticed late in the year has more left open after Year 3 than one noticed in January", () => {
    const early = computeDevelopment([{ teamId: 1, noticeMonth: 0, ultimate: 1_000_000 }], [], [1]).byTeam.get(1)!;
    const late = computeDevelopment([{ teamId: 1, noticeMonth: 11, ultimate: 1_000_000 }], [], [1]).byTeam.get(1)!;
    expect(late.osY1endY3).toBeGreaterThan(early.osY1endY3);
  });

  it("conserves a Year-2 claim's ultimate across paid-in-Y2 + Year-3 tail + still-open-after-Y3", () => {
    const claims = [{ teamId: 1, noticeMonth: 12, ultimate: 1_000_000 }];
    const { byTeam } = computeDevelopment([], claims, [1]);
    const dev = byTeam.get(1)!;

    expect(dev.ultY2).toBeCloseTo(1_000_000, 4);
    expect(dev.paidY2inY2 + dev.devTailY2InY3 + dev.osY2endY3).toBeCloseTo(1_000_000, 4);
    expect(dev.devTailY2InY3).toBeGreaterThan(0);
    // Still has its own 3rd development year open past Year 3 (lands in Year 4, out of the platform's scope).
    expect(dev.osY2endY3).toBeGreaterThan(0);
    expect(dev.osY2endY3).toBeLessThan(dev.osY2endY2);
    expect(dev.claimCountY2).toBe(1);
  });

  it("counts Year-2's own claims per team, ignoring Year-1's", () => {
    const year1Claims = [
      { teamId: 1, noticeMonth: 0, ultimate: 500_000 },
      { teamId: 1, noticeMonth: 1, ultimate: 500_000 },
    ];
    const year2Claims = [
      { teamId: 1, noticeMonth: 12, ultimate: 300_000 },
      { teamId: 1, noticeMonth: 13, ultimate: 300_000 },
      { teamId: 1, noticeMonth: 14, ultimate: 300_000 },
    ];
    const { byTeam } = computeDevelopment(year1Claims, year2Claims, [1]);
    expect(byTeam.get(1)!.claimCountY2).toBe(3);
  });

  it("skips zero/negative-ultimate claims for the Year-3 tail fields, same as the existing Year-2 ones", () => {
    const { byTeam } = computeDevelopment([{ teamId: 1, noticeMonth: 0, ultimate: 0 }], [{ teamId: 1, noticeMonth: 12, ultimate: 0 }], [1]);
    const dev = byTeam.get(1)!;
    expect(dev.devTailY1InY3).toBe(0);
    expect(dev.devTailY2InY3).toBe(0);
    expect(dev.claimCountY2).toBe(0);
  });
});
