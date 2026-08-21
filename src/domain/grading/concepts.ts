import type { FinBenchResult } from "../finance/finBench";
import { FZ } from "../finance/constants";
import { sampleStdev } from "../finance/stats";

export type Perfil = "act" | "fin";
export type Dia = "d1" | "d2" | "d3" | "d4";
export type ConceptType = "reporte" | "auto_alm" | "auto_analitica" | "auto_minvar";

/** Groups a "reporte" concept into one of the financial statements it belongs to, purely for UI presentation (DeliverablesForm/admin render one vertical section per group, in CONCEPTOS's array order) — never used for scoring, which stays per-concept via scoreConcepto(). */
export type ConceptGroup = "pyg_a1" | "pyg_a2" | "pyg_a3" | "bal_a1" | "bal_a2" | "bal_a3";

export const GROUP_LABELS: Record<ConceptGroup, string> = {
  pyg_a1: "Estado de resultados — Año 1",
  pyg_a2: "Estado de resultados — Año 2",
  pyg_a3: "Estado de resultados — Año 3 (proyectado)",
  bal_a1: "Balance — Año 1",
  bal_a2: "Balance — Año 2",
  bal_a3: "Balance — Año 3 (proyectado)",
};

/** One term of a linear FormulaSpec: `coeff × (the team's own submitted value for conceptId)`. `day` defaults to the referencing concept's own `dia` — set explicitly only for a genuine cross-day reference (Balance Año 1's %-of-premium lines and Año 2's RPND-liberada both need Día 2's own Prima Emitida, submitted a day earlier). `useTrueValue` swaps that lookup for the concept's own true bench value (via its `get()`) instead of the team's submission — for the rare formula that needs a true engine fact instead of what the team reported (e.g. Ajuste de siniestralidad: a fixed 10% release of the true reserva técnica A1, independent of any team submission). */
export interface FormulaTerm {
  conceptId: string;
  coeff: number;
  day?: Dia;
  useTrueValue?: boolean;
}

/**
 * One year's term of `sol_sigmaLR`'s "sampleStdevLossRatio" FormulaSpec:
 * that year's loss ratio is `(costConceptId's own value [+ adjustmentConceptId's
 * own value, if present]) / premiumConceptId's own value`. `day` (both for
 * the cost/premium pair and, separately, for the adjustment) defaults to the
 * referencing concept's own `dia`, same convention as FormulaTerm.day —
 * `sol_sigmaLR` lives on d4 but every year's own P&G lines live on d2/d3, so
 * every entry sets it explicitly in practice. `adjustmentConceptId` exists
 * only for Año 1: its Día-2 Costo de Siniestros gets adjusted by Año 2's own
 * "Ajuste de siniestralidad" line (`p2_ajusteSiniestralidad`, a fixed 10%
 * release of the true reserva técnica A1 — see that concept's own comment),
 * so Año 1's loss ratio here uses the team's own ADJUSTED Año-1 claims, not
 * the Día-2 figure alone — the same adjustment the P&G's own Resultado
 * Técnico A2 formula already applies.
 */
export interface LossRatioYearSpec {
  costConceptId: string;
  premiumConceptId: string;
  day?: Dia;
  adjustmentConceptId?: string;
  adjustmentDay?: Dia;
}

/**
 * How a "formula" concept's expected value is derived from the team's OWN
 * other submitted values (never from the true finBench() bench) — see
 * scoreConcepto()'s doc comment for why. `"linear"` covers every formula
 * line except Impuesto, which needs a `max(0, ·)` clamp before applying the
 * tax rate — `"taxOnUai"` is a dedicated small case for that one shape
 * rather than generalizing the whole spec for a single non-linear formula.
 * `"sampleStdevLossRatio"` is `sol_sigmaLR`'s own dedicated shape, for the
 * same reason: a 3-year sample standard deviation of a ratio isn't
 * expressible as a linear combination of other concepts' values.
 */
export type FormulaSpec =
  | { kind: "linear"; terms: FormulaTerm[]; constant?: number }
  | { kind: "taxOnUai"; uaiConceptId: string; rate: number }
  | { kind: "sampleStdevLossRatio"; years: LossRatioYearSpec[] };

export interface Concepto {
  id: string;
  dia: Dia;
  perfil: Perfil;
  tipo: ConceptType;
  label: string;
  unit: "COP" | "score" | "x";
  /** Only set on "reporte" concepts that belong to a full P&G/Balance statement — see ConceptGroup. */
  group?: ConceptGroup;
  /** The true engine value — kept even on "formula" concepts so admin/review UIs can still show the correct reference number, even though grading for those concepts ignores it (see FormulaSpec). */
  get?: (bench: FinBenchResult) => number | null;
  /**
   * When set, this concept is graded against a value recomputed from the
   * team's OWN other submitted lines (via FormulaSpec), not against the
   * true bench — see scoreConcepto()'s doc comment. A concept can have both
   * `get` (informational true value) and `formula` (what actually grades
   * it); `get` alone means "primary" — a genuine fact/estimate a team must
   * arrive at on its own, graded straight against the truth.
   */
  formula?: FormulaSpec;
}

