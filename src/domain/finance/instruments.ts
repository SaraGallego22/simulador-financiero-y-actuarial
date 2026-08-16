import { GENERAL_INFLATION_ANNUAL } from "../generation/constants";
import { ACC_ROLL_M } from "./constants";

export interface Instrument {
  id: string;
  nombre: string;
  yield: number;
  /** Annualized return volatility (stdev, dimensionless — 0.05 = 5%). Feeds the risk-adjusted "Rendimiento" ALM sub-score and the Día 4 solvency financial-risk charge — see RENDIMIENTO_AJUSTADO in alm.ts and finBench()'s rFin. */
  volAnual: number;
  plazoM: number;
  nota: string;
}

/**
 * Investment menu offered to teams for their portfolio allocation. Ported
 * verbatim from INSTRUMENTOS in the legacy prototype, line ~1482, plus
 * volAnual (not in the legacy prototype — added so a team's instrument
 * choice carries a genuine risk/return trade-off, not just return).
 *
 * Calibration intent: TESUVR8 is deliberately the best risk-adjusted
 * choice of the whole menu (see VOL_PENALTY_LAMBDA in constants.ts) — its
 * volatility is set lower than its 8-year nominal duration alone would
 * suggest, modeling the simplification that being UVR-indexed (inflation-
 * linked) shields it from unexpected-inflation risk that a nominal bond of
 * the same duration would carry. ACC's volatility is set high enough that
 * its raw 14% yield is NOT worth the risk on a risk-adjusted basis —
 * "castigar a los equipos que elijan los activos más volátiles" is a
 * deliberate design goal, not an incidental side effect.
 */
export const INSTRUMENTS: readonly Instrument[] = [
  { id: "LIQ", nombre: "Caja / Fondo de liquidez", yield: 0.05, volAnual: 0.01, plazoM: 0, nota: "Liquidez total, rendimiento bajo, riesgo mínimo" },
  { id: "CDT90", nombre: "CDT 90 días", yield: 0.095, volAnual: 0.032, plazoM: 3, nota: "Corto plazo, baja liquidez intermedia, riesgo bajo" },
  { id: "TES1", nombre: "TES tasa fija 1 año", yield: 0.105, volAnual: 0.04, plazoM: 12, nota: "Cubre pasivos del primer año, riesgo de tasa moderado" },
  {
    id: "TES3",
    nombre: "TES tasa fija 3 años",
    yield: 0.115,
    volAnual: 0.07,
    plazoM: 36,
    nota: "Cubre cola del desarrollo, mayor riesgo de tasa por duración. Paga cupón anual, a la par",
  },
  {
    id: "TESUVR8",
    nombre: "TES UVR 8 años",
    yield: 0.12,
    volAnual: 0.06,
    plazoM: 96,
    nota: "Alto rendimiento y duración, indexado a inflación. Paga cupón anual, a la par",
  },
  {
    id: "ACC",
    nombre: "Renta variable (acciones)",
    yield: 0.14,
    volAnual: 0.2,
    plazoM: 999,
    nota: "Mayor retorno esperado, sin flujo definido, alto riesgo",
  },
];

export const INSTRUMENT_BY_ID: Record<string, Instrument> = Object.fromEntries(
  INSTRUMENTS.map((x) => [x.id, x])
);

/**
 * Yield to show a team for a given instrument — identical to `ins.yield`
 * for every instrument except TESUVR8, which displays net of
 * `GENERAL_INFLATION_ANNUAL` instead of nominal: `(1+yield)/(1+inflación)
 * - 1`. Presentation only — `ins.yield` itself, and every internal
 * calculation that reads it (ALM, Markowitz, scoring), stays nominal and
 * untouched; this function is never called from the simulation engine.
 *
 * Deliberate: TESUVR8 is UVR-indexed (see its `nota`), so a genuine
 * above-inflation return is its real selling point — showing its nominal
 * rate side by side with five nominally-quoted instruments would let a
 * team compare it apples-to-apples without ever noticing it isn't the same
 * basis. A team has to recognize that TESUVR8's headline number already
 * strips out inflation and re-add it back before comparing fairly against
 * the rest of the (nominal) menu. Not disclosed as a number anywhere in
 * product copy — same pattern as CLAIMS_INFLATION_ANNUAL/
 * GENERAL_INFLATION_ANNUAL themselves.
 */
