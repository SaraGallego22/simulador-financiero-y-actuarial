import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import {
  analyticsCsvSchema,
  deliverableCsvSchema,
  portfolioCsvSchema,
  rosterCsvSchema,
  tariffCsvSchema,
} from "./csvSchemas";

describe("parseCsv / tariffCsvSchema", () => {
  it("parses valid rows", () => {
    const { rows, errors } = parseCsv("id_expuesto,prima\n1,900000\n2,950000", tariffCsvSchema);
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { id_expuesto: 1, prima: 900000 },
      { id_expuesto: 2, prima: 950000 },
    ]);
  });

  it("reports missing required columns", () => {
    const { rows, errors } = parseCsv("foo,bar\n1,2", tariffCsvSchema);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/Faltan columnas/);
  });

  it("collects per-row errors instead of silently dropping bad rows", () => {
    const { rows, errors } = parseCsv("id_expuesto,prima\n1,900000\n2,not-a-number", tariffCsvSchema);
    expect(rows).toEqual([{ id_expuesto: 1, prima: 900000 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(3);
  });

  it("handles quoted fields with embedded commas (the legacy hand-rolled parser couldn't)", () => {
    const { rows, errors } = parseCsv('id_expuesto,prima\n"1,000",900000', tariffCsvSchema);
    // id_expuesto "1,000" -> numeric coercion strips non-digits -> 1000
    expect(errors).toHaveLength(0);
    expect(rows[0].id_expuesto).toBe(1000);
  });
});

describe("portfolioCsvSchema", () => {
  it("accepts monto/peso as aliases for asignacion", () => {
    const { rows, errors } = parseCsv("instrumento_id,monto\nLIQ,50\nTES1,50", portfolioCsvSchema);
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { instrumento_id: "LIQ", asignacion: 50 },
      { instrumento_id: "TES1", asignacion: 50 },
    ]);
  });

  it("rejects unrecognized instrument ids", () => {
    const { rows, errors } = parseCsv("instrumento_id,asignacion\nNOPE,100", portfolioCsvSchema);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });
});

describe("rosterCsvSchema", () => {
  it("parses name/team pairs", () => {
    const { rows } = parseCsv("nombre,equipo\nAna Pérez,Equipo 1", rosterCsvSchema);
    expect(rows).toEqual([{ nombre: "Ana Pérez", equipo: "Equipo 1" }]);
  });
});

describe("deliverableCsvSchema", () => {
  it("only accepts 'reporte'-type concept ids", () => {
    const { rows, errors } = parseCsv("concepto,valor\np1_uneta,1000000\nalm_calce,50", deliverableCsvSchema);
    // alm_calce is tipo 'auto_alm', not a 'reporte' deliverable -> rejected
    expect(rows).toEqual([{ concepto: "p1_uneta", valor: 1000000 }]);
    expect(errors).toHaveLength(1);
  });
});

describe("analyticsCsvSchema", () => {
  it("parses valid recommendations and rejects invalid ones", () => {
    const { rows, errors } = parseCsv(
      "segmento,recomendacion\nzona:urbana,crecer\nzona:urbana,volar",
      analyticsCsvSchema
    );
    expect(rows).toEqual([{ segmento: "zona:urbana", recomendacion: "crecer" }]);
    expect(errors).toHaveLength(1);
  });
});