/**
 * Gradable financial/actuarial deliverables per day, ported verbatim from
 * CONCEPTOS in the legacy prototype, line ~1170. `auto_alm`/`auto_analitica`/
 * `auto_minvar` concepts don't have a `get()` — they're scored by
 * scoreFinanciero()/scoreAnalitica()/the minimum-variance scorer directly
 * (see the module doc comment on scoreConcepto() below for why that
 * dispatch isn't folded into this same function here).
 *
 * Every P&G/Balance year follows the same shape: Prima Emitida (what was
 * actually collected — the raw fact) splits into Prima Devengada (what's
 * earned this year) and a Reserva de Prima No Devengada (RPND, the 20%
 * held back) via a genuine 1-year roll-forward — each year releases 100%
 * of the PRIOR year's own holdback and constitutes a new 20% on its own
 * Prima Emitida (Año 1 has no prior year, so it only constitutes). Costo
 * de siniestros is always that year's own accident-year ultimate only —
 * Año 2 alone carries an extra "Ajuste de siniestralidad" line: a fixed,
 * one-time release of 10% of the true reserva técnica A1, narrated in the
 * Guía del Pasante as an actuarial-team finding that 2027's remaining
 * unpaid severity was overestimated (see p2_ajusteSiniestralidad's own
 * comment, below). RT excludes Gasto Administrativo, which lands on its own
 * line feeding a new "Resultado Industrial" (RI) instead; UAI = RI +
 * Rendimiento de Inversiones (not RT + Rinv).
 *
 * Every line that's a pure formula of OTHER already-reported lines (RPND
 * constituida/liberada, Prima Devengada, the three expense lines, RT, RI,
 * UAI, Impuesto, Utilidad Neta, and on the Balance side Activos/Pasivo/
 * Pasivo+Patrimonio/Inversiones) carries a `formula` spec and is graded via
 * scoreFormulaConcepto() against the team's OWN other submitted values —
 * never against the true bench directly. Ajuste de siniestralidad also
 * carries a `formula`, but its one term reads a true bench fact instead
 * (see FormulaTerm.useTrueValue) — it's the one "reporte" line whose expected
 * value doesn't depend on anything else the team submitted at all. This
 * means one upstream mistake
 * (e.g. a wrong Costo) costs points exactly once, not once per downstream
 * line that algebraically depends on it. Only genuine primary facts/
 * estimates (Prima Emitida, Costo de Siniestros, Resultado de Inversiones,
 * Reservas Técnicas, Patrimonio) are graded straight against the true
 * finBench() value.
 */
