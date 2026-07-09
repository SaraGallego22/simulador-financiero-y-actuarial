import { seedRand } from "@/domain/generation/rng";

/**
 * Deterministically corrupts a small, fixed fraction of exported CSV rows
 * with realistic data-quality issues — missing values, inconsistent
 * casing/whitespace, sentinel placeholders, duplicated rows — so pricing
 * (Día 1/2) and the sector exercise (Día 4) both require real data cleaning
 * before the numbers can be trusted, not just before they can be read. See
 * README's data-cleaning section; deliberately never mentioned to teams.
 *
 * Applied *only* at CSV serialization time (public-csv, teams/report) — the
 * underlying typed-array universe/claims data the simulation actually prices
 * and reserves against is never touched, so this can't silently change any
 * team's real financial outcome, only what they have to clean before they
 * can compute one themselves.
 *
 * A row's dirt is a pure function of (seed, rowIndex) — not a sequentially
 * advancing stream — so exposure #k gets the exact same treatment whether
 * it's read from the full public universe CSV or from one team's own
 * (filtered) report, and regenerating either is still fully reproducible.
 */
const DIRTY_ROW_PROBABILITY = 0.03;
const SENTINEL_VALUE = "9999";
const DIRT_SEED_OFFSET = 555_001;

/**
 * MurmurHash3-style integer finalizer. `seedRand`'s first output is a near-
 * linear function of the seed for consecutive seeds (it's a plain LCG,
 * state_1 = seed*A mod M) — feeding it `seed + rowIndex` directly, one fresh
 * instance per row, produced a smoothly-ramping (not random-looking) value
 * per row and broke both the target dirty-rate and duplicate-row behavior
 * (verified empirically: 20,000 consecutive rows landed entirely outside
 * the [0, 0.03) band). Hashing (seed, rowIndex) into a well-avalanched
 * integer before handing it to `seedRand` fixes this without needing a
 * burn-in call, and keeps every row's dirt a pure, order-independent
 * function of (seed, rowIndex) as documented above.
 */
function hash32(x: number): number {
  x = x | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = x ^ (x >>> 16);
  return x >>> 0;
}

function rowSeed(seed: number, rowIndex: number): number {
  const mixed = hash32(Math.imul(seed + DIRT_SEED_OFFSET, 2654435761) ^ hash32(rowIndex));
  return (mixed % 2147483646) + 1;
}

export interface DirtyColumns {
  /** Field indexes (into the row array) holding text/category values — eligible for the shouty-case/whitespace corruption. */
  categorical: number[];
  /** Field indexes holding numbers — eligible for the sentinel-placeholder corruption. */
  numeric: number[];
}

/**
 * Returns the row(s) to actually emit for CSV row `rowIndex`: normally just
 * `[fields]` unchanged, but ~3% of the time one dirtied copy, or (rarely)
 * the same row twice. `fields[0]` (assumed to be the join key, id_expuesto)
 * is never touched — only the other risk-factor columns can be corrupted,
 * never a customer's ability to re-match rows.
 */
export function dirtyRow(seed: number, rowIndex: number, fields: (string | number)[], columns: DirtyColumns): (string | number)[][] {
  const rng = seedRand(rowSeed(seed, rowIndex));
  if (rng() >= DIRTY_ROW_PROBABILITY) return [fields];

  const out = [...fields];
  const kind = rng();
  if (kind < 0.3 && columns.categorical.length > 0) {
    const idx = columns.categorical[Math.floor(rng() * columns.categorical.length)];
    out[idx] = `${out[idx]}`.toUpperCase() + "  ";
  } else if (kind < 0.55 && columns.numeric.length > 0) {
    const idx = columns.numeric[Math.floor(rng() * columns.numeric.length)];
    out[idx] = SENTINEL_VALUE;
  } else if (kind < 0.8) {
    const eligible = [...columns.categorical, ...columns.numeric];
    if (eligible.length > 0) out[eligible[Math.floor(rng() * eligible.length)]] = "";
  } else {
    return [fields, fields];
  }
  return [out];
}
