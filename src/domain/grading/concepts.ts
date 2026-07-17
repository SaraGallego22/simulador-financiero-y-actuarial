import type { FinBenchResult } from "../finance/finBench";

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

/** One term of a linear FormulaSpec: `coeff × (the team's own submitted value for conceptId)`. `day` defaults to the referencing concept's own `dia` — set explicitly only for a genuine cross-day reference (Balance Año 1's %-of-premium lines and Año 2's RPND-liberada both need Día 2's own Prima Emitida, submitted a day earlier). */
export interface FormulaTerm {
  conceptId: string;
  coeff: number;
  day?: Dia;
}

/**
 * How a "formula" concept's expected value is derived from the team's OWN
 * other submitted values (never from the true finBench() bench) — see
 * scoreConcepto()'s doc comment for why. `"linear"` covers every formula
 * line except Impuesto, which needs a `max(0, ·)` clamp before applying the
 * tax rate — `"taxOnUai"` is a dedicated small case for that one shape
 * rather than generalizing the whole spec for a single non-linear formula.
 */
export type FormulaSpec = { kind: "linear"; terms: FormulaTerm[]; constant?: number } | { kind: "taxOnUai"; uaiConceptId: string; rate: number };

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
 * Año 2 alone carries an extra "Desarrollo de reservas" line (Año 1's
 * booked reserve was a market-wide IBNR *estimate*, later checked against
 * reality — see development.ts). RT excludes Gasto Administrativo, which
 * lands on its own line feeding a new "Resultado Industrial" (RI) instead;
 * UAI = RI + Rendimiento de Inversiones (not RT + Rinv).
 *
 * Every line that's a pure formula of OTHER already-reported lines (RPND
 * constituida/liberada, Prima Devengada, the three expense lines, RT, RI,
 * UAI, Impuesto, Utilidad Neta, and on the Balance side Activos/Pasivo/
 * Pasivo+Patrimonio/Inversiones) carries a `formula` spec and is graded via
 * scoreFormulaConcepto() against the team's OWN other submitted values —
 * never against the true bench directly. This means one upstream mistake
 * (e.g. a wrong Costo) costs points exactly once, not once per downstream
 * line that algebraically depends on it. Only genuine primary facts/
 * estimates (Prima Emitida, Costo de Siniestros, Desarrollo de Reservas,
 * Resultado de Inversiones, Reservas Técnicas, Patrimonio) are graded
 * straight against the true finBench() value.
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

  // Día 3 — Estado de resultados Año 2 (15 líneas — libera la RPND de Año 1, constituye la propia, y carga el desarrollo de reservas de Año 1)
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
    id: "p2_desarrollo",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Desarrollo de reservas A1",
    unit: "COP",
    group: "pyg_a2",
    get: (b) => b.p2?.desarrollo ?? null,
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
        { conceptId: "p2_desarrollo", coeff: -1 },
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
  // costo incurrido (base contable, ya recogido en p2_costo/p2_desarrollo).
  { id: "p2_pagos", dia: "d3", perfil: "fin", tipo: "reporte", label: "Siniestros pagados en A2 (caja, no se suma al P&G)", unit: "COP", get: (b) => b.p2?.pagos ?? null },

  // Día 3 — Estado de resultados Año 3 (proyectado, 14 líneas — libera la RPND de Año 2, constituye la propia; sin línea de desarrollo, ver README §4)
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
    formula: { kind: "linear", terms: [{ conceptId: "p1_primaEmitida", coeff: 0.15, day: "d2" }] },
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
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal1_reservasTec", coeff: 1 },
        { conceptId: "bal1_rpnd", coeff: 1 },
        { conceptId: "bal1_cxp", coeff: 1 },
        { conceptId: "bal1_patrim", coeff: 1 },
        { conceptId: "bal1_caja", coeff: -1 },
        { conceptId: "bal1_cxc", coeff: -1 },
      ],
    },
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
    formula: { kind: "linear", terms: [{ conceptId: "p1_primaEmitida", coeff: 0.07, day: "d2" }] },
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
    id: "bal1_pasivo",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Pasivo total A1",
    unit: "COP",
    group: "bal_a1",
    get: (b) => b.bal1.reservasTec + b.bal1.rpnd + b.bal1.cxp,
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal1_reservasTec", coeff: 1 },
        { conceptId: "bal1_rpnd", coeff: 1 },
        { conceptId: "bal1_cxp", coeff: 1 },
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
    get: (b) => b.bal1.reservasTec + b.bal1.rpnd + b.bal1.cxp + b.bal1.patrimonio,
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
    formula: { kind: "linear", terms: [{ conceptId: "p2_primaEmitida", coeff: 0.15 }] },
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
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal2_reservasTec", coeff: 1 },
        { conceptId: "bal2_rpnd", coeff: 1 },
        { conceptId: "bal2_cxp", coeff: 1 },
        { conceptId: "bal2_patrim", coeff: 1 },
        { conceptId: "bal2_caja", coeff: -1 },
        { conceptId: "bal2_cxc", coeff: -1 },
      ],
    },
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
    formula: { kind: "linear", terms: [{ conceptId: "p2_primaEmitida", coeff: 0.07 }] },
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
    id: "bal2_pasivo",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Pasivo total A2",
    unit: "COP",
    group: "bal_a2",
    get: (b) => (b.bal2 ? b.bal2.reservasTec + b.bal2.rpnd + b.bal2.cxp : null),
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal2_reservasTec", coeff: 1 },
        { conceptId: "bal2_rpnd", coeff: 1 },
        { conceptId: "bal2_cxp", coeff: 1 },
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
    get: (b) => (b.bal2 ? b.bal2.reservasTec + b.bal2.rpnd + b.bal2.cxp + b.bal2.patrimonio : null),
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
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal3_reservasTec", coeff: 1 },
        { conceptId: "bal3_rpnd", coeff: 1 },
        { conceptId: "bal3_cxp", coeff: 1 },
        { conceptId: "bal3_patrim", coeff: 1 },
        { conceptId: "bal3_caja", coeff: -1 },
        { conceptId: "bal3_cxc", coeff: -1 },
      ],
    },
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
    formula: { kind: "linear", terms: [{ conceptId: "p3_primaEmitida", coeff: 0.07 }] },
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
    id: "bal3_pasivo",
    dia: "d3",
    perfil: "fin",
    tipo: "reporte",
    label: "Pasivo total A3 (proy.)",
    unit: "COP",
    group: "bal_a3",
    get: (b) => (b.bal3 ? b.bal3.reservasTec + b.bal3.rpnd + b.bal3.cxp : null),
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal3_reservasTec", coeff: 1 },
        { conceptId: "bal3_rpnd", coeff: 1 },
        { conceptId: "bal3_cxp", coeff: 1 },
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
    get: (b) => (b.bal3 ? b.bal3.reservasTec + b.bal3.rpnd + b.bal3.cxp + b.bal3.patrimonio : null),
    formula: {
      kind: "linear",
      terms: [
        { conceptId: "bal3_pasivo", coeff: 1 },
        { conceptId: "bal3_patrim", coeff: 1 },
      ],
    },
  },

  { id: "sol_rk", dia: "d4", perfil: "fin", tipo: "reporte", label: "Requerimiento de Capital", unit: "COP", get: (b) => b.solRk },
  { id: "sol_fp", dia: "d4", perfil: "fin", tipo: "reporte", label: "Fondos propios", unit: "COP", get: (b) => b.solFp },
  { id: "sol_margen", dia: "d4", perfil: "fin", tipo: "reporte", label: "Margen de solvencia", unit: "x", get: (b) => b.solMargen },
  { id: "div", dia: "d4", perfil: "fin", tipo: "reporte", label: "Dividendos posibles", unit: "COP", get: (b) => b.div },
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

