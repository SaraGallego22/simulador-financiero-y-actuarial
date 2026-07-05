import type { FinBenchResult } from "../finance/finBench";

export type Perfil = "act" | "fin";
export type Dia = "d1" | "d2" | "d3" | "d4";
export type ConceptType = "reporte" | "auto_alm" | "auto_analitica";

export interface Concepto {
  id: string;
  dia: Dia;
  perfil: Perfil;
  tipo: ConceptType;
  label: string;
  unit: "COP" | "score" | "x";
  get?: (bench: FinBenchResult) => number | null;
}

/**
 * Gradable financial/actuarial deliverables per day, ported verbatim from
 * CONCEPTOS in the legacy prototype, line ~1170. `auto_alm`/`auto_analitica`
 * concepts don't have a `get()` — they're scored by scoreFinanciero()/
 * scoreAnalitica() directly (see the module doc comment on scoreConcepto()
 * below for why that dispatch isn't folded into this same function here).
 */
export const CONCEPTOS: Concepto[] = [
  { id: "res_total", dia: "d2", perfil: "act", tipo: "reporte", label: "Reservas totales (RSA+IBNR)", unit: "COP", get: (b) => b.resTotal },
  { id: "res_rsa", dia: "d2", perfil: "act", tipo: "reporte", label: "RSA (avisados pend.)", unit: "COP", get: (b) => b.resRsa },
  { id: "res_ibnr", dia: "d2", perfil: "act", tipo: "reporte", label: "IBNR (no reportados)", unit: "COP", get: (b) => b.resIbnr },
  { id: "p1_rt", dia: "d2", perfil: "fin", tipo: "reporte", label: "Resultado técnico A1", unit: "COP", get: (b) => b.p1.rt },
  { id: "p1_gadq", dia: "d2", perfil: "fin", tipo: "reporte", label: "Gastos de adquisición A1", unit: "COP", get: (b) => b.p1.gadq },
  { id: "p1_gcom", dia: "d2", perfil: "fin", tipo: "reporte", label: "Comisiones A1", unit: "COP", get: (b) => b.p1.gcom },
  { id: "p1_gadm", dia: "d2", perfil: "fin", tipo: "reporte", label: "Gastos administrativos A1", unit: "COP", get: (b) => b.p1.gadm },
  { id: "p1_rinv", dia: "d2", perfil: "fin", tipo: "reporte", label: "Resultado de inversiones A1", unit: "COP", get: (b) => b.p1.rinv },
  { id: "p1_uneta", dia: "d2", perfil: "fin", tipo: "reporte", label: "Utilidad neta A1", unit: "COP", get: (b) => b.p1.uneta },
  { id: "alm_calce", dia: "d1", perfil: "fin", tipo: "auto_alm", label: "Calce ALM del portafolio", unit: "score" },
  { id: "res2_total", dia: "d3", perfil: "act", tipo: "reporte", label: "Reservas A2", unit: "COP", get: (b) => b.p2?.reservas ?? null },
  { id: "p2_rt", dia: "d3", perfil: "fin", tipo: "reporte", label: "Resultado técnico A2 (calendario)", unit: "COP", get: (b) => b.p2?.rt ?? null },
  { id: "p2_pagos", dia: "d3", perfil: "fin", tipo: "reporte", label: "Siniestros pagados en A2", unit: "COP", get: (b) => b.p2?.pagos ?? null },
  { id: "p2_desarrollo", dia: "d3", perfil: "fin", tipo: "reporte", label: "Desarrollo siniestros A1", unit: "COP", get: (b) => b.p2?.desarrollo ?? null },
  { id: "p2_uneta", dia: "d3", perfil: "fin", tipo: "reporte", label: "Utilidad neta A2", unit: "COP", get: (b) => b.p2?.uneta ?? null },
  { id: "p3_uneta", dia: "d3", perfil: "fin", tipo: "reporte", label: "Utilidad neta A3 (proy.)", unit: "COP", get: (b) => b.p3?.uneta ?? null },
  { id: "bal1_patrim", dia: "d3", perfil: "fin", tipo: "reporte", label: "Patrimonio A1", unit: "COP", get: (b) => b.bal1?.patrimonio ?? null },
  { id: "bal2_patrim", dia: "d3", perfil: "fin", tipo: "reporte", label: "Patrimonio A2", unit: "COP", get: (b) => b.bal2?.patrimonio ?? null },
  { id: "bal3_patrim", dia: "d3", perfil: "fin", tipo: "reporte", label: "Patrimonio A3 (proy.)", unit: "COP", get: (b) => b.bal3?.patrimonio ?? null },
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
