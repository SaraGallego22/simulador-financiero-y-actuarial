import { describe, expect, it } from "vitest";
import { projectYear3 } from "./projectYear3";
import type { Year3ProjectionInput } from "./projectYear3";
import { CLAIMS_INFLATION_ANNUAL } from "../generation/constants";
import { DEV_FRAC } from "../reserving/constants";

const base = (): Year3ProjectionInput => ({
  year1InsuredCount: 1000,
  year2InsuredCount: 1000,
  year2PrimaEmitida: 520_000_000,
  year2Retention: { retainedCount: 800, newCount: 200 },
  claimCountY2: 80,
  ultY2: 310_000_000,
  osY1endY3: 12_000_000,
  osY2endY3: 40_000_000,
});

describe("projectYear3", () => {
  it("projects the policy count as retained + new, using the observed Año1->Año2 retention rate", () => {
    // 800/1000 retained of Año 1's book, applied forward to Año 2's 1000
    // policies, plus the same 200 new policies Año 2 itself won.
    expect(projectYear3(base())!.insuredCount3).toBeCloseTo(1000, 6);
  });

  it("reprices each policy's premium by CLAIMS_INFLATION_ANNUAL rather than holding last year's average flat", () => {
    const p = projectYear3(base())!;
    const avgPremium2 = base().year2PrimaEmitida / base().year2InsuredCount;
    expect(p.prima3).toBeCloseTo(p.insuredCount3 * avgPremium2 * (1 + CLAIMS_INFLATION_ANNUAL), 4);
  });

  it("leaves the projected loss ratio identical to Año 2's — both lines carry the same inflation and the same policy count, so both cancel", () => {
    const i = base();
    const p = projectYear3(i)!;
    expect(p.costo3 / p.prima3).toBeCloseTo(i.ultY2 / i.year2PrimaEmitida, 10);
  });

  it("is invariant to how Año 2's ultimate splits between frequency and severity — only the cost per policy matters", () => {
    // Same ultY2, wildly different claim counts (many small claims vs. few
    // large ones): the count cancels inside frecuencia × severidad, which is
    // why a team that can only observe its ultimate in pesos can still
    // reproduce this projection.
    const few = projectYear3({ ...base(), claimCountY2: 20 })!;
    const many = projectYear3({ ...base(), claimCountY2: 400 })!;
    expect(few.costo3).toBeCloseTo(many.costo3, 4);
  });

  it("reserves the share of Año 3's own claims that doesn't settle within Año 3, on top of Año 1's and Año 2's remaining tails", () => {
    const i = base();
    const p = projectYear3(i)!;
    expect(p.reservas3).toBeCloseTo(i.osY1endY3 + i.osY2endY3 + p.costo3 * (1 - DEV_FRAC[0]), 4);
  });

  it("pays exactly the complement of that reserve across the 12 months of the ALM's own claims schedule", () => {
    const p = projectYear3(base())!;
    const paid = p.ownClaimsSchedule12.reduce((s, v) => s + v, 0);
    expect(p.ownClaimsSchedule12).toHaveLength(12);
    expect(paid).toBeCloseTo(p.costo3 * DEV_FRAC[0], 4);
  });

  it("returns null when the real inputs it projects from don't exist yet", () => {
    expect(projectYear3({ ...base(), claimCountY2: 0 })).toBeNull();
    expect(projectYear3({ ...base(), year1InsuredCount: 0 })).toBeNull();
    expect(projectYear3({ ...base(), year2InsuredCount: 0 })).toBeNull();
  });
});