export const CONCEPTOS: Concepto[] = [
  { id: "minvar", dia: "d1", perfil: "fin", tipo: "auto_minvar", label: "Portafolio de mínima varianza", unit: "score" },

  // Día 2 — Estado de resultados Año 1 (13 líneas, orden de un P&G real)
  { id: "p1_primaEmitida", dia: "d2", perfil: "fin", tipo: "reporte", label: "Prima emitida A1", unit: "COP", group: "pyg_a1", get: (b) => b.p1.primaEmitida },
  {
    id: "p1_rpndConstituida",
    dia: "d2",
    perfil: "fin",
    tipo: "reporte",
    label: "RPND constituida A1",
    unit: "COP",
    group: "pyg_a1",
    get: (b) => b.p1.rpndConstituida,
    formula: { kind: "linear", terms: [{ conceptId: "p1_primaEmitida", coeff: 0.2 }] },
  },
  {
    id: "p1_primaDevengada",
    dia: "d2",
    perfil: "fin",
    tipo: "reporte",
    label: "Prima devengada A1",
    unit: "COP",
    group: "pyg_a1",
    get: (b) => b.p1.primaDevengada,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p1_primaEmitida", coeff: 1 },
        { conceptId: "p1_rpndConstituida", coeff: -1 },
      ],
    },
  },
  { id: "p1_costo", dia: "d2", perfil: "fin", tipo: "reporte", label: "Costo de siniestros A1", unit: "COP", group: "pyg_a1", get: (b) => b.p1.costo },
  {
    id: "p1_gadq",
    dia: "d2",
    perfil: "fin",
    tipo: "reporte",
    label: "Gastos de adquisición A1",
    unit: "COP",
    group: "pyg_a1",
    get: (b) => b.p1.gadq,
    formula: { kind: "linear", terms: [{ conceptId: "p1_primaEmitida", coeff: 0.04 }] },
  },
  {
    id: "p1_gcom",
    dia: "d2",
    perfil: "fin",
    tipo: "reporte",
    label: "Comisiones A1",
    unit: "COP",
    group: "pyg_a1",
    get: (b) => b.p1.gcom,
    formula: { kind: "linear", terms: [{ conceptId: "p1_primaEmitida", coeff: 0.15 }] },
  },
  {
    id: "p1_rt",
    dia: "d2",
    perfil: "fin",
    tipo: "reporte",
    label: "Resultado Técnico A1",
    unit: "COP",
    group: "pyg_a1",
    get: (b) => b.p1.rt,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p1_primaDevengada", coeff: 1 },
        { conceptId: "p1_costo", coeff: -1 },
        { conceptId: "p1_gadq", coeff: -1 },
        { conceptId: "p1_gcom", coeff: -1 },
      ],
    },
  },
  {
    id: "p1_gadm",
    dia: "d2",
    perfil: "fin",
    tipo: "reporte",
    label: "Gastos administrativos A1",
    unit: "COP",
    group: "pyg_a1",
    get: (b) => b.p1.gadm,
    formula: { kind: "linear", terms: [{ conceptId: "p1_primaEmitida", coeff: 0.06 }] },
  },
  {
    id: "p1_ri",
    dia: "d2",
    perfil: "fin",
    tipo: "reporte",
    label: "Resultado Industrial A1",
    unit: "COP",
    group: "pyg_a1",
    get: (b) => b.p1.ri,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p1_rt", coeff: 1 },
        { conceptId: "p1_gadm", coeff: -1 },
      ],
    },
  },
  { id: "p1_rinv", dia: "d2", perfil: "fin", tipo: "reporte", label: "Resultado de inversiones A1", unit: "COP", group: "pyg_a1", get: (b) => b.p1.rinv },
  {
    id: "p1_uai",
    dia: "d2",
    perfil: "fin",
    tipo: "reporte",
    label: "Utilidad antes de impuestos A1",
    unit: "COP",
    group: "pyg_a1",
    get: (b) => b.p1.uai,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p1_ri", coeff: 1 },
        { conceptId: "p1_rinv", coeff: 1 },
      ],
    },
  },
  {
    id: "p1_imp",
    dia: "d2",
    perfil: "fin",
    tipo: "reporte",
    label: "Impuesto A1",
    unit: "COP",
    group: "pyg_a1",
    get: (b) => b.p1.imp,
    formula: { kind: "taxOnUai", uaiConceptId: "p1_uai", rate: 0.3 },
  },
  {
    id: "p1_uneta",
    dia: "d2",
    perfil: "fin",
    tipo: "reporte",
    label: "Utilidad neta A1",
    unit: "COP",
    group: "pyg_a1",
    get: (b) => b.p1.uneta,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p1_uai", coeff: 1 },
        { conceptId: "p1_imp", coeff: -1 },
      ],
    },
  },
  { id: "alm_calce", dia: "d2", perfil: "fin", tipo: "auto_alm", label: "Calce ALM del portafolio", unit: "score" },

  // Día 3 — Estado de resultados Año 2 (15 líneas — libera la RPND de Año 1, constituye la propia, y carga el ajuste de siniestralidad de Año 1)
  { id: "p2_primaEmitida", dia: "d3", perfil: "fin", tipo: "reporte", label: "Prima emitida A2", unit: "COP", group: "pyg_a2", get: (b) => b.p2?.primaEmitida ?? null },
  {
    id: "p2_rpndLiberada",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "RPND liberada (A1)",
    unit: "COP",
    group: "pyg_a2",
    get: (b) => b.p2?.rpndLiberada ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p1_primaEmitida", coeff: 0.2, day: "d2" }] },
  },
  {
    id: "p2_rpndConstituida",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "RPND constituida A2",
    unit: "COP",
    group: "pyg_a2",
    get: (b) => b.p2?.rpndConstituida ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p2_primaEmitida", coeff: 0.2 }] },
  },
  {
    id: "p2_primaDevengada",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Prima devengada A2",
    unit: "COP",
    group: "pyg_a2",
    get: (b) => b.p2?.primaDevengada ?? null,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p2_primaEmitida", coeff: 1 },
        { conceptId: "p2_rpndConstituida", coeff: -1 },
        { conceptId: "p2_rpndLiberada", coeff: 1 },
      ],
    },
  },
  { id: "p2_costo", dia: "d3", perfil: "fin", tipo: "reporte", label: "Costo de siniestros A2", unit: "COP", group: "pyg_a2", get: (b) => b.p2?.costo ?? null },
  {
    id: "p2_ajusteSiniestralidad",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Ajuste de siniestralidad A1",
    unit: "COP",
    group: "pyg_a2",
    // A fixed, one-time release: −10% × the true reserva técnica A1
    // (bal1_reservasTec's own true value, via useTrueValue) — narrated in
    // the Guía del Pasante as an actuarial-team review finding that 2027's
    // remaining unpaid severity was overestimated by that 10%. Reported as
    // a negative number (a release, not a cost); independent of whatever
    // the team itself submitted for Costo de Siniestros A1 back on Día 2 —
    // not a correction of that guess.
    get: (b) => -FZ.sevRevisionA1Pct * b.bal1.reservasTec,
    formula: {
      kind: "linear",
      terms: [{ conceptId: "bal1_reservasTec", coeff: -FZ.sevRevisionA1Pct, useTrueValue: true }],
    },
  },
  {
    id: "p2_gadq",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Gastos de adquisición A2",
    unit: "COP",
    group: "pyg_a2",
    get: (b) => b.p2?.gadq ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p2_primaEmitida", coeff: 0.04 }] },
  },
  {
    id: "p2_gcom",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Comisiones A2",
    unit: "COP",
    group: "pyg_a2",
    get: (b) => b.p2?.gcom ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p2_primaEmitida", coeff: 0.15 }] },
  },
  {
    id: "p2_rt",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Resultado Técnico A2",
    unit: "COP",
    group: "pyg_a2",
    get: (b) => b.p2?.rt ?? null,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p2_primaDevengada", coeff: 1 },
        { conceptId: "p2_costo", coeff: -1 },
        { conceptId: "p2_ajusteSiniestralidad", coeff: -1 },
        { conceptId: "p2_gadq", coeff: -1 },
        { conceptId: "p2_gcom", coeff: -1 },
      ],
    },
  },
  {
    id: "p2_gadm",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Gastos administrativos A2",
    unit: "COP",
    group: "pyg_a2",
    get: (b) => b.p2?.gadm ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p2_primaEmitida", coeff: 0.06 }] },
  },
  {
    id: "p2_ri",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Resultado Industrial A2",
    unit: "COP",
    group: "pyg_a2",
    get: (b) => b.p2?.ri ?? null,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p2_rt", coeff: 1 },
        { conceptId: "p2_gadm", coeff: -1 },
      ],
    },
  },
  { id: "p2_rinv", dia: "d3", perfil: "fin", tipo: "reporte", label: "Resultado de inversiones A2", unit: "COP", group: "pyg_a2", get: (b) => b.p2?.rinv ?? null },
  {
    id: "p2_uai",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Utilidad antes de impuestos A2",
    unit: "COP",
    group: "pyg_a2",
    get: (b) => b.p2?.uai ?? null,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p2_ri", coeff: 1 },
        { conceptId: "p2_rinv", coeff: 1 },
      ],
    },
  },
  {
    id: "p2_imp",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Impuesto A2",
    unit: "COP",
    group: "pyg_a2",
    get: (b) => b.p2?.imp ?? null,
    formula: { kind: "taxOnUai", uaiConceptId: "p2_uai", rate: 0.3 },
  },
  {
    id: "p2_uneta",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Utilidad neta A2",
    unit: "COP",
    group: "pyg_a2",
    get: (b) => b.p2?.uneta ?? null,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p2_uai", coeff: 1 },
        { conceptId: "p2_imp", coeff: -1 },
      ],
    },
  },
  // Nota de auditoría actuarial, no una línea del P&G — ver README §4: caja
  // efectivamente pagada durante el Año 2 (flujo de caja), distinto del
  // costo incurrido (base contable, ya recogido en p2_costo/p2_ajusteSiniestralidad).
  { id: "p2_pagos", dia: "d3", perfil: "fin", tipo: "reporte", label: "Siniestros pagados en A2 (caja, no se suma al P&G)", unit: "COP", get: (b) => b.p2?.pagos ?? null },

  // Día 3 — Estado de resultados Año 3 (proyectado, 14 líneas — libera la RPND de Año 2, constituye la propia; sin línea de ajuste de siniestralidad, ver README §4)
  { id: "p3_primaEmitida", dia: "d3", perfil: "fin", tipo: "reporte", label: "Prima emitida A3 (proy.)", unit: "COP", group: "pyg_a3", get: (b) => b.p3?.primaEmitida ?? null },
  {
    id: "p3_rpndLiberada",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "RPND liberada (A2)",
    unit: "COP",
    group: "pyg_a3",
    get: (b) => b.p3?.rpndLiberada ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p2_primaEmitida", coeff: 0.2 }] },
  },
  {
    id: "p3_rpndConstituida",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "RPND constituida A3 (proy.)",
    unit: "COP",
    group: "pyg_a3",
    get: (b) => b.p3?.rpndConstituida ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p3_primaEmitida", coeff: 0.2 }] },
  },
  {
    id: "p3_primaDevengada",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Prima devengada A3 (proy.)",
    unit: "COP",
    group: "pyg_a3",
    get: (b) => b.p3?.primaDevengada ?? null,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p3_primaEmitida", coeff: 1 },
        { conceptId: "p3_rpndConstituida", coeff: -1 },
        { conceptId: "p3_rpndLiberada", coeff: 1 },
      ],
    },
  },
  { id: "p3_costo", dia: "d3", perfil: "fin", tipo: "reporte", label: "Costo de siniestros A3 (proy.)", unit: "COP", group: "pyg_a3", get: (b) => b.p3?.costo ?? null },
  {
    id: "p3_gadq",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Gastos de adquisición A3 (proy.)",
    unit: "COP",
    group: "pyg_a3",
    get: (b) => b.p3?.gadq ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p3_primaEmitida", coeff: 0.04 }] },
  },
  {
    id: "p3_gcom",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Comisiones A3 (proy.)",
    unit: "COP",
    group: "pyg_a3",
    get: (b) => b.p3?.gcom ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p3_primaEmitida", coeff: 0.15 }] },
  },
  {
    id: "p3_rt",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Resultado Técnico A3 (proy.)",
    unit: "COP",
    group: "pyg_a3",
    get: (b) => b.p3?.rt ?? null,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p3_primaDevengada", coeff: 1 },
        { conceptId: "p3_costo", coeff: -1 },
        { conceptId: "p3_gadq", coeff: -1 },
        { conceptId: "p3_gcom", coeff: -1 },
      ],
    },
  },
  {
    id: "p3_gadm",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Gastos administrativos A3 (proy.)",
    unit: "COP",
    group: "pyg_a3",
    get: (b) => b.p3?.gadm ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p3_primaEmitida", coeff: 0.06 }] },
  },
  {
    id: "p3_ri",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Resultado Industrial A3 (proy.)",
    unit: "COP",
    group: "pyg_a3",
    get: (b) => b.p3?.ri ?? null,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p3_rt", coeff: 1 },
        { conceptId: "p3_gadm", coeff: -1 },
      ],
    },
  },
  { id: "p3_rinv", dia: "d3", perfil: "fin", tipo: "reporte", label: "Resultado de inversiones A3 (proy.)", unit: "COP", group: "pyg_a3", get: (b) => b.p3?.rinv ?? null },
  {
    id: "p3_uai",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Utilidad antes de impuestos A3 (proy.)",
    unit: "COP",
    group: "pyg_a3",
    get: (b) => b.p3?.uai ?? null,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p3_ri", coeff: 1 },
        { conceptId: "p3_rinv", coeff: 1 },
      ],
    },
  },
  {
    id: "p3_imp",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Impuesto A3 (proy.)",
    unit: "COP",
    group: "pyg_a3",
    get: (b) => b.p3?.imp ?? null,
    formula: { kind: "taxOnUai", uaiConceptId: "p3_uai", rate: 0.3 },
  },
  {
    id: "p3_uneta",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Utilidad neta A3 (proy.)",
    unit: "COP",
    group: "pyg_a3",
    get: (b) => b.p3?.uneta ?? null,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p3_uai", coeff: 1 },
        { conceptId: "p3_imp", coeff: -1 },
      ],
    },
  },

  // Día 3 — Balance Año 1 (10 líneas — las %-de-prima cruzan a Día 2's Prima Emitida A1)
  {
    id: "bal1_caja",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Caja A1",
    unit: "COP",
    group: "bal_a1",
    get: (b) => b.bal1.caja,
    // No formula: caja is now the real ALM's own year-end Caja Mínima
    // balance, not a flat % of primaEmitida — not derivable from other
    // reported lines, same treatment as reservasTec/Costo de Siniestros
    // (a primary fact the team estimates from its own portfolio decisions,
    // graded against the true engine value with a tolerance band).
  },
  {
    id: "bal1_inversiones",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Inversiones (valor del portafolio) A1",
    unit: "COP",
    group: "bal_a1",
    get: (b) => b.bal1.inversiones,
    // No formula: inversiones is the real ALM's own portfolio book value
    // plus Capital Social not committed to cover a cash shortfall (floored
    // at 0 — see bal1_necesidadesPatrimonioODeuda for what happens beyond
    // that floor) — a real economic fact, never a plug that balances the
    // sheet. Same "primary fact" treatment as caja above.
  },
  {
    id: "bal1_cxc",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Cuentas por cobrar A1",
    unit: "COP",
    group: "bal_a1",
    get: (b) => b.bal1.cxc,
    formula: { kind: "linear", terms: [{ conceptId: "p1_primaEmitida", coeff: 30 / 365, day: "d2" }] },
  },
  {
    id: "bal1_activos",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Activos totales A1",
    unit: "COP",
    group: "bal_a1",
    get: (b) => b.bal1.activos,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal1_caja", coeff: 1 },
        { conceptId: "bal1_inversiones", coeff: 1 },
        { conceptId: "bal1_cxc", coeff: 1 },
      ],
    },
  },
  { id: "bal1_reservasTec", dia: "d3", perfil: "act", tipo: "reporte", label: "Reservas técnicas A1", unit: "COP", group: "bal_a1", get: (b) => b.bal1.reservasTec },
  {
    id: "bal1_rpnd",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "RPND A1",
    unit: "COP",
    group: "bal_a1",
    get: (b) => b.bal1.rpnd,
    formula: { kind: "linear", terms: [{ conceptId: "p1_rpndConstituida", coeff: 1, day: "d2" }] },
  },
  {
    id: "bal1_cxp",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Cuentas por pagar A1",
    unit: "COP",
    group: "bal_a1",
    get: (b) => b.bal1.cxp,
    formula: { kind: "linear", terms: [{ conceptId: "p1_primaEmitida", coeff: 0.1, day: "d2" }] },
  },
  {
    id: "bal1_necesidadesPatrimonioODeuda",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Necesidades de patrimonio o deuda A1",
    unit: "COP",
    group: "bal_a1",
    get: (b) => b.bal1.necesidadesPatrimonioODeuda,
    // No formula: only nonzero once a team draws more Capital Social than it
    // started with — a primary fact the team estimates from its own ALM
    // reasoning, not a canned linear formula (see
    // BalanceSheet.necesidadesPatrimonioODeuda's doc comment). Lives on the
    // liability side (feeds bal1_pasivo below), not activos.
  },
  {
    id: "bal1_pasivo",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Pasivo total A1",
    unit: "COP",
    group: "bal_a1",
    get: (b) => b.bal1.reservasTec + b.bal1.rpnd + b.bal1.cxp + b.bal1.necesidadesPatrimonioODeuda,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal1_reservasTec", coeff: 1 },
        { conceptId: "bal1_rpnd", coeff: 1 },
        { conceptId: "bal1_cxp", coeff: 1 },
        { conceptId: "bal1_necesidadesPatrimonioODeuda", coeff: 1 },
      ],
    },
  },
  { id: "bal1_patrim", dia: "d3", perfil: "fin", tipo: "reporte", label: "Patrimonio A1", unit: "COP", group: "bal_a1", get: (b) => b.bal1.patrimonio },
  {
    id: "bal1_pasivoPatrim",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Pasivo + Patrimonio A1",
    unit: "COP",
    group: "bal_a1",
    get: (b) => b.bal1.reservasTec + b.bal1.rpnd + b.bal1.cxp + b.bal1.necesidadesPatrimonioODeuda + b.bal1.patrimonio,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal1_pasivo", coeff: 1 },
        { conceptId: "bal1_patrim", coeff: 1 },
      ],
    },
  },

  // Día 3 — Balance Año 2 (10 líneas — mismo día que p2_primaEmitida, sin cruce de día)
  {
    id: "bal2_caja",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Caja A2",
    unit: "COP",
    group: "bal_a2",
    get: (b) => b.bal2?.caja ?? null,
    // No formula — see bal1_caja's doc comment.
  },
  {
    id: "bal2_inversiones",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Inversiones (valor del portafolio) A2",
    unit: "COP",
    group: "bal_a2",
    get: (b) => b.bal2?.inversiones ?? null,
    // No formula — see bal1_inversiones's doc comment.
  },
  {
    id: "bal2_cxc",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Cuentas por cobrar A2",
    unit: "COP",
    group: "bal_a2",
    get: (b) => b.bal2?.cxc ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p2_primaEmitida", coeff: 30 / 365 }] },
  },
  {
    id: "bal2_activos",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Activos totales A2",
    unit: "COP",
    group: "bal_a2",
    get: (b) => b.bal2?.activos ?? null,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal2_caja", coeff: 1 },
        { conceptId: "bal2_inversiones", coeff: 1 },
        { conceptId: "bal2_cxc", coeff: 1 },
      ],
    },
  },
  { id: "bal2_reservasTec", dia: "d3", perfil: "act", tipo: "reporte", label: "Reservas técnicas A2", unit: "COP", group: "bal_a2", get: (b) => b.bal2?.reservasTec ?? null },
  {
    id: "bal2_rpnd",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "RPND A2",
    unit: "COP",
    group: "bal_a2",
    get: (b) => b.bal2?.rpnd ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p2_rpndConstituida", coeff: 1 }] },
  },
  {
    id: "bal2_cxp",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Cuentas por pagar A2",
    unit: "COP",
    group: "bal_a2",
    get: (b) => b.bal2?.cxp ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p2_primaEmitida", coeff: 0.1 }] },
  },
  {
    id: "bal2_necesidadesPatrimonioODeuda",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Necesidades de patrimonio o deuda A2",
    unit: "COP",
    group: "bal_a2",
    get: (b) => b.bal2?.necesidadesPatrimonioODeuda ?? null,
    // No formula — see bal1_necesidadesPatrimonioODeuda's doc comment.
  },
  {
    id: "bal2_pasivo",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Pasivo total A2",
    unit: "COP",
    group: "bal_a2",
    get: (b) => (b.bal2 ? b.bal2.reservasTec + b.bal2.rpnd + b.bal2.cxp + b.bal2.necesidadesPatrimonioODeuda : null),
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal2_reservasTec", coeff: 1 },
        { conceptId: "bal2_rpnd", coeff: 1 },
        { conceptId: "bal2_cxp", coeff: 1 },
        { conceptId: "bal2_necesidadesPatrimonioODeuda", coeff: 1 },
      ],
    },
  },
  { id: "bal2_patrim", dia: "d3", perfil: "fin", tipo: "reporte", label: "Patrimonio A2", unit: "COP", group: "bal_a2", get: (b) => b.bal2?.patrimonio ?? null },
  {
    id: "bal2_pasivoPatrim",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Pasivo + Patrimonio A2",
    unit: "COP",
    group: "bal_a2",
    get: (b) => (b.bal2 ? b.bal2.reservasTec + b.bal2.rpnd + b.bal2.cxp + b.bal2.necesidadesPatrimonioODeuda + b.bal2.patrimonio : null),
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal2_pasivo", coeff: 1 },
        { conceptId: "bal2_patrim", coeff: 1 },
      ],
    },
  },

  // Día 3 — Balance Año 3 (proyectado, 10 líneas) — reservas técnicas aquí son proyección mecánica, no reserving genuino, por eso perfil "fin"
  {
    id: "bal3_caja",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Caja A3 (proy.)",
    unit: "COP",
    group: "bal_a3",
    get: (b) => b.bal3?.caja ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p3_primaEmitida", coeff: 0.15 }] },
  },
  {
    id: "bal3_inversiones",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Inversiones (valor del portafolio) A3 (proy.)",
    unit: "COP",
    group: "bal_a3",
    get: (b) => b.bal3?.inversiones ?? null,
    // No formula — see bal1_inversiones's doc comment. Año 3 has no real ALM
    // run of its own (never simulated, see README §4.2) and every other line
    // of its Balance is already a mechanical projection, so unlike Año 1/2
    // this one solves for whatever value closes Activos = Pasivo + Patrimonio
    // exactly (see finBench()'s doc comment on bal3 for the two approaches
    // that were tried and rejected first) — still a primary estimated fact,
    // not a formula of other reported lines.
  },
  {
    id: "bal3_cxc",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Cuentas por cobrar A3 (proy.)",
    unit: "COP",
    group: "bal_a3",
    get: (b) => b.bal3?.cxc ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p3_primaEmitida", coeff: 30 / 365 }] },
  },
  {
    id: "bal3_activos",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Activos totales A3 (proy.)",
    unit: "COP",
    group: "bal_a3",
    get: (b) => b.bal3?.activos ?? null,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal3_caja", coeff: 1 },
        { conceptId: "bal3_inversiones", coeff: 1 },
        { conceptId: "bal3_cxc", coeff: 1 },
      ],
    },
  },
  { id: "bal3_reservasTec", dia: "d3", perfil: "fin", tipo: "reporte", label: "Reservas técnicas A3 (proy.)", unit: "COP", group: "bal_a3", get: (b) => b.bal3?.reservasTec ?? null },
  {
    id: "bal3_rpnd",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "RPND A3 (proy.)",
    unit: "COP",
    group: "bal_a3",
    get: (b) => b.bal3?.rpnd ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p3_rpndConstituida", coeff: 1 }] },
  },
  {
    id: "bal3_cxp",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Cuentas por pagar A3 (proy.)",
    unit: "COP",
    group: "bal_a3",
    get: (b) => b.bal3?.cxp ?? null,
    formula: { kind: "linear", terms: [{ conceptId: "p3_primaEmitida", coeff: 0.1 }] },
  },
  {
    id: "bal3_necesidadesPatrimonioODeuda",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Necesidades de patrimonio o deuda A3 (proy.)",
    unit: "COP",
    group: "bal_a3",
    get: (b) => b.bal3?.necesidadesPatrimonioODeuda ?? null,
    // No formula — see bal1_necesidadesPatrimonioODeuda's doc comment.
  },
  {
    id: "bal3_pasivo",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Pasivo total A3 (proy.)",
    unit: "COP",
    group: "bal_a3",
    get: (b) => (b.bal3 ? b.bal3.reservasTec + b.bal3.rpnd + b.bal3.cxp + b.bal3.necesidadesPatrimonioODeuda : null),
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal3_reservasTec", coeff: 1 },
        { conceptId: "bal3_rpnd", coeff: 1 },
        { conceptId: "bal3_cxp", coeff: 1 },
        { conceptId: "bal3_necesidadesPatrimonioODeuda", coeff: 1 },
      ],
    },
  },
  { id: "bal3_patrim", dia: "d3", perfil: "fin", tipo: "reporte", label: "Patrimonio A3 (proy.)", unit: "COP", group: "bal_a3", get: (b) => b.bal3?.patrimonio ?? null },
  {
    id: "bal3_pasivoPatrim",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Pasivo + Patrimonio A3 (proy.)",
    unit: "COP",
    group: "bal_a3",
    get: (b) => (b.bal3 ? b.bal3.reservasTec + b.bal3.rpnd + b.bal3.cxp + b.bal3.necesidadesPatrimonioODeuda + b.bal3.patrimonio : null),
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal3_pasivo", coeff: 1 },
        { conceptId: "bal3_patrim", coeff: 1 },
      ],
    },
  },

  {
    id: "sol_sigmaLR",
    dia: "d4",
    perfil: "fin",
    tipo: "reporte",
    label: "σ Siniestralidad (volatilidad de prima)",
    unit: "x",
    // True value: sample stdev of costo/primaDevengada across Año 1/2/3, computed
    // once inside finBench() itself (same number driving its own rPrimas — see
    // FinBenchResult.solSigmaLR) — never recomputed separately here, so the
    // reported concept and the engine's own RK calculation can't drift apart.
    get: (b) => b.solSigmaLR,
    // Graded against the team's OWN P&G lines, not the truth directly: Año 1's
    // loss ratio uses its own reported Costo/Prima Devengada A1 CORRECTED by its
    // own Día-3 Ajuste de siniestralidad (see LossRatioYearSpec's doc comment),
    // Año 2 and Año 3 use their own reported Costo/Prima Devengada as-is. Prima
    // Devengada (not Emitida) in the denominator — loss ratio is a performance
    // measure of what was actually earned, matching solSigmaLR's own true-value
    // basis above and computeRt()/RT's (see composite.ts).
    formula: {
      kind: "sampleStdevLossRatio",
      years: [
        { costConceptId: "p1_costo", premiumConceptId: "p1_primaDevengada", day: "d2", adjustmentConceptId: "p2_ajusteSiniestralidad", adjustmentDay: "d3" },
        { costConceptId: "p2_costo", premiumConceptId: "p2_primaDevengada", day: "d3" },
        { costConceptId: "p3_costo", premiumConceptId: "p3_primaDevengada", day: "d3" },
      ],
    },
  },
  { id: "sol_rk", dia: "d4", perfil: "fin", tipo: "reporte", label: "Requerimiento de Capital", unit: "COP", get: (b) => b.solRk },
  { id: "sol_fp", dia: "d4", perfil: "fin", tipo: "reporte", label: "Fondos propios", unit: "COP", get: (b) => b.solFp },
  { id: "sol_margen", dia: "d4", perfil: "fin", tipo: "reporte", label: "Margen de solvencia", unit: "x", get: (b) => b.solMargen },
  { id: "div", dia: "d4", perfil: "fin", tipo: "reporte", label: "Dividendos posibles", unit: "COP", get: (b) => b.div },
  {
    id: "eva",
    dia: "d4",
    perfil: "fin",
    tipo: "reporte",
    label: "EVA — Valor Económico Agregado",
    unit: "COP",
    // Classic corporate-finance EVA (capital invertido = fondos propios/patrimonio, not
    // the Solvency-II solRk requirement — see FZ.costoCapital's own comment for why):
    // Utilidad Neta del año vigente (Año 2 si ya existe, si no Año 1 — mismo "año
    // vigente" que solFp/solMargen) menos el costo de oportunidad de mantener ese
    // patrimonio invertido en la aseguradora.
    get: (b) => (b.p2 ? b.p2.uneta : b.p1.uneta) - FZ.costoCapital * b.solFp,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "p2_uneta", coeff: 1, day: "d3" },
        { conceptId: "sol_fp", coeff: -FZ.costoCapital },
      ],
    },
  },
  // Riesgo de tasa/inflación: adverse-direction NAV move (Activo − Pasivo)
  // at end of Año 2 under a real-curve/implied-inflation shock — see
  // computeMarketRiskAtAño2End() in alm.ts. Riesgo de acciones: exposición
  // (ACC book value at end of Año 2) × ACC_STRESS_PCT — see finBench.ts's
  // solRAcciones, which also folds into solRk/sol_margen above.
  { id: "riesgo_tasa", dia: "d4", perfil: "fin", tipo: "reporte", label: "Riesgo de tasa", unit: "COP", get: (b) => b.riesgoTasa },
  { id: "riesgo_inflacion", dia: "d4", perfil: "fin", tipo: "reporte", label: "Riesgo de inflación", unit: "COP", get: (b) => b.riesgoInflacion },
  { id: "riesgo_acciones", dia: "d4", perfil: "fin", tipo: "reporte", label: "Riesgo de acciones", unit: "COP", get: (b) => b.solRAcciones },
  { id: "analitica", dia: "d4", perfil: "act", tipo: "auto_analitica", label: "Analítica sectorial", unit: "score" },
];

