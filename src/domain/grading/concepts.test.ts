import { describe, expect, it } from "vitest";
import { toleranceBandScore, scoreConcepto, scoreFormulaConcepto, ownValueKey, CONCEPTO_BY_ID } from "./concepts";
import type { ConceptTolerance } from "./concepts";
import type { FinBenchResult } from "../finance/finBench";

const TOLERANCE: ConceptTolerance = { tolerancePerfect: 0.05, toleranceZero: 0.4 };

describe("toleranceBandScore", () => {
  it("scores 100 within tolerancePerfect, 0 at/beyond toleranceZero, linear in between", () => {
    expect(toleranceBandScore(100, 100, TOLERANCE)).toBe(100);
    expect(toleranceBandScore(103, 100, TOLERANCE)).toBe(100); // 3% off, within tolerancePerfect=5%
    expect(toleranceBandScore(140, 100, TOLERANCE)).toBe(0); // 40% off, at toleranceZero
    expect(toleranceBandScore(200, 100, TOLERANCE)).toBe(0); // way past toleranceZero, clipped not negative
    const mid = toleranceBandScore(120, 100, TOLERANCE); // 20% off, midway through the band
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(100);
  });
});

describe("scoreFormulaConcepto / scoreConcepto's formula dispatch", () => {
  it("grades a linear formula concept against a value recomputed from the team's OWN submitted inputs, not the true bench", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d2", "p1_primaEmitida"), 1_000_000);
    // p1_rpndConstituida = 0.2 * primaEmitida = 200,000 — team submits exactly that.
    const result = scoreFormulaConcepto("p1_rpndConstituida", 200_000, ownValues, TOLERANCE);
    expect(result).not.toBeNull();
    expect(result!.score).toBe(100);
    expect(result!.bench).toBeCloseTo(200_000, 6);
  });

  it("returns a null score (ungradable, not 0) when a required own-input is missing", () => {
    const result = scoreFormulaConcepto("p1_rpndConstituida", 200_000, new Map(), TOLERANCE);
    expect(result).not.toBeNull();
    expect(result!.score).toBeNull();
  });

  it("a wrong upstream Costo doesn't cascade into a wrong RT/UAI/Utilidad Neta score, as long as the team applied the formula correctly to its own (wrong) Costo", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d2", "p1_primaEmitida"), 1_000_000_000);
    ownValues.set(ownValueKey("d2", "p1_rpndConstituida"), 200_000_000);
    ownValues.set(ownValueKey("d2", "p1_primaDevengada"), 800_000_000);
    // Team's Costo is wildly wrong relative to the true bench (checked separately,
    // via scoreConcepto against a real FinBenchResult, in the test below) — but
    // every formula line downstream of it is computed correctly RELATIVE TO
    // THAT wrong number, so none of them should be penalized for it.
    const wrongCosto = 999_999_999;
    ownValues.set(ownValueKey("d2", "p1_costo"), wrongCosto);
    ownValues.set(ownValueKey("d2", "p1_gadq"), 40_000_000); // 4% of primaEmitida
    ownValues.set(ownValueKey("d2", "p1_gcom"), 150_000_000); // 15% of primaEmitida
    const correctRt = 800_000_000 - wrongCosto - 40_000_000 - 150_000_000;
    ownValues.set(ownValueKey("d2", "p1_rt"), correctRt);

    const rtResult = scoreFormulaConcepto("p1_rt", correctRt, ownValues, TOLERANCE);
    expect(rtResult!.score).toBe(100);

    ownValues.set(ownValueKey("d2", "p1_gadm"), 60_000_000); // 6% of primaEmitida
    const correctRi = correctRt - 60_000_000;
    ownValues.set(ownValueKey("d2", "p1_ri"), correctRi);
    const riResult = scoreFormulaConcepto("p1_ri", correctRi, ownValues, TOLERANCE);
    expect(riResult!.score).toBe(100);
  });

  it("Impuesto (taxOnUai) clamps a negative UAI to 0 before applying the tax rate", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d2", "p1_uai"), -500_000_000);
    const result = scoreFormulaConcepto("p1_imp", 0, ownValues, TOLERANCE);
    expect(result!.bench).toBe(0);
    expect(result!.score).toBe(100);
    // A team that (incorrectly) applied 30% to the negative UAI directly should score badly.
    const wrong = scoreFormulaConcepto("p1_imp", 0.3 * -500_000_000, ownValues, TOLERANCE);
    expect(wrong!.score).toBeLessThan(100);
  });

  it("a cross-day term (day override) reads the referenced concept from its OWN day, not the concept being scored", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d2", "p1_primaEmitida"), 500_000_000); // submitted on Día 2
    // p2_rpndLiberada (a Día 3 concept) = 0.2 * Día 2's own p1_primaEmitida.
    const result = scoreFormulaConcepto("p2_rpndLiberada", 0.2 * 500_000_000, ownValues, TOLERANCE);
    expect(result!.score).toBe(100);
    // Without Día 2's value present at all, it's ungradable.
    const missing = scoreFormulaConcepto("p2_rpndLiberada", 100_000_000, new Map(), TOLERANCE);
    expect(missing!.score).toBeNull();
  });

  it("a concept with no formula spec returns null from scoreFormulaConcepto (use scoreConcepto for primary concepts)", () => {
    expect(scoreFormulaConcepto("p1_costo", 300_000_000, new Map(), TOLERANCE)).toBeNull();
  });
});

