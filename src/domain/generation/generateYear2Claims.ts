import { seedRand, gammaRand } from "./rng";
import { sampleClaimDate, sampleReportingLag } from "./dates";
import { calcLambda } from "../pricing/frequency";
import { calcMediaSev } from "../pricing/severity";
import { SEVERITY_SHAPE } from "./constants";
import { getExposure } from "./generateColombia";
import type { ColombiaUniverse } from "./generateColombia";

const MS_PER_DAY = 86_400_000;
const toEpochDay = (d: Date) => Math.floor(d.getTime() / MS_PER_DAY);

/**
 * Year-2 claim occurrence/severity, generated independently of Year 1's
 * (same exposures, new draws — same risk model but one year older, and
 * history bumped if the policyholder claimed in Year 1). Parallel arrays
 * indexed the same way as ColombiaUniverse, kept separate from it since a
 * universe is otherwise immutable/regeneratable from just its seed.
 *
 * Ported from generarSiniestrosA2() in the legacy prototype, line ~3351.
 */
export interface Year2Claims {
  lam: Float32Array;
  siniestro: Uint8Array;
  sev: Float32Array;
  fechaSinEpochDay: Int32Array;
  fechaAvisoEpochDay: Int32Array;
}

const YEAR_2 = 2028;

export function generateYear2Claims(universe: ColombiaUniverse, seed = 42): Year2Claims {
  const r = seedRand(seed + 99_991);
  const n = universe.n;

  const lam = new Float32Array(n);
  const siniestro = new Uint8Array(n);
  const sev = new Float32Array(n);
  const fechaSinEpochDay = new Int32Array(n).fill(-1);
  const fechaAvisoEpochDay = new Int32Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    const e1 = getExposure(universe, i);
    // Vehicle is a year older; claim history bumps if Year 1 had a claim.
    const eYear2 = {
      ...e1,
      antig: e1.antig + 1,
      hist: universe.siniestro[i] ? Math.min(e1.hist + 1, 5) : e1.hist,
    };

    const lambda = calcLambda(eYear2);
    lam[i] = lambda;

    const hasClaim = r() < lambda;
    siniestro[i] = hasClaim ? 1 : 0;

    if (hasClaim) {
      const meanSeverity = calcMediaSev(eYear2);
      sev[i] = Math.round((gammaRand(r, SEVERITY_SHAPE) * meanSeverity) / SEVERITY_SHAPE);
      const claimDate = sampleClaimDate(r, YEAR_2);
      const reportDate = new Date(claimDate.getTime() + sampleReportingLag(r) * MS_PER_DAY);
      fechaSinEpochDay[i] = toEpochDay(claimDate);
      fechaAvisoEpochDay[i] = toEpochDay(reportDate);
    } else {
      // Matches the legacy's `r(); r(); r(); r();` — see generateColombia.ts.
      r();
      r();
      r();
      r();
    }
  }

  return { lam, siniestro, sev, fechaSinEpochDay, fechaAvisoEpochDay };
}
