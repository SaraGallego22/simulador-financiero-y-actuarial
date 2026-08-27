import { describe, expect, it } from "vitest";
import { toleranceBandScore, atLeastToleranceBandScore, scoreConcepto, scoreFormulaConcepto, ownValueKey, CONCEPTO_BY_ID, CONCEPTOS } from "./concepts";
import type { ConceptTolerance, Dia } from "./concepts";
import { finBench } from "../finance/finBench";
import type { FinBenchResult, AlmYearBenchInput } from "../finance/finBench";
import type { LiabilitySchedule } from "../reserving/liability";
import { computeDevelopment } from "../reserving/development";
import { CAPITAL_SOCIAL } from "../finance/constants";

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

describe("atLeastToleranceBandScore", () => {
  it("scores 100 for meeting or exceeding the benchmark, however far above it", () => {
    expect(atLeastToleranceBandScore(100, 100, TOLERANCE)).toBe(100);
    expect(atLeastToleranceBandScore(150, 100, TOLERANCE)).toBe(100);
    expect(atLeastToleranceBandScore(10_000, 100, TOLERANCE)).toBe(100); // no ceiling
  });

  it("falls short of the benchmark exactly like the normal band", () => {
    expect(atLeastToleranceBandScore(97, 100, TOLERANCE)).toBe(100); // 3% short, within tolerancePerfect
    expect(atLeastToleranceBandScore(60, 100, TOLERANCE)).toBe(0); // 40% short, at toleranceZero
    expect(atLeastToleranceBandScore(80, 100, TOLERANCE)).toBeCloseTo(toleranceBandScore(80, 100, TOLERANCE), 10);
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

  it("a missing own-input defaults to 0 in the formula, scoring against whatever that produces — not ungradable", () => {
    // primaEmitida never submitted -> defaults to 0 -> expected rpndConstituida = 0.2*0 = 0,
    // scored against the team's own (nonzero) submission for THIS line.
    const result = scoreFormulaConcepto("p1_rpndConstituida", 200_000, new Map(), TOLERANCE);
    expect(result).not.toBeNull();
    expect(result!.bench).toBe(0);
    expect(result!.score).toBe(0);
  });

  it("a missing submission for the concept itself grades 0 against the TRUE bench, not against evalFormula()'s own expected value hollowed out to 0 by the SAME missing input", () => {
    // primaEmitida is missing here too, so evalFormula()'s own expected
    // would ALSO come out to 0.2*0=0 if this went down that path — the
    // point of this test is that it must NOT: a missing conceptoId
    // submission has to compare against the true bench (500,000 here), so a
    // team that submits nothing doesn't trivially score 100 by matching
    // 0-vs-0 on every formula concept it left blank.
    const fakeBench = { p1: { rpndConstituida: 500_000 } } as unknown as FinBenchResult;
    const result = scoreFormulaConcepto("p1_rpndConstituida", null, new Map(), TOLERANCE, fakeBench);
    expect(result!.val).toBeNull();
    expect(result!.bench).toBe(500_000);
    expect(result!.score).toBe(0); // 0 vs the true 500,000 — badly wrong, not a false 100
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
    // Without Día 2's value present at all, it defaults to 0 in the formula
    // (expected = 0.2*0 = 0), scored against the team's own submission.
    const missing = scoreFormulaConcepto("p2_rpndLiberada", 100_000_000, new Map(), TOLERANCE);
    expect(missing!.bench).toBe(0);
    expect(missing!.score).toBe(0);
  });

  it("a concept with no formula spec returns null from scoreFormulaConcepto (use scoreConcepto for primary concepts)", () => {
    expect(scoreFormulaConcepto("p1_costo", 300_000_000, new Map(), TOLERANCE)).toBeNull();
  });

  it("sol_margen (ratio) grades against the team's own Fondos propios ÷ RK, not the true bench — a wrong own RK doesn't cost it twice", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d4", "sol_fp"), 100_000_000);
    ownValues.set(ownValueKey("d4", "sol_rk"), 40_000_000); // possibly wrong relative to the true bench, penalized separately on sol_rk itself
    const result = scoreFormulaConcepto("sol_margen", 2.5, ownValues, TOLERANCE); // 100M / 40M, computed correctly off that same (wrong) RK
    expect(result!.bench).toBeCloseTo(2.5, 6);
    expect(result!.score).toBe(100);
  });

  it("sol_margen is ungradable (not 0) when the team's own sol_rk is 0", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d4", "sol_fp"), 100_000_000);
    ownValues.set(ownValueKey("d4", "sol_rk"), 0);
    const result = scoreFormulaConcepto("sol_margen", 999, ownValues, TOLERANCE);
    expect(result!.score).toBeNull();
  });

  it("div (excessAboveTarget) clamps to 0 when the team's own Fondos propios don't clear 1.5× its own RK", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d4", "sol_fp"), 50_000_000);
    ownValues.set(ownValueKey("d4", "sol_rk"), 40_000_000); // 1.5x = 60M > 50M fondos propios
    const result = scoreFormulaConcepto("div", 0, ownValues, TOLERANCE);
    expect(result!.bench).toBe(0);
    expect(result!.score).toBe(100);
  });

  it("div grades against the team's own Fondos propios − 1.5×RK, not the true bench, even off a wrong own RK", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d4", "sol_fp"), 200_000_000);
    ownValues.set(ownValueKey("d4", "sol_rk"), 40_000_000); // possibly wrong relative to the true bench
    const ownDiv = 200_000_000 - 1.5 * 40_000_000;
    const result = scoreFormulaConcepto("div", ownDiv, ownValues, TOLERANCE);
    expect(result!.score).toBe(100);
  });

  it("eva (linear, on sol_rk not sol_fp) grades against the team's own Utilidad Neta and RK — never a credit off a negative sol_fp", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d3", "p2_uneta"), 50_000_000);
    ownValues.set(ownValueKey("d4", "sol_rk"), 40_000_000);
    const ownEva = 50_000_000 - 0.1 * 1.5 * 40_000_000; // Ke=0.1, targetMargin=1.5
    const result = scoreFormulaConcepto("eva", ownEva, ownValues, TOLERANCE);
    expect(result!.score).toBe(100);
    expect(result!.bench).toBeCloseTo(44_000_000, 6);
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

  it("a formula concept without an ownValues map grades every referenced line as 0, not a silent fallback to bench comparison", () => {
    // p1_rt's formula references primaDevengada/costo/gadq/gcom, all
    // missing here -> expected = 0 - 0 - 0 - 0 = 0 -> the team's own
    // 210,000,000 submission scores badly against that, not null. `bench`
    // in the result is still the informational true value (210M, from
    // fakeBench.p1.rt) — score, not bench, is what's computed against `expected`.
    const result = scoreConcepto("p1_rt", 210_000_000, fakeBench, TOLERANCE);
    expect(result!.bench).toBe(210_000_000);
    expect(result!.score).toBe(0);
  });

  it("a formula concept with NO own submission falls back to the true bench, even with no ownValues map at all", () => {
    const result = scoreConcepto("p1_rt", null, fakeBench, TOLERANCE);
    expect(result!.val).toBeNull();
    expect(result!.bench).toBe(210_000_000); // fakeBench's own true p1.rt
    expect(result!.score).toBe(0); // graded 0 against the true 210M, not a hollow 0-vs-0 match
  });

  it("a primary concept with no submission grades 0 against the true bench", () => {
    const result = scoreConcepto("p1_costo", null, fakeBench, TOLERANCE);
    expect(result!.val).toBeNull();
    expect(result!.bench).toBe(400_000_000);
    expect(result!.score).toBe(0);
  });

  it("p3_primaEmitida (scoringMode atLeast) scores 100 for meeting the true bench, and just as well for exceeding it", () => {
    const bench = { p3: { primaEmitida: 300_000_000 } } as unknown as FinBenchResult;
    expect(scoreConcepto("p3_primaEmitida", 300_000_000, bench, TOLERANCE)!.score).toBe(100);
    // Genuinely more than the bench — never penalized, unlike a plain tolerance band would.
    expect(scoreConcepto("p3_primaEmitida", 900_000_000, bench, TOLERANCE)!.score).toBe(100);
    // Short of the bench still decays like any other numeric miss.
    expect(scoreConcepto("p3_primaEmitida", 150_000_000, bench, TOLERANCE)!.score).toBe(0);
  });

  it("every concept referenced by a FormulaTerm actually exists in CONCEPTO_BY_ID (catches typos in cross-references)", () => {
    for (const c of Object.values(CONCEPTO_BY_ID)) {
      if (!c.formula) continue;
      if (c.formula.kind === "taxOnUai") {
        expect(CONCEPTO_BY_ID[c.formula.uaiConceptId], `${c.id} -> ${c.formula.uaiConceptId}`).toBeDefined();
        continue;
      }
      if (c.formula.kind === "ratio") {
        expect(CONCEPTO_BY_ID[c.formula.numeratorConceptId], `${c.id} -> ${c.formula.numeratorConceptId}`).toBeDefined();
        expect(CONCEPTO_BY_ID[c.formula.denominatorConceptId], `${c.id} -> ${c.formula.denominatorConceptId}`).toBeDefined();
        continue;
      }
      if (c.formula.kind === "excessAboveTarget") {
        expect(CONCEPTO_BY_ID[c.formula.baseConceptId], `${c.id} -> ${c.formula.baseConceptId}`).toBeDefined();
        expect(CONCEPTO_BY_ID[c.formula.chargeConceptId], `${c.id} -> ${c.formula.chargeConceptId}`).toBeDefined();
        continue;
      }
      if (c.formula.kind === "sampleStdevLossRatio") {
        for (const y of c.formula.years) {
          expect(CONCEPTO_BY_ID[y.costConceptId], `${c.id} -> ${y.costConceptId}`).toBeDefined();
          expect(CONCEPTO_BY_ID[y.premiumConceptId], `${c.id} -> ${y.premiumConceptId}`).toBeDefined();
          if (y.adjustmentConceptId) expect(CONCEPTO_BY_ID[y.adjustmentConceptId], `${c.id} -> ${y.adjustmentConceptId}`).toBeDefined();
        }
        continue;
      }
      for (const term of c.formula.terms) {
        expect(CONCEPTO_BY_ID[term.conceptId], `${c.id} -> ${term.conceptId}`).toBeDefined();
      }
    }
  });
});