export function displayYield(ins: Instrument): number {
  if (ins.id !== "TESUVR8") return ins.yield;
  return (1 + ins.yield) / (1 + GENERAL_INFLATION_ANNUAL) - 1;
}

/**
 * Formatted yield label for a reference/menu table — `displayYield()`
 * rendered as a percentage, prefixed "Inflación + " for TESUVR8 so a team
 * reads it as explicitly not-nominal (the whole point of the trap in
 * `displayYield()`'s doc comment) without the prefix itself giving away
 * what the inflation number actually is. Not used inside the interactive
 * portfolio-building forms (PortfolioForm/MinVarianceForm) — those omit
 * yield entirely, since showing it there alongside an aggregate expected-
 * return figure computed from the true nominal `ins.yield` would let a
 * team back out the exact inflation rate by comparing the two.
 *
 * TES3 is framed as its own coupon payment ("Cupón X% anual") instead of a
 * bare yield — the same number either way (a coupon bond priced at par
 * always has coupon rate = yield, see isCouponBond()'s doc comment and
 * pvCouponCashflows() in alm.ts for the identity), but naming it as the
 * cash the position actually pays out each year is what a team needs to
 * apply the bond-pricing equation (VP = cupón × anualidad + VP del
 * principal) directly, rather than re-deriving the coupon from a labeled
 * "yield" first. TESUVR8 deliberately keeps the plain yield framing (still
 * net of inflation, per displayYield() above) — its own coupon-vs-yield
 * relationship is left for a team to work out, same trap as the rest of
 * displayYield()'s doc comment.
 */
export function displayYieldLabel(ins: Instrument): string {
  const pct = `${(displayYield(ins) * 100).toFixed(1)}%`;
  if (ins.id === "TESUVR8") return `Inflación + ${pct}`;
  if (ins.id === "TES3") return `Cupón ${pct} anual`;
  return pct;
}

export const YIELD_MIN = Math.min(...INSTRUMENTS.map((x) => x.yield));
export const YIELD_MAX = Math.max(...INSTRUMENTS.map((x) => x.yield));
export const VOL_MIN = Math.min(...INSTRUMENTS.map((x) => x.volAnual));
export const VOL_MAX = Math.max(...INSTRUMENTS.map((x) => x.volAnual));
/** Simple (unweighted) average volatility across the menu — the "neutral" baseline a flat-rate financial risk charge implicitly assumed before per-team volatility was tracked. Used by finBench() to scale the Día 4 financial risk charge relative to a team's actual choice. */
export const VOL_MENU_AVG = INSTRUMENTS.reduce((s, x) => s + x.volAnual, 0) / INSTRUMENTS.length;

/** A team's target allocation: instrument id -> weight (not necessarily normalized to 1). */
export type Allocation = Record<string, number>;

/**
 * Only bond-like instruments (a real, fixed numeric term) mature on their
 * own contractual term — LIQ (plazoM===0, cash-equivalent) and ACC
 * (plazoM>=400, the "no defined maturity" sentinel for equities) have no
 * fixed term, so instrumentDurationM() below assigns each its own engine
 * rule instead.
 */
export function isBondLike(ins: Instrument): boolean {
  return ins.plazoM > 0 && ins.plazoM < 400;
}

/**
 * TES3 and TESUVR8 pay an annual cash coupon (equal to the position's own
 * `ins.yield` on its current book value) instead of accruing silently as a
 * single zero-coupon lump sum paid at maturity — see stepMonth()'s coupon
 * handling in alm.ts. CDT90 (3mo) and TES1 (12mo) stay zero-coupon: their
 * terms are too short for an interim coupon to mean anything (CDT90 matures
 * in under a year; TES1's own maturity already IS its first coupon date).
 * See RATE_LOADING in markowitz.ts for the Día 1 portfolio-optimization
 * consequence of this (a coupon bond's genuine interest-rate exposure is
 * lower than its maturity alone suggests).
 */
export function isCouponBond(ins: Instrument): boolean {
  return ins.id === "TES3" || ins.id === "TESUVR8";
}

