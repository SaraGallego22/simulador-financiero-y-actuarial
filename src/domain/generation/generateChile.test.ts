import { describe, expect, it } from "vitest";
import { generateChile } from "./generateChile";

describe("generateChile", () => {
  it("is deterministic: same seed produces identical output", () => {
    const a = generateChile(42, 200);
    const b = generateChile(42, 200);
    expect(a).toEqual(b);
  });

  it("matches golden values from the legacy prototype (seed=42, n=500)", () => {
    // Golden values produced by running generarChile()'s exact loop body
    // (copied verbatim, including the local calcLamCL()) from
    // Pasantia_SURA_v3_inversiones_dinamicas.html with seed=42, N_CHL=500.
    const policies = generateChile(42, 500);

    let claimCount = 0;
    for (const p of policies) {
      for (const year of [2021, 2022, 2023] as const) claimCount += p.years[year].siniestro;
    }
    expect(claimCount).toBe(152);

    expect(policies[0]).toMatchObject({
      id: 1,
      edadConductor: 43,
      tipoVehiculo: "sedan",
      zona: "norte",
      antiguedadVehiculo: 11,
      kilometrajeAnual: 34911,
      siniestrosPrevios: 1,
      valorComercialUf: 4339,
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

    expect(policies[250]).toMatchObject({
      id: 251,
      edadConductor: 37,
      tipoVehiculo: "station_wagon",
      zona: "austral",
      genero: "M",
    });

    const last = policies[499];
    expect(last).toMatchObject({
      id: 500,
      edadConductor: 26,
      tipoVehiculo: "furgon",
      zona: "norte",
      genero: "M",
    });
    expect(last.years[2021]).toEqual({
      siniestro: 1,
      fechaSiniestro: "2021-03-22",
      fechaAviso: "2021-04-16",
      montoUf: 197,
    });
    expect(last.years[2022]).toEqual({
      siniestro: 1,
      fechaSiniestro: "2022-08-11",
      fechaAviso: "2022-08-12",
      montoUf: 199,
    });
    expect(last.years[2023]).toEqual({ siniestro: 0, fechaSiniestro: "", fechaAviso: "", montoUf: "" });
  });
});