describe("Ajuste de siniestralidad (a primary fact — no formula — graded straight against the true engine's p2.ajusteSiniestralidad, independent of any team submission)", () => {
  const bench = {
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
    p2: {
      // −10% of Año 1's own remaining share of the reserve at Año 2's close
      // (development.osY1endY2) — a real finBench() output, not derived
      // from bal1_reservasTec here (see finBench.ts's own doc comment).
      ajusteSiniestralidad: -30_000_000,
    },
  } as unknown as FinBenchResult;

  it("grades against the true engine's p2.ajusteSiniestralidad, regardless of the team's own Día 2 p1_costo submission", () => {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d2", "p1_costo"), 450_000_000); // irrelevant for a primary concept's own grading
    const result = scoreConcepto("p2_ajusteSiniestralidad", -30_000_000, bench, TOLERANCE, ownValues);
    expect(result!.bench).toBeCloseTo(-30_000_000, 6);
    expect(result!.score).toBe(100);
  });

  it("is ungradable (null, not 0) when no bench is passed at all", () => {
    const result = scoreConcepto("p2_ajusteSiniestralidad", -30_000_000, null, TOLERANCE);
    expect(result!.score).toBeNull();
  });
});

/**
 * The self-consistency check the rest of this file's per-concept tests can't
 * give: a team that reports EXACTLY what the engine itself computed must score
 * 100 on every single line. It's the one property that has to hold no matter
 * how a concept is graded — `get()` against the truth, or `formula` against the
 * team's own other lines — because both are supposed to describe the same
 * Balance/P&G.
 *
 * This exists because it didn't, and nothing caught it: seven Balance lines
 * graded the correct answer at 0 (or not at all) against a live cohort. Every
 * one was a literal in a FormulaSpec that stopped matching the engine after
 * balance() changed underneath it — cxp moved from a flat 10% of Prima Emitida
 * to a 30-day rotation over gastos, Año 3's caja became a real ALM figure
 * instead of FZ.cajaPct × prima, impuestoPorPagar became cumulative — and
 * bal1_impuestoPorPagar was silently ungradable from a missing `day: "d2"` on a
 * cross-day term. Per-concept unit tests all passed throughout: each checked
 * its formula against itself, never against the engine.
 */
