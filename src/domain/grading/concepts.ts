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

export interface Concepto {
  id: string;
  dia: Dia;
  perfil: Perfil;
  tipo: ConceptType;
  label: string;
  unit: "COP" | "score" | "x";
  /** Only set on "reporte" concepts that belong to a full P&G/Balance statement — see ConceptGroup. */
  group?: ConceptGroup;
  get?: (bench: FinBenchResult) => number | null;
}

/**
 * Gradable financial/actuarial deliverables per day, ported verbatim from
 * CONCEPTOS in the legacy prototype, line ~1170. `auto_alm`/`auto_analitica`/
 * `auto_minvar` concepts don't have a `get()` — they're scored by
 * scoreFinanciero()/scoreAnalitica()/the minimum-variance scorer directly
 * (see the module doc comment on scoreConcepto() below for why that
 * dispatch isn't folded into this same function here).
 *
 * Día 2's deliverable is the full Año 1 P&G (10 lines, matching a real
 * income statement top to bottom) — no standalone reserves report anymore.
 * Día 3's deliverable is the full Año 2 P&G, the projected Año 3 P&G, and
 * the Balance for all three years (9 lines each, ending in the Pasivo +
 * Patrimonio check that must equal Activos totales) — reserves técnicas
 * for Año 1/Año 2 live inside their respective balance sheets instead
 * (`bal1_reservasTec`/`bal2_reservasTec`, still tagged `perfil: "act"`
 * since computing them correctly is still the actuarial skill being
 * tested, just presented as one line of a larger statement rather than a
 * standalone report). Año 3's reserves are a mechanical projection, not a
 * genuine reserving exercise, so `bal3_reservasTec` is `perfil: "fin"`.
 */
