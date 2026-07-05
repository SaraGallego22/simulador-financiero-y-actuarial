import { CAL_FREQ } from "../generation/constants";

export type ChileVehicleType = "sedan" | "suv" | "pickup" | "station_wagon" | "furgon" | "compacto";
export type ChileZone = "metropolitana" | "norte" | "centro" | "sur" | "austral";
export type ChileUsage = "particular" | "comercial" | "taxi" | "uber";
export type ChileComuna = "gran_ciudad" | "ciudad_media" | "rural";

export interface ChileRiskFactors {
  edad: number;
  tipo: ChileVehicleType;
  zona: ChileZone;
  antig: number;
  km: number;
  hist: number;
  uso: ChileUsage;
  cajaAuto: boolean;
  segComp: boolean;
  comuna: ChileComuna;
}

/**
 * Chile reference dataset's frequency model — same functional form as the
 * Colombia model but with its own coefficients. Ported verbatim from the
 * local `calcLamCL()` defined inside generarChile() in the legacy prototype,
 * line ~2634. Note `genero` is generated for Chile policies but never used
 * here, matching the legacy (a purely descriptive field for that dataset).
 */
export function calcLambdaChile(e: ChileRiskFactors): number {
  let f = 0.072 * CAL_FREQ;

  const ed = e.edad;
  if (ed <= 24) f *= 1.85;
  else if (ed <= 35) f *= 1.0;
  else if (ed <= 55) f *= 0.84;
  else if (ed <= 65) f *= 1.18;
  else f *= 1.5;

  if (e.zona === "metropolitana") f *= 1.4;
  else if (e.zona === "norte") f *= 0.95;
  else if (e.zona === "centro") f *= 1.05;
  else if (e.zona === "sur") f *= 0.9;
  else f *= 0.78;

  if (e.tipo === "furgon") f *= 1.35;
  else if (e.tipo === "pickup") f *= 1.12;
  else if (e.tipo === "suv") f *= 1.08;
  else if (e.tipo === "station_wagon") f *= 1.02;

  const historyFactor = [0.72, 1.28, 1.8, 2.55, 3.1, 3.1];
  f *= historyFactor[Math.min(e.hist, 5)];

  if (e.km < 15000) f *= 0.76;
  else if (e.km <= 40000) f *= 1.0;
  else if (e.km <= 70000) f *= 1.22;
  else f *= 1.55;

  if (e.uso === "comercial") f *= 1.6;
  else if (e.uso === "taxi") f *= 2.1;
  else if (e.uso === "uber") f *= 1.8;

  if (e.cajaAuto) f *= 0.92;
  if (e.segComp) f *= 0.88;

  if (e.comuna === "gran_ciudad") f *= 1.15;
  else if (e.comuna === "rural") f *= 0.8;

  if (e.antig <= 3) f *= 1.04;
  else if (e.antig > 12) f *= 1.1;

  if (ed <= 24 && e.tipo === "furgon") f *= 1.3;
  if (e.zona === "metropolitana" && (e.uso === "taxi" || e.uso === "uber")) f *= 1.25;
  if (e.hist >= 2 && e.antig >= 8) f *= 1.22;

  return Math.min(Math.max(f, 0.01), 0.94);
}

/**
 * Mean claim severity (in UF) for a Chile policy. Ported from the inline
 * `base_uf` calculation inside generarChile(), line ~2677.
 */
export function calcSeverityBaseChile(
  e: Pick<ChileRiskFactors, "tipo" | "zona" | "antig">,
  valorUf: number
): number {
  const typeFactor =
    e.tipo === "furgon"
      ? 0.18
      : e.tipo === "suv" || e.tipo === "pickup"
        ? 0.15
        : e.tipo === "station_wagon"
          ? 0.13
          : 0.12;

  let base = valorUf * typeFactor;
  if (e.zona === "metropolitana") base *= 1.25;
  if (e.antig <= 3) base *= 1.2;
  else if (e.antig > 10) base *= 0.74;

  return base;
}
