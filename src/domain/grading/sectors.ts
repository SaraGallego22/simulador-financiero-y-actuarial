import type { ColombiaUniverse } from "../generation/generateColombia";
import { VEHICLE_TYPES, ZONES, USAGE_TYPES, EDUCATION_LEVELS } from "../generation/generateColombia";

/**
 * The 8 categorical dimensions a team can cross to name a "sector" — up from
 * the 4 (zona/uso/edad/estrato) the univariate version used. tipo/antig/hist/edu
 * are added specifically because calcLambda() (see domain/pricing/frequency.ts)
 * has real *interaction* terms on top of their individual effects:
 * zona×uso, edad×tipo, hist×antig, edad×edu. A univariate segmentation
 * structurally can't surface any of those — it always marginalizes over the
 * other three dimensions, diluting exactly the signal this exercise is meant
 * to test for.
 */
export type SectorDimension = "zona" | "uso" | "edad" | "estrato" | "tipo" | "antig" | "hist" | "edu";

interface DimensionDef {
  dim: SectorDimension;
  label: string;
  levels: readonly string[];
  /** Buckets exposure `i` into one of `levels`' indices, reading the universe's raw columnar arrays directly (no per-row object allocation — see CLAUDE.md §4.1). */
  bucketIndex: (u: ColombiaUniverse, i: number) => number;
}

const EDAD_LEVELS = ["joven", "medio", "mayor"] as const;
const ESTRATO_LEVELS = ["bajo", "medio", "alto"] as const;
/** Terciles of antig's actual range (0-20, drawn uniformly — see generateColombia.ts), not the pricing model's own breakpoints: frequency.ts's marginal effect breaks at 3/12, its hist×antig interaction breaks at 8, and severity.ts breaks at 10 — no single 3-way split lines up with all three, so this picks a balanced, easy-to-explain split instead of privileging one formula's threshold over another. */
const ANTIG_LEVELS = ["nuevo", "medio", "viejo"] as const;
/** hist=0/1/2+ — the 2+ cutoff matches frequency.ts's own hist×antig interaction condition (hist>=2) exactly. */
const HIST_LEVELS = ["0", "1", "2+"] as const;

const DIMENSIONS: DimensionDef[] = [
  { dim: "zona", label: "Zona", levels: ZONES, bucketIndex: (u, i) => u.zona[i] },
  { dim: "uso", label: "Uso", levels: USAGE_TYPES, bucketIndex: (u, i) => u.uso[i] },
  { dim: "tipo", label: "Tipo de vehículo", levels: VEHICLE_TYPES, bucketIndex: (u, i) => u.tipo[i] },
  { dim: "edu", label: "Educación", levels: EDUCATION_LEVELS, bucketIndex: (u, i) => u.edu[i] },
  {
    dim: "edad",
    label: "Edad conductor",
    levels: EDAD_LEVELS,
    bucketIndex: (u, i) => (u.edad[i] < 30 ? 0 : u.edad[i] <= 50 ? 1 : 2),
  },
  {
    dim: "estrato",
    label: "Estrato",
    levels: ESTRATO_LEVELS,
    bucketIndex: (u, i) => (u.estrato[i] <= 2 ? 0 : u.estrato[i] <= 4 ? 1 : 2),
  },
  {
    dim: "antig",
    label: "Antigüedad del vehículo",
    levels: ANTIG_LEVELS,
    bucketIndex: (u, i) => (u.antig[i] <= 6 ? 0 : u.antig[i] <= 13 ? 1 : 2),
  },
  {
    dim: "hist",
    label: "Historial de siniestros",
    levels: HIST_LEVELS,
    bucketIndex: (u, i) => (u.hist[i] === 0 ? 0 : u.hist[i] === 1 ? 1 : 2),
  },
];

const DIMENSION_BY_KEY: Record<SectorDimension, DimensionDef> = Object.fromEntries(DIMENSIONS.map((d) => [d.dim, d])) as Record<
  SectorDimension,
  DimensionDef
>;

/** Dimension/level catalog for building a picker UI — labels only, no computed data. */
export const SECTOR_DIMENSIONS: { dim: SectorDimension; label: string; levels: readonly string[] }[] = DIMENSIONS.map((d) => ({
  dim: d.dim,
  label: d.label,
  levels: d.levels,
}));

export interface Sector {
  dimA: SectorDimension;
  valA: string;
  dimB: SectorDimension;
  valB: string;
}

/** Two variables, one value each — order doesn't matter, so this normalizes (A,B) and (B,A) to the same shape before comparing/keying. */
function canonicalize(s: Sector): Sector {
  return s.dimA <= s.dimB ? s : { dimA: s.dimB, valA: s.valB, dimB: s.dimA, valB: s.valA };
}