describe("scoreConcepto — dispatches to formula grading only for formula concepts, keeps primary concepts on the true bench", () => {
  // A minimal but internally-consistent fake FinBenchResult, just enough to
  // exercise scoreConcepto()'s two paths (primary vs. formula) without
  // needing the real finBench() engine.
  const fakeBench = {
    p1: {
      primaEmitida: 1_000_000_000,
      rpndLiberada: 0,
      rpndConstituida: 200_000_000,
      primaDevengada: 800_000_000,
      costo: 400_000_000,
      gadq: 40_000_000,
      gcom: 150_000_000,
      gadm: 60_000_000,
      rt: 210_000_000,
      ri: 150_000_000,
      rinv: 20_000_000,
      uai: 170_000_000,
      imp: 51_000_000,
      uneta: 119_000_000,
      reservas: 300_000_000,
    },
  } as unknown as FinBenchResult;

  it("a primary concept (Costo) is graded against the true bench directly, ignoring any ownValues", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d2", "p1_costo"), 999_999_999); // irrelevant for a primary concept's own grading
    const result = scoreConcepto("p1_costo", 400_000_000, fakeBench, TOLERANCE, ownValues);
    expect(result!.bench).toBe(400_000_000);
    expect(result!.score).toBe(100);
  });

  it("a formula concept (RT) is graded against the team's own recomputed value, not the true bench, even when the team's own inputs don't match the engine's", () => {
    const ownValues = new Map<string, number>();
    // Team's own Costo differs from the true bench's 400M — a genuinely
    // wrong Costo submission — but RT is computed correctly relative to it.
    const ownCosto = 500_000_000;
    ownValues.set(ownValueKey("d2", "p1_primaDevengada"), 800_000_000);
    ownValues.set(ownValueKey("d2", "p1_costo"), ownCosto);
    ownValues.set(ownValueKey("d2", "p1_gadq"), 40_000_000);
    ownValues.set(ownValueKey("d2", "p1_gcom"), 150_000_000);
    const ownRt = 800_000_000 - ownCosto - 40_000_000 - 150_000_000;
    const result = scoreConcepto("p1_rt", ownRt, fakeBench, TOLERANCE, ownValues);
    // Scored against the team's own recomputed RT (ownRt), not the bench's 210M.
    expect(result!.score).toBe(100);
    expect(result!.bench).not.toBeCloseTo(ownRt, 0); // true bench's RT (210M) differs, but isn't what graded it
  });

  it("a formula concept without an ownValues map grades as null (ungradable), not a silent fallback to bench comparison", () => {
    const result = scoreConcepto("p1_rt", 210_000_000, fakeBench, TOLERANCE);
    expect(result!.score).toBeNull();
  });

  it("every concept referenced by a FormulaTerm actually exists in CONCEPTO_BY_ID (catches typos in cross-references)", () => {
    for (const c of Object.values(CONCEPTO_BY_ID)) {
      if (!c.formula) continue;
      if (c.formula.kind === "taxOnUai") {
        expect(CONCEPTO_BY_ID[c.formula.uaiConceptId], `${c.id} -> ${c.formula.uaiConceptId}`).toBeDefined();
        continue;
      }
      for (const term of c.formula.terms) {
        expect(CONCEPTO_BY_ID[term.conceptId], `${c.id} -> ${term.conceptId}`).toBeDefined();
      }
    }
  });
});

describe("Ajuste de siniestralidad (a useTrueValue formula term: true bench fact minus the team's own prior submission)", () => {
  const bench = {
    p1: {
      primaEmitida: 1_000_000_000,
      rpndLiberada: 0,
      rpndConstituida: 200_000_000,
      primaDevengada: 800_000_000,
      costo: 400_000_000, // true Año-1 claims
      gadq: 40_000_000,
      gcom: 150_000_000,
      gadm: 60_000_000,
      rt: 210_000_000,
      ri: 150_000_000,
      rinv: 20_000_000,
      uai: 170_000_000,
      imp: 51_000_000,
      uneta: 119_000_000,
      reservas: 300_000_000,
    },
  } as unknown as FinBenchResult;

  it("grades against true p1_costo minus the team's own Día 2 p1_costo submission", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d2", "p1_costo"), 350_000_000); // team underestimated the true 400M by 50M
    const result = scoreFormulaConcepto("p2_ajusteSiniestralidad", 50_000_000, ownValues, TOLERANCE, bench);
    expect(result!.bench).toBeCloseTo(50_000_000, 6);
    expect(result!.score).toBe(100);
  });

  it("comes out to exactly 0 when the team's own Día 2 guess already matched the truth", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d2", "p1_costo"), 400_000_000);
    const result = scoreFormulaConcepto("p2_ajusteSiniestralidad", 0, ownValues, TOLERANCE, bench);
    expect(result!.bench).toBeCloseTo(0, 6);
    expect(result!.score).toBe(100);
  });

  it("is negative (hands profit back) when the team overestimated its Día 2 Costo de Siniestros A1", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d2", "p1_costo"), 450_000_000); // overestimated the true 400M by 50M
    const result = scoreFormulaConcepto("p2_ajusteSiniestralidad", -50_000_000, ownValues, TOLERANCE, bench);
    expect(result!.bench).toBeCloseTo(-50_000_000, 6);
    expect(result!.score).toBe(100);
  });

  it("is ungradable (null, not 0) when the team never submitted p1_costo on Día 2", () => {
    const result = scoreFormulaConcepto("p2_ajusteSiniestralidad", 50_000_000, new Map(), TOLERANCE, bench);
    expect(result!.score).toBeNull();
  });

  it("is ungradable when no bench is passed at all, even with the team's own p1_costo present", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d2", "p1_costo"), 350_000_000);
    const result = scoreFormulaConcepto("p2_ajusteSiniestralidad", 50_000_000, ownValues, TOLERANCE); // bench omitted
    expect(result!.score).toBeNull();
  });
});
