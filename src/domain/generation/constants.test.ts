import { describe, expect, it } from "vitest";
import { ANIO_BASE_A1, CHILE_REAL_SEVERITY_GROWTH_ANNUAL, CLP_COP_REFERENCE_RATE, UF_CLP_REFERENCE_VALUE, chileSeverityToColombia2027Cop } from "./constants";

describe("chileSeverityToColombia2027Cop", () => {
  it("compounds the real severity growth trend for exactly the years between the Chile observation and Año 1 (2027)", () => {
    const severityUf = 200;
    const from2023 = chileSeverityToColombia2027Cop(severityUf, 2023);
    const from2021 = chileSeverityToColombia2027Cop(severityUf, 2021);
    // Same starting UF amount, but 2021 is 2 years further from 2027 than
    // 2023, so it should compound for 2 additional years and come out higher.
    const expectedRatio = (1 + CHILE_REAL_SEVERITY_GROWTH_ANNUAL) ** 2;
    expect(from2021 / from2023).toBeCloseTo(expectedRatio, 6);
  });

  it("matches the documented formula exactly for a known input", () => {
    const severityUf = 500;
    const yearsToProject = ANIO_BASE_A1 - 2023;
    const expected = severityUf * (1 + CHILE_REAL_SEVERITY_GROWTH_ANNUAL) ** yearsToProject * UF_CLP_REFERENCE_VALUE * CLP_COP_REFERENCE_RATE;
    expect(chileSeverityToColombia2027Cop(severityUf, 2023)).toBeCloseTo(expected, 6);
  });

  it("returns 0 for 0 severity, and scales linearly with the input severity", () => {
    expect(chileSeverityToColombia2027Cop(0, 2023)).toBe(0);
    const double = chileSeverityToColombia2027Cop(200, 2023);
    const single = chileSeverityToColombia2027Cop(100, 2023);
    expect(double).toBeCloseTo(single * 2, 6);
  });
});
