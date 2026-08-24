import { describe, expect, it } from "vitest";
import { computeDevelopment } from "./development";

describe("computeDevelopment — Year-3 tails", () => {
  it("conserves a Year-1 claim's ultimate across paid-in-Y1 + paid-in-Y2 + Year-3 tail + still-open-after-Y3, whenever it was noticed", () => {
    // Now that a claim settles in one shot LAG_AVISO_PAGO months after notice,
    // WHICH of the four buckets it lands in is decided purely by its notice
    // month — but the four always add back up to the ultimate.
    for (const noticeMonth of [0, 11, 14, 22, 34]) {
      const { byTeam } = computeDevelopment([{ teamId: 1, noticeMonth, ultimate: 1_000_000 }], [], [1]);
      const dev = byTeam.get(1)!;
      expect(dev.paidY1inY1 + dev.paidY1inY2 + dev.devTailY1InY3 + dev.osY1endY3).toBeCloseTo(1_000_000, 4);
    }
  });

  it("a Year-1 claim's notice month alone decides the calendar year it is paid in", () => {
    const enero = computeDevelopment([{ teamId: 1, noticeMonth: 0, ultimate: 1_000_000 }], [], [1]).byTeam.get(1)!;
    expect(enero.paidY1inY1).toBeCloseTo(1_000_000, 4); // avisado en enero -> pagado en abril, dentro del Año 1
    expect(enero.osY1endY3).toBeCloseTo(0, 4);

    const diciembre = computeDevelopment([{ teamId: 1, noticeMonth: 11, ultimate: 1_000_000 }], [], [1]).byTeam.get(1)!;
    expect(diciembre.paidY1inY1).toBeCloseTo(0, 4); // pagado en marzo del Año 2
    expect(diciembre.paidY1inY2).toBeCloseTo(1_000_000, 4);

    // Avisado tan tarde que el pago cae en el Año 3: eso es hoy la "cola" —
    // rezago de aviso, no lentitud de pago.
    const tardio = computeDevelopment([{ teamId: 1, noticeMonth: 22, ultimate: 1_000_000 }], [], [1]).byTeam.get(1)!;
    expect(tardio.devTailY1InY3).toBeCloseTo(1_000_000, 4);

    // Y más tarde todavía: sigue abierto cuando cierra el Año 3.
    const muyTardio = computeDevelopment([{ teamId: 1, noticeMonth: 34, ultimate: 1_000_000 }], [], [1]).byTeam.get(1)!;
    expect(muyTardio.osY1endY3).toBeCloseTo(1_000_000, 4);
  });

  it("conserves a Year-2 claim's ultimate across paid-in-Y2 + Year-3 tail + still-open-after-Y3", () => {
    // Noticed in December of Year 2, so it is paid in March of Year 3.
    const claims = [{ teamId: 1, noticeMonth: 23, ultimate: 1_000_000 }];
    const { byTeam } = computeDevelopment([], claims, [1]);
    const dev = byTeam.get(1)!;

    expect(dev.ultY2).toBeCloseTo(1_000_000, 4);
    expect(dev.paidY2inY2 + dev.devTailY2InY3 + dev.osY2endY3).toBeCloseTo(1_000_000, 4);
    expect(dev.devTailY2InY3).toBeCloseTo(1_000_000, 4);
    expect(dev.osY2endY3).toBeCloseTo(0, 4);
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