export const CONCEPTOS: Concepto[] = [
  { id: "minvar", dia: "d1", perfil: "fin", tipo: "auto_minvar", label: "Portafolio de mínima varianza", unit: "score" },

  // Día 2 — Estado de resultados Año 1 (10 líneas, orden de un P&G real)
  { id: "p1_prima", dia: "d2", perfil: "fin", tipo: "reporte", label: "Prima devengada A1", unit: "COP", group: "pyg_a1", get: (b) => b.p1.prima },
  { id: "p1_costo", dia: "d2", perfil: "fin", tipo: "reporte", label: "Costo de siniestros A1", unit: "COP", group: "pyg_a1", get: (b) => b.p1.costo },
  { id: "p1_gadq", dia: "d2", perfil: "fin", tipo: "reporte", label: "Gastos de adquisición A1", unit: "COP", group: "pyg_a1", get: (b) => b.p1.gadq },
  { id: "p1_gcom", dia: "d2", perfil: "fin", tipo: "reporte", label: "Comisiones A1", unit: "COP", group: "pyg_a1", get: (b) => b.p1.gcom },
  { id: "p1_gadm", dia: "d2", perfil: "fin", tipo: "reporte", label: "Gastos administrativos A1", unit: "COP", group: "pyg_a1", get: (b) => b.p1.gadm },
  { id: "p1_rt", dia: "d2", perfil: "fin", tipo: "reporte", label: "Resultado técnico A1", unit: "COP", group: "pyg_a1", get: (b) => b.p1.rt },
  { id: "p1_rinv", dia: "d2", perfil: "fin", tipo: "reporte", label: "Resultado de inversiones A1", unit: "COP", group: "pyg_a1", get: (b) => b.p1.rinv },
  { id: "p1_uai", dia: "d2", perfil: "fin", tipo: "reporte", label: "Utilidad antes de impuestos A1", unit: "COP", group: "pyg_a1", get: (b) => b.p1.uai },
  { id: "p1_imp", dia: "d2", perfil: "fin", tipo: "reporte", label: "Impuesto A1", unit: "COP", group: "pyg_a1", get: (b) => b.p1.imp },
  { id: "p1_uneta", dia: "d2", perfil: "fin", tipo: "reporte", label: "Utilidad neta A1", unit: "COP", group: "pyg_a1", get: (b) => b.p1.uneta },
  { id: "alm_calce", dia: "d2", perfil: "fin", tipo: "auto_alm", label: "Calce ALM del portafolio", unit: "score" },

  // Día 3 — Estado de resultados Año 2 (calendario, incluye desarrollo de A1)
  { id: "p2_prima", dia: "d3", perfil: "fin", tipo: "reporte", label: "Prima devengada A2", unit: "COP", group: "pyg_a2", get: (b) => b.p2?.prima ?? null },
  { id: "p2_costo", dia: "d3", perfil: "fin", tipo: "reporte", label: "Costo de siniestros A2", unit: "COP", group: "pyg_a2", get: (b) => b.p2?.costo ?? null },
  { id: "p2_gadq", dia: "d3", perfil: "fin", tipo: "reporte", label: "Gastos de adquisición A2", unit: "COP", group: "pyg_a2", get: (b) => b.p2?.gadq ?? null },
  { id: "p2_gcom", dia: "d3", perfil: "fin", tipo: "reporte", label: "Comisiones A2", unit: "COP", group: "pyg_a2", get: (b) => b.p2?.gcom ?? null },
  { id: "p2_gadm", dia: "d3", perfil: "fin", tipo: "reporte", label: "Gastos administrativos A2", unit: "COP", group: "pyg_a2", get: (b) => b.p2?.gadm ?? null },
  { id: "p2_rt", dia: "d3", perfil: "fin", tipo: "reporte", label: "Resultado técnico A2 (calendario)", unit: "COP", group: "pyg_a2", get: (b) => b.p2?.rt ?? null },
  { id: "p2_rinv", dia: "d3", perfil: "fin", tipo: "reporte", label: "Resultado de inversiones A2", unit: "COP", group: "pyg_a2", get: (b) => b.p2?.rinv ?? null },
  { id: "p2_uai", dia: "d3", perfil: "fin", tipo: "reporte", label: "Utilidad antes de impuestos A2", unit: "COP", group: "pyg_a2", get: (b) => b.p2?.uai ?? null },
  { id: "p2_imp", dia: "d3", perfil: "fin", tipo: "reporte", label: "Impuesto A2", unit: "COP", group: "pyg_a2", get: (b) => b.p2?.imp ?? null },
  { id: "p2_uneta", dia: "d3", perfil: "fin", tipo: "reporte", label: "Utilidad neta A2", unit: "COP", group: "pyg_a2", get: (b) => b.p2?.uneta ?? null },
  // Nota de auditoría actuarial, no líneas del P&G — ver README §4. p2_desarrollo
  // es un componente de p2_costo (costo = ultAcc + desarrollo), y p2_pagos es
  // caja pagada (flujo de caja), distinto del costo incurrido (base contable).
  { id: "p2_pagos", dia: "d3", perfil: "fin", tipo: "reporte", label: "Siniestros pagados en A2 (caja, no se suma al P&G)", unit: "COP", get: (b) => b.p2?.pagos ?? null },
  { id: "p2_desarrollo", dia: "d3", perfil: "fin", tipo: "reporte", label: "Desarrollo siniestros A1 (parte del Costo de siniestros A2)", unit: "COP", get: (b) => b.p2?.desarrollo ?? null },

  // Día 3 — Estado de resultados Año 3 (proyectado)
  { id: "p3_prima", dia: "d3", perfil: "fin", tipo: "reporte", label: "Prima devengada A3 (proy.)", unit: "COP", group: "pyg_a3", get: (b) => b.p3?.prima ?? null },
  { id: "p3_costo", dia: "d3", perfil: "fin", tipo: "reporte", label: "Costo de siniestros A3 (proy.)", unit: "COP", group: "pyg_a3", get: (b) => b.p3?.costo ?? null },
  { id: "p3_gadq", dia: "d3", perfil: "fin", tipo: "reporte", label: "Gastos de adquisición A3 (proy.)", unit: "COP", group: "pyg_a3", get: (b) => b.p3?.gadq ?? null },
  { id: "p3_gcom", dia: "d3", perfil: "fin", tipo: "reporte", label: "Comisiones A3 (proy.)", unit: "COP", group: "pyg_a3", get: (b) => b.p3?.gcom ?? null },
  { id: "p3_gadm", dia: "d3", perfil: "fin", tipo: "reporte", label: "Gastos administrativos A3 (proy.)", unit: "COP", group: "pyg_a3", get: (b) => b.p3?.gadm ?? null },
  { id: "p3_rt", dia: "d3", perfil: "fin", tipo: "reporte", label: "Resultado técnico A3 (proy.)", unit: "COP", group: "pyg_a3", get: (b) => b.p3?.rt ?? null },
  { id: "p3_rinv", dia: "d3", perfil: "fin", tipo: "reporte", label: "Resultado de inversiones A3 (proy.)", unit: "COP", group: "pyg_a3", get: (b) => b.p3?.rinv ?? null },
  { id: "p3_uai", dia: "d3", perfil: "fin", tipo: "reporte", label: "Utilidad antes de impuestos A3 (proy.)", unit: "COP", group: "pyg_a3", get: (b) => b.p3?.uai ?? null },
  { id: "p3_imp", dia: "d3", perfil: "fin", tipo: "reporte", label: "Impuesto A3 (proy.)", unit: "COP", group: "pyg_a3", get: (b) => b.p3?.imp ?? null },
  { id: "p3_uneta", dia: "d3", perfil: "fin", tipo: "reporte", label: "Utilidad neta A3 (proy.)", unit: "COP", group: "pyg_a3", get: (b) => b.p3?.uneta ?? null },

  // Día 3 — Balance Año 1
  { id: "bal1_caja", dia: "d3", perfil: "fin", tipo: "reporte", label: "Caja A1", unit: "COP", group: "bal_a1", get: (b) => b.bal1.caja },
  { id: "bal1_inversiones", dia: "d3", perfil: "fin", tipo: "reporte", label: "Inversiones (valor del portafolio) A1", unit: "COP", group: "bal_a1", get: (b) => b.bal1.inversiones },
  { id: "bal1_cxc", dia: "d3", perfil: "fin", tipo: "reporte", label: "Cuentas por cobrar A1", unit: "COP", group: "bal_a1", get: (b) => b.bal1.cxc },
  { id: "bal1_activos", dia: "d3", perfil: "fin", tipo: "reporte", label: "Activos totales A1", unit: "COP", group: "bal_a1", get: (b) => b.bal1.activos },
  { id: "bal1_reservasTec", dia: "d3", perfil: "act", tipo: "reporte", label: "Reservas técnicas A1", unit: "COP", group: "bal_a1", get: (b) => b.bal1.reservasTec },
  { id: "bal1_cxp", dia: "d3", perfil: "fin", tipo: "reporte", label: "Cuentas por pagar A1", unit: "COP", group: "bal_a1", get: (b) => b.bal1.cxp },
  { id: "bal1_pasivo", dia: "d3", perfil: "fin", tipo: "reporte", label: "Pasivo total A1", unit: "COP", group: "bal_a1", get: (b) => b.bal1.reservasTec + b.bal1.cxp },
  { id: "bal1_patrim", dia: "d3", perfil: "fin", tipo: "reporte", label: "Patrimonio A1", unit: "COP", group: "bal_a1", get: (b) => b.bal1.patrimonio },
  { id: "bal1_pasivoPatrim", dia: "d3", perfil: "fin", tipo: "reporte", label: "Pasivo + Patrimonio A1", unit: "COP", group: "bal_a1", get: (b) => b.bal1.reservasTec + b.bal1.cxp + b.bal1.patrimonio },

  // Día 3 — Balance Año 2
  { id: "bal2_caja", dia: "d3", perfil: "fin", tipo: "reporte", label: "Caja A2", unit: "COP", group: "bal_a2", get: (b) => b.bal2?.caja ?? null },
  { id: "bal2_inversiones", dia: "d3", perfil: "fin", tipo: "reporte", label: "Inversiones (valor del portafolio) A2", unit: "COP", group: "bal_a2", get: (b) => b.bal2?.inversiones ?? null },
  { id: "bal2_cxc", dia: "d3", perfil: "fin", tipo: "reporte", label: "Cuentas por cobrar A2", unit: "COP", group: "bal_a2", get: (b) => b.bal2?.cxc ?? null },
  { id: "bal2_activos", dia: "d3", perfil: "fin", tipo: "reporte", label: "Activos totales A2", unit: "COP", group: "bal_a2", get: (b) => b.bal2?.activos ?? null },
  { id: "bal2_reservasTec", dia: "d3", perfil: "act", tipo: "reporte", label: "Reservas técnicas A2", unit: "COP", group: "bal_a2", get: (b) => b.bal2?.reservasTec ?? null },
  { id: "bal2_cxp", dia: "d3", perfil: "fin", tipo: "reporte", label: "Cuentas por pagar A2", unit: "COP", group: "bal_a2", get: (b) => b.bal2?.cxp ?? null },
  { id: "bal2_pasivo", dia: "d3", perfil: "fin", tipo: "reporte", label: "Pasivo total A2", unit: "COP", group: "bal_a2", get: (b) => (b.bal2 ? b.bal2.reservasTec + b.bal2.cxp : null) },
  { id: "bal2_patrim", dia: "d3", perfil: "fin", tipo: "reporte", label: "Patrimonio A2", unit: "COP", group: "bal_a2", get: (b) => b.bal2?.patrimonio ?? null },
  { id: "bal2_pasivoPatrim", dia: "d3", perfil: "fin", tipo: "reporte", label: "Pasivo + Patrimonio A2", unit: "COP", group: "bal_a2", get: (b) => (b.bal2 ? b.bal2.reservasTec + b.bal2.cxp + b.bal2.patrimonio : null) },

  // Día 3 — Balance Año 3 (proyectado) — reservas técnicas aquí son proyección mecánica, no reserving genuino, por eso perfil "fin"
  { id: "bal3_caja", dia: "d3", perfil: "fin", tipo: "reporte", label: "Caja A3 (proy.)", unit: "COP", group: "bal_a3", get: (b) => b.bal3?.caja ?? null },
  { id: "bal3_inversiones", dia: "d3", perfil: "fin", tipo: "reporte", label: "Inversiones (valor del portafolio) A3 (proy.)", unit: "COP", group: "bal_a3", get: (b) => b.bal3?.inversiones ?? null },
  { id: "bal3_cxc", dia: "d3", perfil: "fin", tipo: "reporte", label: "Cuentas por cobrar A3 (proy.)", unit: "COP", group: "bal_a3", get: (b) => b.bal3?.cxc ?? null },
  { id: "bal3_activos", dia: "d3", perfil: "fin", tipo: "reporte", label: "Activos totales A3 (proy.)", unit: "COP", group: "bal_a3", get: (b) => b.bal3?.activos ?? null },
  { id: "bal3_reservasTec", dia: "d3", perfil: "fin", tipo: "reporte", label: "Reservas técnicas A3 (proy.)", unit: "COP", group: "bal_a3", get: (b) => b.bal3?.reservasTec ?? null },
  { id: "bal3_cxp", dia: "d3", perfil: "fin", tipo: "reporte", label: "Cuentas por pagar A3 (proy.)", unit: "COP", group: "bal_a3", get: (b) => b.bal3?.cxp ?? null },
  { id: "bal3_pasivo", dia: "d3", perfil: "fin", tipo: "reporte", label: "Pasivo total A3 (proy.)", unit: "COP", group: "bal_a3", get: (b) => (b.bal3 ? b.bal3.reservasTec + b.bal3.cxp : null) },
  { id: "bal3_patrim", dia: "d3", perfil: "fin", tipo: "reporte", label: "Patrimonio A3 (proy.)", unit: "COP", group: "bal_a3", get: (b) => b.bal3?.patrimonio ?? null },
  { id: "bal3_pasivoPatrim", dia: "d3", perfil: "fin", tipo: "reporte", label: "Pasivo + Patrimonio A3 (proy.)", unit: "COP", group: "bal_a3", get: (b) => (b.bal3 ? b.bal3.reservasTec + b.bal3.cxp + b.bal3.patrimonio : null) },

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
 * Grades one uploaded "reporte" deliverable against its computed benchmark
 * with a tolerance band (100 if error <= tolerancePerfect, 0 if error >=
 * toleranceZero, linear in between). Ported from scoreConcepto() in the
 * legacy prototype, line ~1227.
 *
 * Deviation from the legacy: the original scoreConcepto() also dispatches
 * `auto_alm`/`auto_analitica` concepts to scoreFinanciero()/scoreAnalitica()
 * internally. Those two scorers need different inputs (a team's ALM
 * allocation; segment loss ratios) that don't fit this function's signature
 * without adding an awkward dependency on both modules, so callers should use
 * scoreFinanciero(...).nota / scoreAnalitica(...) directly for those two
 * concept ids instead of calling this function.
 */
export function scoreConcepto(
  conceptoId: string,
  submittedValue: number | null,
  bench: FinBenchResult | null,
  tolerance: ConceptTolerance
): ConceptScoreResult | null {
  const c = CONCEPTO_BY_ID[conceptoId];
  if (!c || c.tipo !== "reporte" || !c.get) return null;
  if (!bench) return { val: submittedValue, bench: null, score: null };
  const b = c.get(bench);
  if (b == null) return { val: submittedValue, bench: null, score: null };
  if (submittedValue == null) return { val: null, bench: b, score: null };

  const err = Math.abs(submittedValue - b) / Math.max(Math.abs(b), 1e-9);
  let score: number;
  if (err <= tolerance.tolerancePerfect) score = 100;
  else if (err >= tolerance.toleranceZero) score = 0;
  else score = 100 * (1 - (err - tolerance.tolerancePerfect) / (tolerance.toleranceZero - tolerance.tolerancePerfect));

  return { val: submittedValue, bench: b, score };
}
