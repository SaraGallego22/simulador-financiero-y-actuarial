import { seedRand, gammaRand } from "./rng";
import { sampleClaimDate, sampleReportingLag } from "./dates";
import { calcLambda } from "../pricing/frequency";
import { calcMediaSev } from "../pricing/severity";
import { N_COLOMBIA, ANIO_BASE_A1, SEVERITY_SHAPE, OUTLIER_CLAIM_PROBABILITY, OUTLIER_CLAIM_MULTIPLIER } from "./constants";
import type {
  Brand,
  ColombiaExposure,
  EducationLevel,
  Gender,
  Usage,
  VehicleType,
  Zone,
} from "../pricing/types";

export const VEHICLE_TYPES: readonly VehicleType[] = [
  "sedan",
  "suv",
  "pickup",
  "deportivo",
  "compacto",
  "van",
];
export const ZONES: readonly Zone[] = ["urbana", "suburbana", "rural"];
export const USAGE_TYPES: readonly Usage[] = ["personal", "comercial", "mixto"];
export const EDUCATION_LEVELS: readonly EducationLevel[] = [
  "basica",
  "tecnica",
  "universitaria",
  "posgrado",
];
export const BRANDS: readonly Brand[] = [
  "chevrolet",
  "renault",
  "mazda",
  "toyota",
  "nissan",
  "hyundai",
  "kia",
  "ford",
];
export const GENDERS: readonly Gender[] = ["M", "F"];

const MS_PER_DAY = 86_400_000;
const toEpochDay = (d: Date) => Math.floor(d.getTime() / MS_PER_DAY);

/**
 * Columnar (typed-array) representation of the Colombia universe. Storing one
 * typed array per field instead of `N` plain JS objects is deliberate — see
 * CLAUDE.md §4.1 (the legacy authors made the same call for tariff arrays,
 * "~25x less memory than JS objects"; we extend it to the whole universe).
 */
export interface ColombiaUniverse {
  n: number;
  edad: Uint8Array;
  tipo: Uint8Array;
  zona: Uint8Array;
  antig: Uint8Array;
  km: Uint32Array;
  hist: Uint8Array;
  valor: Float64Array;
  uso: Uint8Array;
  parq: Uint8Array;
  edu: Uint8Array;
  estrato: Uint8Array;
  genero: Uint8Array;
  marca: Uint8Array;
  lam: Float32Array;
  siniestro: Uint8Array;
  sev: Float32Array;
  /** Epoch day (UTC, floor(ms/86400000)); -1 when there is no claim. */
  fechaSinEpochDay: Int32Array;
  fechaAvisoEpochDay: Int32Array;
}

function exposureAt(u: ColombiaUniverse, i: number): ColombiaExposure {
  return {
    id: i + 1,
    edad: u.edad[i],
    tipo: VEHICLE_TYPES[u.tipo[i]],
    zona: ZONES[u.zona[i]],
    antig: u.antig[i],
    km: u.km[i],
    hist: u.hist[i],
    valor: u.valor[i],
    uso: USAGE_TYPES[u.uso[i]],
    parq: u.parq[i] ? "si" : "no",
    edu: EDUCATION_LEVELS[u.edu[i]],
    estrato: u.estrato[i],
    genero: GENDERS[u.genero[i]],
    marca: BRANDS[u.marca[i]],
  };
}

/** Reconstructs the plain-object view of exposure `index` (0-based). */
export function getExposure(u: ColombiaUniverse, index: number): ColombiaExposure {
  return exposureAt(u, index);
}

/**
 * Generates the synthetic Colombia auto-insurance universe. Deterministic
 * given `seed`. Ported from generarColombia() in the legacy prototype, line
 * ~2543 — same per-row draw order and distributions, so the same seed
 * produces bit-identical categorical/numeric fields (see
 * generateColombia.test.ts for a golden-value regression pinned against the
 * original JS).
 */
export function generateColombia(seed = 42, n: number = N_COLOMBIA): ColombiaUniverse {
  const r = seedRand(seed);
  // Independent stream (not interleaved with `r`) deciding which claims
  // become catastrophic outliers — see OUTLIER_CLAIM_PROBABILITY's doc
  // comment. Keeping it separate means every other field's draw stays
  // bit-identical to before this was added; only severity is affected.
  const rOutlier = seedRand(seed + 13_131);

  const u: ColombiaUniverse = {
    n,
    edad: new Uint8Array(n),
    tipo: new Uint8Array(n),
    zona: new Uint8Array(n),
    antig: new Uint8Array(n),
    km: new Uint32Array(n),
    hist: new Uint8Array(n),
    valor: new Float64Array(n),
    uso: new Uint8Array(n),
    parq: new Uint8Array(n),
    edu: new Uint8Array(n),
    estrato: new Uint8Array(n),
    genero: new Uint8Array(n),
    marca: new Uint8Array(n),
    lam: new Float32Array(n),
    siniestro: new Uint8Array(n),
    sev: new Float32Array(n),
    fechaSinEpochDay: new Int32Array(n).fill(-1),
    fechaAvisoEpochDay: new Int32Array(n).fill(-1),
  };

  for (let i = 0; i < n; i++) {
    u.edad[i] = 18 + Math.floor(r() * 58);
    u.tipo[i] = Math.floor(r() * VEHICLE_TYPES.length);
    u.zona[i] = Math.floor(r() * 3);
    u.antig[i] = Math.floor(r() * 21);
    u.km[i] = 5000 + Math.floor(r() * 115001);
    u.hist[i] = Math.min(Math.floor(Math.pow(r() * 2.2, 2)), 5);
    u.valor[i] = Math.floor((8 + r() * 292) * 1_000_000);
    u.uso[i] = Math.floor(r() * 3);
    u.parq[i] = r() < 0.55 ? 1 : 0;
    u.edu[i] = Math.floor(r() * 4);
    u.estrato[i] = Math.min(Math.floor(r() * 6) + 1, 6);
    u.genero[i] = Math.floor(r() * 2);
    u.marca[i] = Math.floor(r() * BRANDS.length);

    const exposure = exposureAt(u, i);
    const lam = calcLambda(exposure);
    u.lam[i] = lam;

    const hasClaim = r() < lam;
    u.siniestro[i] = hasClaim ? 1 : 0;

    if (hasClaim) {
      const meanSeverity = calcMediaSev(exposure);
      let severity = (gammaRand(r, SEVERITY_SHAPE) * meanSeverity) / SEVERITY_SHAPE;
      if (rOutlier() < OUTLIER_CLAIM_PROBABILITY) severity *= OUTLIER_CLAIM_MULTIPLIER;
      u.sev[i] = Math.round(severity);
      const claimDate = sampleClaimDate(r, ANIO_BASE_A1);
      const reportDate = new Date(claimDate.getTime() + sampleReportingLag(r) * MS_PER_DAY);
      u.fechaSinEpochDay[i] = toEpochDay(claimDate);
      u.fechaAvisoEpochDay[i] = toEpochDay(reportDate);
    } else {
      // Consume the same number of random draws as a "shortest possible" claim
      // branch, matching the legacy's `r(); r(); r(); r();` — see the comment
      // at generarColombia() line ~2595 ("consumir randoms para reproducibilidad").
      r();
      r();
      r();
      r();
    }
  }

  return u;
}