export const CONCEPTO_BY_ID: Record<string, Concepto> = Object.fromEntries(CONCEPTOS.map((c) => [c.id, c]));

export function conceptosDia(dia: Dia, perfil?: Perfil): Concepto[] {
  return CONCEPTOS.filter((c) => c.dia === dia && (!perfil || c.perfil === perfil));
}

export interface ConceptTolerance {
  tolerancePerfect: number;
  toleranceZero: number;
}

export interface ConceptScoreResult {
  val: number | null;
  bench: number | null;
  score: number | null;
}

/**
 * Tolerance-band scoring shared by every numeric estimate this platform
 * grades against a computed benchmark: 100 if the relative error is within
 * `tolerancePerfect`, 0 once it reaches `toleranceZero`, linear in between.
 * Extracted out of scoreConcepto() so scorers outside the "reporte" concept
 * shape (e.g. a Día 4 sector's estimated multiplier, see scoreSectorPicks()
 * in sectors.ts) use the exact same formula instead of a parallel copy.
 */
export function toleranceBandScore(submittedValue: number, benchmarkValue: number, tolerance: ConceptTolerance): number {
  const err = Math.abs(submittedValue - benchmarkValue) / Math.max(Math.abs(benchmarkValue), 1e-9);
  if (err <= tolerance.tolerancePerfect) return 100;
  if (err >= tolerance.toleranceZero) return 0;
  return 100 * (1 - (err - tolerance.tolerancePerfect) / (tolerance.toleranceZero - tolerance.tolerancePerfect));
}

