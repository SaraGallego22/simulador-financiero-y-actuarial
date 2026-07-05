import { describe, expect, it } from "vitest";
import { generateColombia, getExposure } from "./generateColombia";

const MS_PER_DAY = 86_400_000;
function epochDayToIso(day: number): string | null {
  if (day < 0) return null;
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
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

  it("matches golden values from the legacy prototype (seed=42, n=1000)", () => {
    // Golden values produced by running generarColombia()'s exact loop body
    // (copied verbatim) from Pasantia_SURA_v3_inversiones_dinamicas.html with
    // seed=42, N_COL=1000. This pins the TS port's numerical fidelity.
    const u = generateColombia(42, 1000);

    let claimCount = 0;
    for (let i = 0; i < u.n; i++) claimCount += u.siniestro[i];
    expect(claimCount).toBe(93);

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
    expect(u.lam[0]).toBeCloseTo(0.08961200282888053, 6);
    expect(u.siniestro[0]).toBe(0);

    const row1 = getExposure(u, 1);
    expect(row1).toMatchObject({ id: 2, edad: 24, tipo: "compacto", zona: "suburbana" });
    expect(u.lam[1]).toBeCloseTo(0.06163887037651202, 6);
    expect(u.siniestro[1]).toBe(1);
    // sev is stored as Float32 for memory efficiency (see CLAUDE.md §4.1), so
    // expect single-digit rounding at this magnitude vs. the double-precision
    // legacy value, not an exact match.
    expect(Math.abs(u.sev[1] - 48989170)).toBeLessThan(10);
    expect(epochDayToIso(u.fechaSinEpochDay[1])).toBe("2027-07-24");
    expect(epochDayToIso(u.fechaAvisoEpochDay[1])).toBe("2027-08-03");

    const row8 = getExposure(u, 8);
    expect(row8).toMatchObject({ id: 9, edad: 52, tipo: "deportivo", genero: "F", marca: "toyota" });
    expect(u.siniestro[8]).toBe(1);
    expect(Math.abs(u.sev[8] - 11075605)).toBeLessThan(10);
    expect(epochDayToIso(u.fechaSinEpochDay[8])).toBe("2027-03-27");

    const row500 = getExposure(u, 500);
    expect(row500).toMatchObject({ id: 501, edad: 32, tipo: "pickup", zona: "suburbana", genero: "F" });
    expect(u.siniestro[500]).toBe(0);

    const row999 = getExposure(u, 999);
    expect(row999).toMatchObject({ id: 1000, edad: 68, tipo: "suv", zona: "urbana", genero: "F" });
    expect(u.siniestro[999]).toBe(0);
  });
});
