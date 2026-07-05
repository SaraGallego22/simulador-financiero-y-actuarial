import { seedRand, gammaRand } from "./rng";
import { sampleClaimDate, sampleReportingLag } from "./dates";
import { calcLambdaChile, calcSeverityBaseChile } from "../pricing/chile";
import type {
  ChileComuna,
  ChileUsage,
  ChileVehicleType,
  ChileZone,
} from "../pricing/chile";
import { N_CHILE, SEVERITY_SHAPE } from "./constants";

const VEHICLE_TYPES_CL: readonly ChileVehicleType[] = [
  "sedan",
  "suv",
  "pickup",
  "station_wagon",
  "furgon",
  "compacto",
];
const ZONES_CL: readonly ChileZone[] = ["metropolitana", "norte", "centro", "sur", "austral"];
const USAGE_CL: readonly ChileUsage[] = ["particular", "comercial", "taxi", "uber"];
const COMUNAS_CL: readonly ChileComuna[] = ["gran_ciudad", "ciudad_media", "rural"];
const GENDERS_CL = ["M", "F"] as const;
const YEARS_CL = [2021, 2022, 2023] as const;

export type ChileYear = (typeof YEARS_CL)[number];

export interface ChileYearClaim {
  siniestro: 0 | 1;
  fechaSiniestro: string;
  fechaAviso: string;
  montoUf: number | "";
}

export interface ChilePolicy {
  id: number;
  edadConductor: number;
  tipoVehiculo: ChileVehicleType;
  zona: ChileZone;
  antiguedadVehiculo: number;
  kilometrajeAnual: number;
  siniestrosPrevios: number;
  valorComercialUf: number;
  usoVehiculo: ChileUsage;
  cajaAutomatica: boolean;
  seguroComplementario: boolean;
  genero: (typeof GENDERS_CL)[number];
  comunaTipo: ChileComuna;
  years: Record<ChileYear, ChileYearClaim>;
}

const MS_PER_DAY = 86_400_000;
const formatDate = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Generates the Chile reference dataset (3 years of exposure/claims per
 * policy, 2021-2023), used for portfolio/ALM calibration. Deterministic given
 * `seed`. Ported from generarChile() in the legacy prototype, line ~2618 —
 * same per-policy draw order, so the same seed reproduces the same dataset.
 */
export function generateChile(seed = 42, n: number = N_CHILE): ChilePolicy[] {
  const r = seedRand(seed + 55555);
  const policies: ChilePolicy[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const edad = 18 + Math.floor(r() * 58);
    const tipo = VEHICLE_TYPES_CL[Math.floor(r() * VEHICLE_TYPES_CL.length)];
    const zona = ZONES_CL[Math.floor(r() * ZONES_CL.length)];
    const antig = Math.floor(r() * 21);
    const km = 5000 + Math.floor(r() * 115001);
    const hist = Math.min(Math.floor(Math.pow(r() * 2.2, 2)), 5);
    const valorUf = Math.round(50 + r() * 7950);
    const uso = USAGE_CL[Math.floor(r() * USAGE_CL.length)];
    const cajaAuto = r() < 0.45;
    const segComp = r() < 0.6;
    const genero = GENDERS_CL[Math.floor(r() * 2)];
    const comuna = COMUNAS_CL[Math.floor(r() * 3)];

    const lam = calcLambdaChile({ edad, tipo, zona, antig, km, hist, uso, cajaAuto, segComp, comuna });
    const baseUf = calcSeverityBaseChile({ tipo, zona, antig }, valorUf);

    const years = {} as Record<ChileYear, ChileYearClaim>;
    for (const year of YEARS_CL) {
      const hasClaim = r() < lam;
      if (hasClaim) {
        const sevUf = Math.round((gammaRand(r, SEVERITY_SHAPE) * baseUf) / SEVERITY_SHAPE);
        const claimDate = sampleClaimDate(r, year);
        const lag = sampleReportingLag(r);
        const reportDate = new Date(claimDate.getTime() + lag * MS_PER_DAY);
        years[year] = {
          siniestro: 1,
          fechaSiniestro: formatDate(claimDate),
          fechaAviso: formatDate(reportDate),
          montoUf: sevUf,
        };
      } else {
        // Consume the same 2 draws the claim branch would use for date/lag —
        // matches the legacy's `r(); r();` at generarChile() line ~2706.
        r();
        r();
        years[year] = { siniestro: 0, fechaSiniestro: "", fechaAviso: "", montoUf: "" };
      }
    }

    policies[i] = {
      id: i + 1,
      edadConductor: edad,
      tipoVehiculo: tipo,
      zona,
      antiguedadVehiculo: antig,
      kilometrajeAnual: km,
      siniestrosPrevios: hist,
      valorComercialUf: valorUf,
      usoVehiculo: uso,
      cajaAutomatica: cajaAuto,
      seguroComplementario: segComp,
      genero,
      comunaTipo: comuna,
      years,
    };
  }

  return policies;
}