export function sectorKey(s: Sector): string {
  const c = canonicalize(s);
  return `${c.dimA}:${c.valA}|${c.dimB}:${c.valB}`;
}

export function sectorLabel(s: Sector): string {
  const c = canonicalize(s);
  return `${DIMENSION_BY_KEY[c.dimA].label}: ${c.valA} × ${DIMENSION_BY_KEY[c.dimB].label}: ${c.valB}`;
}

/** A team must pick two *different* dimensions, each a real level of that dimension — this is what teamActions.ts validates a submitted pick against before it's ever stored. */
export function isValidSectorPick(dimA: string, valA: string, dimB: string, valB: string): boolean {
  if (dimA === dimB) return false;
  const defA = DIMENSION_BY_KEY[dimA as SectorDimension];
  const defB = DIMENSION_BY_KEY[dimB as SectorDimension];
  return !!defA && !!defB && defA.levels.includes(valA) && defB.levels.includes(valB);
}

/**
 * Minimum exposure count (in the *whole* universe, not any one team's book —
 * see this module's doc comment for why) for a sector to have a stable
 * enough answer to grade against. At the model's ~6.5% average base
 * frequency this is thousands of expected claims once severity variance is
 * folded in — comfortably past classical actuarial credibility standards
 * (full credibility is typically quoted around ~1,000 claims) even before
 * accounting for severity's own variance on top of frequency's.
 */
export const SECTOR_MIN_COUNT = 2000;

export interface SectorStat extends Sector {
  count: number;
  /**
   * Average incurred cost per exposure — claims sum ÷ *all* exposures in the
   * cell, not just the ones that had a claim (same convention as
   * CAPITAL_SOCIAL's derivation and the outsourced-tariff generator, see
   * constants.ts/outsourced.ts) — which is exactly what folds frequency and
   * severity into one number: a cell with more frequent claims raises this
   * even at constant claim size, and a cell with larger claims raises it even
   * at constant claim count. Frequency alone (claim count ÷ exposures) or
   * severity alone (claim sum ÷ *claim* count, ignoring exposures that never
   * claimed) would each miss half of what the model's real interaction terms
   * (all of them on frequency — see this module's doc comment) actually do.
   */
  avgIncurredCost: number;
  /** avgIncurredCost ÷ the whole universe's own average — 1.0 always means "same as the overall market", regardless of which two dimensions are crossed. This is the number shown to the admin as "el multiplicador". */
  multiplier: number;
}

/**
 * The one, universe-wide "true answer" this whole exercise grades against —
 * never computed per-team (see this module's doc comment on why a team's own
 * book is a biased sample, not a fair ground truth). Pure function of the
 * universe alone, so — like the universe itself — it's cheap to recompute on
 * demand and never persisted (see CLAUDE.md §4.1); callers should still
 * cache it at module scope keyed by seed for repeated requests within the
 * same warm instance (see teamBook.ts's getUniverseForSeed for the pattern).
 *
 * One O(n) pass buckets every exposure into all 8 dimensions at once
 * (reading raw typed arrays, not getExposure() — avoids 1,000,000 object
 * allocations); a second O(n × 28) pass accumulates every one of the 28
 * possible dimension pairs' cells in the same sweep, using flat typed-array
 * accumulators (no Map, no per-cell allocation) to keep this fast enough to
 * run on every admin page load.
 */
export function computeSectorStats(universe: ColombiaUniverse, minCount = SECTOR_MIN_COUNT): SectorStat[] {
  const n = universe.n;

  const bucketsByDim = new Map<SectorDimension, Uint8Array>();
  for (const d of DIMENSIONS) {
    const arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) arr[i] = d.bucketIndex(universe, i);
    bucketsByDim.set(d.dim, arr);
  }

  let totalSev = 0;
  for (let i = 0; i < n; i++) if (universe.siniestro[i]) totalSev += universe.sev[i];
  const popAvg = totalSev / n;

  const stats: SectorStat[] = [];
  for (let a = 0; a < DIMENSIONS.length; a++) {
    for (let b = a + 1; b < DIMENSIONS.length; b++) {
      const dA = DIMENSIONS[a];
      const dB = DIMENSIONS[b];
      const levelsB = dB.levels.length;
      const bucketsA = bucketsByDim.get(dA.dim)!;
      const bucketsB = bucketsByDim.get(dB.dim)!;
      const cellCount = dA.levels.length * levelsB;
      const sumSev = new Float64Array(cellCount);
      const counts = new Int32Array(cellCount);

      for (let i = 0; i < n; i++) {
        const cell = bucketsA[i] * levelsB + bucketsB[i];
        counts[cell]++;
        if (universe.siniestro[i]) sumSev[cell] += universe.sev[i];
      }

      for (let ia = 0; ia < dA.levels.length; ia++) {
        for (let ib = 0; ib < levelsB; ib++) {
          const cell = ia * levelsB + ib;
          const count = counts[cell];
          if (count < minCount) continue;
          const avgIncurredCost = sumSev[cell] / count;
          stats.push({
            dimA: dA.dim,
            valA: dA.levels[ia],
            dimB: dB.dim,
            valB: dB.levels[ib],
            count,
            avgIncurredCost,
            multiplier: popAvg > 0 ? avgIncurredCost / popAvg : 1,
          });
        }
      }
    }
  }
  return stats;
}