/**
 * Key format for the "own submitted values" lookup scoreFormulaConcepto()
 * (and scoreConcepto(), for formula concepts) reads from — `${day}:${conceptId}`,
 * covering every day at once (not just the day being graded), since a
 * handful of formulas genuinely reference a prior day's own submission
 * (e.g. Balance Año 1's %-of-premium lines and Año 2's RPND-liberada both
 * need Día 2's own Prima Emitida — see FormulaTerm's `day` field).
 */
export function ownValueKey(day: Dia, conceptId: string): string {
  return `${day}:${conceptId}`;
}

function evalFormula(spec: FormulaSpec, ownDay: Dia, ownValues: Map<string, number>, bench: FinBenchResult | null): number | null {
  if (spec.kind === "taxOnUai") {
    const uai = ownValues.get(ownValueKey(ownDay, spec.uaiConceptId));
    if (uai == null) return null;
    return spec.rate * Math.max(0, uai);
  }
  if (spec.kind === "sampleStdevLossRatio") {
    const ratios: number[] = [];
    for (const y of spec.years) {
      const cost = ownValues.get(ownValueKey(y.day ?? ownDay, y.costConceptId));
      const premium = ownValues.get(ownValueKey(y.day ?? ownDay, y.premiumConceptId));
      if (cost == null || premium == null || premium === 0) return null;
      let adjustedCost = cost;
      if (y.adjustmentConceptId) {
        const adj = ownValues.get(ownValueKey(y.adjustmentDay ?? y.day ?? ownDay, y.adjustmentConceptId));
        if (adj == null) return null;
        adjustedCost += adj;
      }
      ratios.push(adjustedCost / premium);
    }
    return sampleStdev(ratios);
  }
  let total = spec.constant ?? 0;
  for (const term of spec.terms) {
    const v = term.useTrueValue ? (bench ? (CONCEPTO_BY_ID[term.conceptId]?.get?.(bench) ?? null) : null) : ownValues.get(ownValueKey(term.day ?? ownDay, term.conceptId)) ?? null;
    if (v == null) return null;
    total += term.coeff * v;
  }
  return total;
}