function evalFormula(spec: FormulaSpec, ownDay: Dia, ownValues: Map<string, number>): number | null {
  if (spec.kind === "taxOnUai") {
    const uai = ownValues.get(ownValueKey(ownDay, spec.uaiConceptId));
    if (uai == null) return null;
    return spec.rate * Math.max(0, uai);
  }
  let total = spec.constant ?? 0;
  for (const term of spec.terms) {
    const v = ownValues.get(ownValueKey(term.day ?? ownDay, term.conceptId));
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
 * doesn't count, same convention as a blank submission elsewhere.
 */
export function scoreFormulaConcepto(
  conceptoId: string,
  submittedValue: number | null,
  ownValues: Map<string, number>,
  tolerance: ConceptTolerance
): ConceptScoreResult | null {
  const c = CONCEPTO_BY_ID[conceptoId];
  if (!c || !c.formula) return null;
  if (submittedValue == null) return { val: null, bench: null, score: null };
  const expected = evalFormula(c.formula, c.dia, ownValues);
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
    const expected = evalFormula(c.formula, c.dia, ownValues ?? new Map());
    if (expected == null) return { val: submittedValue, bench: b, score: null };
    return { val: submittedValue, bench: b, score: toleranceBandScore(submittedValue, expected, tolerance) };
  }

  if (!c.get) return null;
  if (!bench || b == null) return { val: submittedValue, bench: null, score: null };
  if (submittedValue == null) return { val: null, bench: b, score: null };
  return { val: submittedValue, bench: b, score: toleranceBandScore(submittedValue, b, tolerance) };
}