/** Best-to-grow first (lowest relative risk). */
export function rankForCrecer(stats: SectorStat[]): SectorStat[] {
  return [...stats].sort((a, b) => a.multiplier - b.multiplier);
}

/** Most-urgent-to-shrink first (highest relative risk). */
export function rankForDisminuir(stats: SectorStat[]): SectorStat[] {
  return [...stats].sort((a, b) => b.multiplier - a.multiplier);
}

/** How many rank positions off a pick can be before it scores 0 — see scoreSectorPicks(). */
export const SECTOR_RANK_WINDOW = 10;

/**
 * Grades one ranked list (a team's "crecer" picks, or its "disminuir" picks)
 * against the true ranking for that direction (rankForCrecer/rankForDisminuir
 * output). Position i (1-indexed) scores 100 if the pick's real rank is
 * exactly i, decaying linearly to 0 once the gap reaches SECTOR_RANK_WINDOW
 * positions — naming a sector that isn't in the true ranking at all (wrong
 * direction, or didn't meet SECTOR_MIN_COUNT) scores 0 for that slot, same as
 * a real sector named far out of place. Missing slots (a team names fewer
 * than 3) simply don't contribute — the average is over what they filled in,
 * not padded with zeros for blanks. `picks` may be sparse (e.g. a team that
 * filled rank 1 and 3 but skipped 2) — array index (not compacted position)
 * is what's used as the stated rank, since a team that explicitly left a
 * slot blank didn't thereby promote a later pick to an earlier position.
 */
export function scoreSectorPicks(picks: (Sector | null | undefined)[], trueRanking: SectorStat[]): number | null {
  let total = 0;
  let count = 0;
  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    if (!pick) continue;
    count++;
    const key = sectorKey(pick);
    const trueIndex = trueRanking.findIndex((s) => sectorKey(s) === key);
    const trueRank = trueIndex === -1 ? Infinity : trueIndex + 1;
    const statedRank = i + 1;
    const gap = Math.abs(trueRank - statedRank);
    total += Math.max(0, 100 * (1 - gap / SECTOR_RANK_WINDOW));
  }
  return count > 0 ? total / count : null;
}

export interface SectorPicks {
  crecer: (Sector | null)[];
  disminuir: (Sector | null)[];
}

/** Shape of a raw AnalyticsRecommendation row — structural, not a Prisma import, so this stays framework-agnostic. */
export interface AnalyticsRecommendationRow {
  teamId: string;
  list: string;
  rank: number;
  dimA: string;
  valA: string;
  dimB: string;
  valB: string;
}

/**
 * Groups raw AnalyticsRecommendation rows (any number of teams/days mixed
 * together — caller filters by day) into each team's two sparse, up-to-3-slot
 * picked lists. Shared by consolidado.ts (final grading) and the admin day
 * page (review UI) so both read the exact same grouping logic.
 */
export function groupSectorPicksByTeam(rows: AnalyticsRecommendationRow[]): Map<string, SectorPicks> {
  const byTeamId = new Map<string, SectorPicks>();
  for (const r of rows) {
    if (!byTeamId.has(r.teamId)) byTeamId.set(r.teamId, { crecer: [null, null, null], disminuir: [null, null, null] });
    const entry = byTeamId.get(r.teamId)!;
    const list = r.list === "crecer" ? entry.crecer : entry.disminuir;
    if (r.rank >= 1 && r.rank <= list.length) {
      list[r.rank - 1] = { dimA: r.dimA as SectorDimension, valA: r.valA, dimB: r.dimB as SectorDimension, valB: r.valB };
    }
  }
  return byTeamId;
}

/** Averages a team's crecer-list score and disminuir-list score into one Día 4 sector-analítica score. */
export function scoreSectorRecommendation(picks: SectorPicks | undefined, trueCrecer: SectorStat[], trueDisminuir: SectorStat[]): number | null {
  const crecerScore = scoreSectorPicks(picks?.crecer ?? [], trueCrecer);
  const disminuirScore = scoreSectorPicks(picks?.disminuir ?? [], trueDisminuir);
  const parts = [crecerScore, disminuirScore].filter((s): s is number => s != null);
  return parts.length > 0 ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}
