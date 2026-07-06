export interface Instrument {
  id: string;
  nombre: string;
  yield: number;
  plazoM: number;
  nota: string;
}

/**
 * Investment menu offered to teams for their portfolio allocation. Ported
 * verbatim from INSTRUMENTOS in the legacy prototype, line ~1482.
 */
export const INSTRUMENTS: readonly Instrument[] = [
  { id: "LIQ", nombre: "Caja / Fondo de liquidez", yield: 0.08, plazoM: 0, nota: "Liquidez total, rendimiento bajo" },
  { id: "CDT90", nombre: "CDT 90 días", yield: 0.095, plazoM: 3, nota: "Corto plazo, baja liquidez intermedia" },
  { id: "TES1", nombre: "TES tasa fija 1 año", yield: 0.105, plazoM: 12, nota: "Cubre pasivos del primer año" },
  { id: "TES3", nombre: "TES tasa fija 3 años", yield: 0.115, plazoM: 36, nota: "Cubre cola del desarrollo" },
  { id: "TESUVR8", nombre: "TES UVR 8 años", yield: 0.12, plazoM: 96, nota: "Alto rendimiento, muy largo plazo" },
  {
    id: "ACC",
    nombre: "Renta variable (acciones)",
    yield: 0.14,
    plazoM: 999,
    nota: "Mayor retorno esperado, sin flujo definido / volátil",
  },
];

export const INSTRUMENT_BY_ID: Record<string, Instrument> = Object.fromEntries(
  INSTRUMENTS.map((x) => [x.id, x])
);

export const YIELD_MIN = Math.min(...INSTRUMENTS.map((x) => x.yield));
export const YIELD_MAX = Math.max(...INSTRUMENTS.map((x) => x.yield));

/** A team's target allocation: instrument id -> weight (not necessarily normalized to 1). */
export type Allocation = Record<string, number>;

/**
 * Only bond-like instruments (a real, fixed numeric term) mature on their
 * own — LIQ (plazoM===0, cash-equivalent) and ACC (plazoM>=400, the "no
 * defined maturity" sentinel for equities) have no fixed term, so a
 * Tranche using either must instead carry a team-chosen `durationM`.
 */
export function isBondLike(ins: Instrument): boolean {
  return ins.plazoM > 0 && ins.plazoM < 400;
}

/**
 * A slice of a portfolio: how much (relative weight among siblings — not
 * required to sum to 100, normalized when funded), in what instrument, and
 * what happens when it reaches its own maturity/decision month.
 */
export interface Tranche {
  instrumentId: string;
  weight: number;
  /**
   * Team-chosen holding period in months — required iff the instrument has
   * no fixed term (LIQ, ACC — !isBondLike) and forbidden (must be omitted)
   * for bond-like instruments, which always use their own ins.plazoM
   * instead. See trancheDurationM().
   */
  durationM?: number;
  onMaturity: MaturityDecision;
}

/**
 * What happens to a tranche's proceeds at its maturity/decision month:
 * - "cash": becomes non-reinvested cash (folds into that month's
 *   Vencimientos en caja).
 * - "repeat": immediately re-funds a new tranche with the SAME
 *   instrumentId and SAME durationM — a self-sustaining rolling position,
 *   the explicit "keep doing this forever" escape hatch, needs no further
 *   decisions.
 * - "reallocate": splits the proceeds across 1+ new child tranches, each
 *   of which recursively has its own onMaturity.
 */
export type MaturityDecision =
  | { action: "cash" }
  | { action: "repeat" }
  | { action: "reallocate"; tranches: Tranche[] };

/** A team's full portfolio decision for a day: a tree of tranches, decided once, up front. */
export interface PortfolioDecisionV3 {
  tranches: Tranche[];
}

/** Defensive ceilings for isPortfolioDecisionV3 — a security boundary against a tampered client payload, independent of whatever horizon-based pruning the wizard does client-side. */
export const MAX_TRANCHE_DEPTH = 10;
export const MAX_TRANCHE_SIBLINGS = 20;

/**
 * A tranche's own holding period in months before its onMaturity decision
 * applies: bond-like instruments always use their fixed contractual term
 * (ins.plazoM); LIQ and ACC use the team's chosen durationM instead.
 */
export function trancheDurationM(tranche: Pick<Tranche, "instrumentId" | "durationM">): number {
  const ins = INSTRUMENT_BY_ID[tranche.instrumentId];
  return isBondLike(ins) ? ins.plazoM : (tranche.durationM ?? 0);
}

function isValidTranche(value: unknown, depth: number): value is Tranche {
  if (depth > MAX_TRANCHE_DEPTH) return false;
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const ins = typeof v.instrumentId === "string" ? INSTRUMENT_BY_ID[v.instrumentId] : undefined;
  if (!ins) return false;
  if (typeof v.weight !== "number" || !Number.isFinite(v.weight) || v.weight <= 0) return false;

  if (!isBondLike(ins)) {
    if (typeof v.durationM !== "number" || !Number.isInteger(v.durationM) || v.durationM < 1) return false;
  } else if (v.durationM !== undefined) {
    return false; // bond-like instruments must NOT carry a durationM — they always use their own plazoM
  }

  return isValidMaturityDecision(v.onMaturity, depth + 1);
}

function isValidMaturityDecision(value: unknown, depth: number): value is MaturityDecision {
  if (depth > MAX_TRANCHE_DEPTH) return false;
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.action === "cash" || v.action === "repeat") return true;
  if (v.action === "reallocate") {
    return (
      Array.isArray(v.tranches) &&
      v.tranches.length > 0 &&
      v.tranches.length <= MAX_TRANCHE_SIBLINGS &&
      v.tranches.every((t) => isValidTranche(t, depth + 1))
    );
  }
  return false;
}

/**
 * Guards against a stored PortfolioAllocation.allocation predating this
 * shape (the old {allocation, maturityRules} model, or anything older) —
 * none of those have a `tranches` key, so they're rejected automatically
 * and treated as "no decision submitted yet," the same graceful-
 * degradation pattern the previous version already used for ITS
 * predecessors. This is also the real security boundary for client-
 * submitted JSON (see submitPortfolioAction) — strict and recursive, not
 * just a shallow shape check.
 */
export function isPortfolioDecisionV3(value: unknown): value is PortfolioDecisionV3 {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.tranches) &&
    v.tranches.length > 0 &&
    v.tranches.length <= MAX_TRANCHE_SIBLINGS &&
    v.tranches.every((t) => isValidTranche(t, 0))
  );
}