describe("every reporte concept grades the engine's own true value at 100", () => {
  const liabilityYear1: LiabilitySchedule = { L: new Array(48).fill(0), payY1: new Array(12).fill(0), reserva: 20_000_000, hay: true };
  const almYear = (income: number, effectiveYield?: number): AlmYearBenchInput => ({
    portYield: 0.1,
    income,
    capitalComprometido: 0,
    effectiveYield,
    cajaFinalAnio: 7_500_000,
    portfolioBookValue: CAPITAL_SOCIAL,
  });
  const development = computeDevelopment(
    Array.from({ length: 100 }, (_, i) => ({ teamId: 1, noticeMonth: i % 12, ultimate: 1_000_000 })),
    Array.from({ length: 80 }, (_, i) => ({ teamId: 1, noticeMonth: 12 + (i % 12), ultimate: 1_000_000 })),
    [1]
  ).byTeam.get(1)!;

  const bench = finBench({
    year1: { totalPremium: 500_000_000, claimsAmount: 300_000_000, insuredCount: 1000 },
    year2: { totalPremium: 520_000_000, claimsAmount: 310_000_000, insuredCount: 1000 },
    liabilityYear1,
    development,
    almYear1: almYear(2_000_000),
    almYear2: almYear(2_718_281, 0.07),
    almYear3: almYear(2_900_000, 0.07),
    year2Retention: { retainedCount: 800, newCount: 200 },
  });

  // The "perfect submission": every concept's own true engine value, keyed by
  // the day it's submitted on — exactly what a flawless team would upload.
  const ownValues = new Map<string, number>();
  for (const c of CONCEPTOS) {
    if (c.tipo !== "reporte" || !c.get) continue;
    const v = c.get(bench);
    if (v != null) ownValues.set(ownValueKey(c.dia as Dia, c.id), v);
  }

  for (const c of CONCEPTOS) {
    if (c.tipo !== "reporte" || !c.get) continue;
    const trueValue = c.get(bench);
    if (trueValue == null) continue;
    it(`${c.id} (${c.label})`, () => {
      const result = scoreConcepto(c.id, trueValue, bench, TOLERANCE, ownValues);
      expect(result, `${c.id} returned no result`).not.toBeNull();
      // null would mean ungradable — a formula whose inputs it can't resolve.
      expect(result!.score, `${c.id} is ungradable (score=null)`).not.toBeNull();
      expect(result!.score, `${c.id}: the engine's own value doesn't score 100`).toBe(100);
    });
  }
});

