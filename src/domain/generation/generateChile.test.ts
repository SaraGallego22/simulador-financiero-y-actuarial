import { describe, expect, it } from "vitest";
import { generateChile } from "./generateChile";

describe("generateChile", () => {
  it("is deterministic: same seed produces identical output", () => {
    const a = generateChile(42, 200);
    const b = generateChile(42, 200);
    expect(a).toEqual(b);
  });

  it("matches golden values regenerated after fixing gammaRand()'s proposal-distribution bug (seed=42, n=500)", () => {
    // Originally pinned to generarChile()'s exact loop body from
    // Pasantia_SURA_v3_inversiones_dinamicas.html, then already adjusted twice
    // since (montoUf's CHILE_REAL_SEVERITY_GROWTH_ANNUAL bump, then
    // valorComercialUf's recalibration — see git history). Now regenerated a
    // third time: gammaRand()'s proposal variate was drawn from
    // Uniform(-3.5, 3.5) instead of a real N(0,1) (see rng.ts's doc comment),
    // and fixing it changes how many random draws it consumes per proposal —
    // that reseeds every downstream draw once a policy's first claim is
    // generated. Policies with no claim at all before this point (0, 1) are
    // untouched; everything after the first real claim (policy 4) diverges.
    // These golden values come from running the corrected TS port itself.
    const policies = generateChile(42, 500);

    let claimCount = 0;
    for (const p of policies) {
      for (const year of [2021, 2022, 2023] as const) claimCount += p.years[year].siniestro;
    }
    expect(claimCount).toBe(154);

    expect(policies[0]).toMatchObject({
      id: 1,
      edadConductor: 43,
      tipoVehiculo: "sedan",
      zona: "norte",
      antiguedadVehiculo: 11,
      kilometrajeAnual: 34911,
      siniestrosPrevios: 1,
      valorComercialUf: 1237,
      usoVehiculo: "uber",
      cajaAutomatica: false,
      seguroComplementario: true,
      genero: "F",
      comunaTipo: "rural",
    });
    expect(policies[0].years[2021]).toEqual({ siniestro: 0, fechaSiniestro: "", fechaAviso: "", montoUf: "" });

    expect(policies[1]).toMatchObject({
      id: 2,
      edadConductor: 47,
      tipoVehiculo: "pickup",
      zona: "centro",
      cajaAutomatica: true,
      seguroComplementario: true,
    });

    // First policy with a real claim in any year — exercises the corrected
    // severity/date generation directly.
    const firstClaim = policies[4];
    expect(firstClaim).toMatchObject({ id: 5, edadConductor: 72, tipoVehiculo: "furgon", zona: "austral", genero: "M" });
    expect(firstClaim.years[2021]).toEqual({ siniestro: 1, fechaSiniestro: "2021-07-25", fechaAviso: "2021-07-27", montoUf: 273 });
    expect(firstClaim.years[2022]).toEqual({ siniestro: 1, fechaSiniestro: "2022-10-31", fechaAviso: "2022-12-25", montoUf: 143 });
    expect(firstClaim.years[2023]).toEqual({ siniestro: 1, fechaSiniestro: "2023-08-11", fechaAviso: "2023-08-22", montoUf: 262 });

    // A policy with a gap year (claim in 2021 and 2023, none in 2022).
    const gapYear = policies[12];
    expect(gapYear).toMatchObject({ id: 13, edadConductor: 50, tipoVehiculo: "furgon", zona: "centro", genero: "F" });
    expect(gapYear.years[2021]).toEqual({ siniestro: 1, fechaSiniestro: "2021-12-22", fechaAviso: "2021-12-25", montoUf: 488 });
    expect(gapYear.years[2022]).toEqual({ siniestro: 0, fechaSiniestro: "", fechaAviso: "", montoUf: "" });
    expect(gapYear.years[2023]).toEqual({ siniestro: 1, fechaSiniestro: "2023-05-23", fechaAviso: "2023-05-31", montoUf: 136 });

    const last = policies[499];
    expect(last).toMatchObject({ id: 500, edadConductor: 74, tipoVehiculo: "station_wagon", zona: "sur", genero: "F" });
    expect(last.years[2021]).toEqual({ siniestro: 0, fechaSiniestro: "", fechaAviso: "", montoUf: "" });
    expect(last.years[2022]).toEqual({ siniestro: 0, fechaSiniestro: "", fechaAviso: "", montoUf: "" });
    expect(last.years[2023]).toEqual({ siniestro: 0, fechaSiniestro: "", fechaAviso: "", montoUf: "" });
  });
});