/**
 * A team's investing instruction for a single month: the same flat
 * {instrumentId: weight} shape as a Día 1 Allocation (not required to sum to
 * 100, normalized when funded). It stays in effect from `month` onward,
 * until a later entry in the same schedule overrides it — see
 * activeAllocation() in alm.ts.
 */
export interface MonthlyAllocationEntry {
  month: number;
  allocation: Allocation;
}

/**
 * A team's full Día 2 portfolio decision: a sparse, ascending schedule of
 * monthly checkpoints (see MonthlyAllocationEntry) instead of a one-time
 * tree. The month-0 entry is mandatory (the starting allocation); every
 * later entry is an explicit "change my strategy from this month on" —
 * unlisted months keep whatever the previous checkpoint said. Reinvestment
 * of matured principal is no longer a per-position rule (onMaturity):
 * everything that matures becomes available cash that month, and the
 * checkpoint active THAT month decides where it goes next, same as any
 * other month's surplus.
 */
export interface PortfolioDecisionV4 {
  schedule: MonthlyAllocationEntry[];
}

/** Defensive ceiling for isPortfolioDecisionV4 — a schedule can't usefully have more checkpoints than almSim's own 60-month horizon (BUILD_MONTHS + HORIZON). */
export const MAX_SCHEDULE_ENTRIES = 60;

/**
 * An instrument's own holding period in months before its principal matures
 * back into the investable pool. Bond-like instruments always use their
 * fixed contractual term (ins.plazoM). LIQ — genuinely liquid — rolls every
 * month. ACC has no real-world term at all; the team no longer chooses one
 * (that was a Tranche-only concept), so the engine fixes it at ACC_ROLL_M.
 */
export function instrumentDurationM(ins: Instrument): number {
  if (isBondLike(ins)) return ins.plazoM;
  if (ins.id === "LIQ") return 1;
  return ACC_ROLL_M;
}

function isValidMonthlyAllocationEntry(value: unknown): value is MonthlyAllocationEntry {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.month !== "number" || !Number.isInteger(v.month) || v.month < 0) return false;
  return isMinVarianceAllocation(v.allocation);
}

/**
 * Guards against a stored PortfolioAllocation.allocation predating this
 * shape (the old tree-based PortfolioDecisionV3, or anything older) — none
 * of those have a `schedule` key, so they're rejected automatically and
 * treated as "no decision submitted yet," the same graceful-degradation
 * pattern the previous version already used for ITS predecessors. This is
 * also the real security boundary for client-submitted JSON (see
 * submitPortfolioAction) — strict, not just a shallow shape check.
 */
export function isPortfolioDecisionV4(value: unknown): value is PortfolioDecisionV4 {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    !Array.isArray(v.schedule) ||
    v.schedule.length === 0 ||
    v.schedule.length > MAX_SCHEDULE_ENTRIES ||
    !v.schedule.every((e) => isValidMonthlyAllocationEntry(e))
  ) {
    return false;
  }
  const schedule = v.schedule as MonthlyAllocationEntry[];
  if (schedule[0].month !== 0) return false;
  for (let i = 1; i < schedule.length; i++) {
    if (schedule[i].month <= schedule[i - 1].month) return false;
  }
  return true;
}

/**
 * Guards a Día 1 minimum-variance submission: a flat {instrumentId: weight}
 * map, one entry per instrument in the menu (no more, no less — a team
 * can't silently omit an instrument to dodge it, must explicitly weight it
 * 0), every weight a finite number >= 0. Distinguishes this shape from
 * PortfolioDecisionV4 (which has a `schedule` key instead) at the top
 * level — both are stored in the same PortfolioAllocation.allocation Json
 * column, keyed by day (day=1 is always this shape; day=2's checkpoints
 * reuse this same guard per-entry, see isValidMonthlyAllocationEntry).
 */
export function isMinVarianceAllocation(value: unknown): value is Allocation {
  if (typeof value !== "object" || value === null || "schedule" in value) return false;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  if (keys.length !== INSTRUMENTS.length) return false;
  return INSTRUMENTS.every((ins) => typeof v[ins.id] === "number" && Number.isFinite(v[ins.id]) && (v[ins.id] as number) >= 0);
}