describe("sol_sigmaLR (sample stdev of siniestralidad/prima across Año 1/2/3, graded against the team's OWN P&G lines)", () => {
  function ownValuesFor(overrides: Partial<Record<string, number>> = {}): Map<string, number> {
    const ownValues = new Map<string, number>();
    ownValues.set(ownValueKey("d2", "p1_primaDevengada"), overrides.p1_primaDevengada ?? 1_000_000_000);
    ownValues.set(ownValueKey("d2", "p1_costo"), overrides.p1_costo ?? 400_000_000);
    ownValues.set(ownValueKey("d3", "p2_ajusteSiniestralidad"), overrides.p2_ajusteSiniestralidad ?? 50_000_000);
    ownValues.set(ownValueKey("d3", "p2_primaDevengada"), overrides.p2_primaDevengada ?? 1_000_000_000);
    ownValues.set(ownValueKey("d3", "p2_costo"), overrides.p2_costo ?? 500_000_000);
    ownValues.set(ownValueKey("d3", "p3_primaDevengada"), overrides.p3_primaDevengada ?? 1_000_000_000);
    ownValues.set(ownValueKey("d3", "p3_costo"), overrides.p3_costo ?? 550_000_000);
    return ownValues;
  }

  it("recomputes Año 1's loss ratio using the team's OWN Costo A1 CORRECTED by its OWN Ajuste de siniestralidad, not the raw Día 2 guess", () => {
    // Corrected LR1 = (400M + 50M)/1,000M = 0.45; LR2 = 500M/1,000M = 0.50; LR3 = 550M/1,000M = 0.55.
    // mean=0.50, sample variance = ((-0.05)^2+0^2+0.05^2)/2 = 0.0025, stdev = 0.05.
    const result = scoreFormulaConcepto("sol_sigmaLR", 0.05, ownValuesFor(), TOLERANCE);
    expect(result).not.toBeNull();
    expect(result!.bench).toBeCloseTo(0.05, 10);
    expect(result!.score).toBe(100);
  });

  it("is ungradable (null, not 0) when the team's own Ajuste de siniestralidad is missing", () => {
    const ownValues = ownValuesFor();
    ownValues.delete(ownValueKey("d3", "p2_ajusteSiniestralidad"));
    const result = scoreFormulaConcepto("sol_sigmaLR", 0.05, ownValues, TOLERANCE);
    expect(result!.score).toBeNull();
  });

  it("is ungradable when any year's own Costo/Prima is missing", () => {
    const ownValues = ownValuesFor();
    ownValues.delete(ownValueKey("d3", "p3_costo"));
    const result = scoreFormulaConcepto("sol_sigmaLR", 0.05, ownValues, TOLERANCE);
    expect(result!.score).toBeNull();
  });
});
