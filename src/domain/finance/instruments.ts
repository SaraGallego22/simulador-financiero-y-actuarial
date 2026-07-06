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
 * What happens to the proceeds when a specific instrument matures: either
 * held as cash (available to cover a Caja Mínima shortfall, or sit idle),
 * or reinvested into another instrument — which itself, on its own future
 * maturity, is governed by whatever rule is keyed under *its* id, forming a
 * chain. A rule can point back at its own instrument id ("CDT90 matures ->
 * reinvest in CDT90") to model an indefinitely rolling ladder without any
 * special-casing in the engine.
 */
export type MaturityAction = { action: "cash" } | { action: "reinvest"; instrumentId: string };

/** Per-instrument maturity rules, keyed by instrument id. */
export type MaturityRules = Record<string, MaturityAction>;

/**
 * A team's full portfolio decision for a day: `allocation` is where fresh
 * surplus cash gets invested every month (any month a team has money to
 * put to work with no more specific rule overriding it), and
 * `maturityRules` says what happens when a *specific* instrument matures —
 * see almSim()'s doc comment for the full rationale. An instrument with no
 * entry in `maturityRules` falls back to `allocation` when it matures,
 * so a team can set Day 1's allocation and never touch anything else.
 */
export interface PortfolioDecisionV2 {
  allocation: Allocation;
  maturityRules: MaturityRules;
}

/**
 * Guards against a stored PortfolioAllocation.allocation predating this
 * shape (e.g. the old {initial, reinvest} split, or an even older flat
 * {instrumentId: weight} object) — reads should treat any of those as "no
 * decision submitted yet" rather than crash.
 */
export function isPortfolioDecisionV2(value: unknown): value is PortfolioDecisionV2 {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.allocation !== "object" || v.allocation === null) return false;
  if (typeof v.maturityRules !== "object" || v.maturityRules === null) return false;
  for (const rule of Object.values(v.maturityRules as Record<string, unknown>)) {
    if (typeof rule !== "object" || rule === null) return false;
    const r = rule as Record<string, unknown>;
    if (r.action === "cash") continue;
    if (r.action === "reinvest" && typeof r.instrumentId === "string") continue;
    return false;
  }
  return true;
}

/**
 * Only bond-like instruments (a real numeric maturity) ever mature in
 * almSim()'s bucket logic — LIQ (plazoM===0, cash-equivalent) and ACC
 * (plazoM>=400, the "no defined maturity" sentinel for equities) never
 * trigger a maturity event, so they never need/use a maturity rule.
 */
export function isBondLike(ins: Instrument): boolean {
  return ins.plazoM > 0 && ins.plazoM < 400;
}
