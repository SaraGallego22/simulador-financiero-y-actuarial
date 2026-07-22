import { describe, expect, it } from "vitest";
import { generateColombia, getExposure } from "./generateColombia";
import { ANIO_BASE_A1 } from "./constants";
import { CHAIN_LADDER_TAIL_FACTOR } from "../reserving/constants";

const MS_PER_DAY = 86_400_000;
function epochDayToIso(day: number): string | null {
  if (day < 0) return null;
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}
function epochDayYear(day: number): number | null {
  if (day < 0) return null;
  return new Date(day * MS_PER_DAY).getFullYear();
}

describe("generateColombia", () => {
  it("is deterministic: same seed produces identical output", () => {
    const a = generateColombia(42, 500);
    const b = generateColombia(42, 500);
    expect(Array.from(a.lam)).toEqual(Array.from(b.lam));
    expect(Array.from(a.siniestro)).toEqual(Array.from(b.siniestro));
  });

  it("produces a different universe for a different seed", () => {
    const a = generateColombia(42, 500);
    const b = generateColombia(43, 500);
    expect(Array.from(a.edad)).not.toEqual(Array.from(b.edad));
  });

  it("matches golden values regenerated after fixing gammaRand()'s proposal-distribution bug (seed=42, n=1000)", () => {
    // Originally pinned to generarColombia()'s exact loop body from
    // Pasantia_SURA_v3_inversiones_dinamicas.html — but that legacy gammaRand()
    // drew its Marsaglia-Tsang proposal variate from Uniform(-3.5, 3.5) instead
    // of a real N(0,1) (see rng.ts's doc comment), inflating every claim
    // severity ~33% above the theoretical mean. Fixing it changes how many
    // random draws gammaRand() consumes per proposal, which reseeds every
    // downstream draw once the first claim is generated — row0 (no claim) is
    // untouched, but row1 onward diverges from the old legacy-matched values.
    // These golden values come from running the corrected TS port itself, not
    // hand-adjusted from the legacy file.
    const u = generateColombia(42, 1000);

    let claimCount = 0;
    for (let i = 0; i < u.n; i++) claimCount += u.siniestro[i];
    expect(claimCount).toBe(83);

    const row0 = getExposure(u, 0);
    expect(row0).toMatchObject({
      id: 1,
      edad: 18,
      tipo: "deportivo",
      zona: "rural",
      antig: 5,
      km: 48266,
      hist: 0,
      valor: 292955173,
      uso: "comercial",
      parq: "si",
      edu: "tecnica",
      estrato: 1,
      genero: "F",
      marca: "ford",
    });
    expect(u.lam[0]).toBeCloseTo(0.0896120027, 6);
    expect(u.siniestro[0]).toBe(0);

    const row1 = getExposure(u, 1);
    expect(row1).toMatchObject({ id: 2, edad: 24, tipo: "compacto", zona: "suburbana" });
    expect(u.lam[1]).toBeCloseTo(0.0616388694, 6);
    expect(u.siniestro[1]).toBe(1);
    expect(Math.abs(u.sev[1] - 8721795)).toBeLessThan(10);
    expect(epochDayToIso(u.fechaSinEpochDay[1])).toBe("2027-08-11");
    expect(epochDayToIso(u.fechaAvisoEpochDay[1])).toBe("2027-08-28");

    const row8 = getExposure(u, 8);
    expect(row8).toMatchObject({ id: 9, edad: 46, tipo: "pickup", zona: "urbana", genero: "M", marca: "mazda" });
    expect(u.siniestro[8]).toBe(0);

    const row500 = getExposure(u, 500);
    expect(row500).toMatchObject({ id: 501, edad: 36, tipo: "compacto", zona: "suburbana", genero: "M" });
    expect(u.siniestro[500]).toBe(0);

    const row999 = getExposure(u, 999);
    expect(row999).toMatchObject({ id: 1000, edad: 73, tipo: "suv", zona: "rural", genero: "M" });
    expect(u.siniestro[999]).toBe(0);
  });

  it("CHAIN_LADDER_TAIL_FACTOR matches the real ratio of true ultimate severity to severity reported within 24 months", () => {
    // Verifies src/domain/reserving/constants.ts's CHAIN_LADDER_TAIL_FACTOR
    // (given directly to teams in the Día 3 guide) against actual generation
    // — not just trusting the doc comment's claim. 200k exposures is enough
    // to be stable (the real check used 1M across 5 seeds, see that
    // constant's doc comment); this just guards against silent drift.
    const u = generateColombia(42, 200_000);
    let totalUltimate = 0;
    let reportedBy24Months = 0;
    for (let i = 0; i < u.n; i++) {
      if (!u.siniestro[i]) continue;
      totalUltimate += u.sev[i];
      const noticeYear = epochDayYear(u.fechaAvisoEpochDay[i]);
      if (noticeYear != null && noticeYear <= ANIO_BASE_A1 + 1) reportedBy24Months += u.sev[i];
    }
    const actualTailFactor = totalUltimate / reportedBy24Months;
    expect(actualTailFactor).toBeCloseTo(CHAIN_LADDER_TAIL_FACTOR, 2);
  });
});