/**
 * Grades a "formula" concept against a value recomputed from the team's OWN
 * other submitted lines (via its FormulaSpec) instead of the true bench —
 * see scoreConcepto()'s doc comment for why. Returns `{ score: null }` (not
 * a 0) when any required input is missing from `ownValues` — ungradable,
 * doesn't count, same convention as a blank submission elsewhere. `bench` is
 * only needed for formulas with a `useTrueValue` term (e.g. Ajuste de
 * siniestralidad) — pass `null` for formulas that don't have one.
 */
export function scoreFormulaConcepto(
  conceptoId: string,
  submittedValue: number | null,
  ownValues: Map<string, number>,
  tolerance: ConceptTolerance,
  bench: FinBenchResult | null = null
): ConceptScoreResult | null {
  const c = CONCEPTO_BY_ID[conceptoId];
  if (!c || !c.formula) return null;
  if (submittedValue == null) return { val: null, bench: null, score: null };
  const expected = evalFormula(c.formula, c.dia, ownValues, bench);
  if (expected == null) return { val: submittedValue, bench: null, score: null };
  return { val: submittedValue, bench: expected, score: toleranceBandScore(submittedValue, expected, tolerance) };
}

/**
 * Grades one uploaded "reporte" deliverable. Ported from scoreConcepto() in
 * the legacy prototype, line ~1227, since extended in two ways:
 *
 * 1. Deviation from the legacy: the original scoreConcepto() also dispatches
 *    `auto_alm`/`auto_analitica` concepts to scoreFinanciero()/scoreAnalitica()
 *    internally. Those two scorers need different inputs (a team's ALM
 *    allocation; segment loss ratios) that don't fit this function's signature
 *    without adding an awkward dependency on both modules, so callers should
 *    use scoreFinanciero(...).nota / scoreAnalitica(...) directly for those
 *    two concept ids instead of calling this function.
 * 2. When a concept has a `formula` (see Concepto.formula), grading dispatches
 *    to scoreFormulaConcepto() — comparing the submission against a value
 *    recomputed from the team's OWN other submitted lines, never the true
 *    bench — so one upstream mistake (e.g. a wrong Costo de Siniestros)
 *    doesn't also tank every line that's algebraically downstream of it
 *    (RT, RI, UAI, Impuesto, Utilidad Neta, and on the Balance side
 *    Activos/Pasivo/Pasivo+Patrimonio/Inversiones). `bench` in the returned
 *    result still carries the true engine value when `get()` is present —
 *    informational only for these concepts, not what `score` is computed
 *    against. Callers that don't yet have an `ownValues` map for a formula
 *    concept should pass an empty Map — it grades as `null` (ungradable),
 *    the same as any other missing input, not a silent fallback to the old
 *    bench-comparison behavior.
 */
export function scoreConcepto(
  conceptoId: string,
  submittedValue: number | null,
  bench: FinBenchResult | null,
  tolerance: ConceptTolerance,
  ownValues?: Map<string, number>
): ConceptScoreResult | null {
  const c = CONCEPTO_BY_ID[conceptoId];
  if (!c || c.tipo !== "reporte") return null;
  const b = bench && c.get ? c.get(bench) : null;

  if (c.formula) {
    if (submittedValue == null) return { val: null, bench: b, score: null };
    const expected = evalFormula(c.formula, c.dia, ownValues ?? new Map(), bench);
    if (expected == null) return { val: submittedValue, bench: b, score: null };
    return { val: submittedValue, bench: b, score: toleranceBandScore(submittedValue, expected, tolerance) };
  }

  if (!c.get) return null;
  if (!bench || b == null) return { val: submittedValue, bench: null, score: null };
  if (submittedValue == null) return { val: null, bench: b, score: null };
  return { val: submittedValue, bench: b, score: toleranceBandScore(submittedValue, b, tolerance) };
}
