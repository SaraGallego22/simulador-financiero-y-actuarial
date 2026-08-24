import { describe, expect, it } from "vitest";
import { projectYear3 } from "./projectYear3";
import type { Year3ProjectionInput } from "./projectYear3";
import { CLAIMS_INFLATION_ANNUAL } from "../generation/constants";
import { PAID_WITHIN_ACCIDENT_YEAR, ACCIDENT_YEAR_PAYMENT_SHARE } from "../reserving/constants";

const base = (): Year3ProjectionInput => ({
  year1InsuredCount: 1000,
  year2InsuredCount: 1000,
  year2PrimaEmitida: 520_000_000,
  year2Retention: { retainedCount: 800, newCount: 200 },
  claimCountY2: 80,
  ultY2: 310_000_000,
  osY1endY3: 12_000_000,
  osY2endY3: 40_000_000,
  paidY2inY2: 55_000_000, // ~17.7% del ultimate de Año 2 — la velocidad de pago que ese equipo mostró
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

  it("asume para Año 3 la misma velocidad de pago que el equipo mostró en Año 2, y reserva el resto sobre las colas de Año 1 y Año 2", () => {
    const i = base();
    const p = projectYear3(i)!;
    const velocidad = i.paidY2inY2! / i.ultY2;
    expect(p.reservas3).toBeCloseTo(i.osY1endY3 + i.osY2endY3 + p.costo3 * (1 - velocidad), 4);
  });

  it("paga exactamente el complemento de esa reserva a lo largo de los 12 meses del calendario que recibe el ALM", () => {
    const i = base();
    const p = projectYear3(i)!;
    const paid = p.ownClaimsSchedule12.reduce((s, v) => s + v, 0);
    expect(p.ownClaimsSchedule12).toHaveLength(12);
    expect(paid).toBeCloseTo(p.costo3 * (i.paidY2inY2! / i.ultY2), 4);
  });

  it("reparte esos pagos con el perfil del kernel: nada durante el rezago de aviso, y de ahí en adelante parejo", () => {
    const p = projectYear3(base())!;
    expect(p.ownClaimsSchedule12[0]).toBe(0);
    expect(p.ownClaimsSchedule12[11]).toBeGreaterThan(0);
    for (let m = 1; m < 12; m++) expect(p.ownClaimsSchedule12[m]).toBeGreaterThanOrEqual(p.ownClaimsSchedule12[m - 1]);
    // Mismo perfil relativo que ACCIDENT_YEAR_PAYMENT_SHARE, solo reescalado.
    const escala = p.ownClaimsSchedule12[11] / ACCIDENT_YEAR_PAYMENT_SHARE[11];
    for (let m = 0; m < 12; m++) expect(p.ownClaimsSchedule12[m]).toBeCloseTo(ACCIDENT_YEAR_PAYMENT_SHARE[m] * escala, 4);
  });

  it("sin el dato de Año 2 cae al ritmo genérico del kernel", () => {
    const i = base();
    delete i.paidY2inY2;
    const p = projectYear3(i)!;
    const paid = p.ownClaimsSchedule12.reduce((s, v) => s + v, 0);
    expect(paid / p.costo3).toBeCloseTo(PAID_WITHIN_ACCIDENT_YEAR, 10);
    // Con avisos repartidos parejo y pago completo 3 meses después, lo que
    // alcanza a pagarse dentro del año son los avisos de los primeros 9 meses.
    expect(PAID_WITHIN_ACCIDENT_YEAR).toBeCloseTo(9 / 12, 10);
  });

  it("returns null when the real inputs it projects from don't exist yet", () => {
    expect(projectYear3({ ...base(), claimCountY2: 0 })).toBeNull();
    expect(projectYear3({ ...base(), year1InsuredCount: 0 })).toBeNull();
    expect(projectYear3({ ...base(), year2InsuredCount: 0 })).toBeNull();
  });
});
