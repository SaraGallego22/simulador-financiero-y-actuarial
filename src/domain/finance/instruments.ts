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
 * A team's full portfolio decision for a day: `initial` governs the Year-1
 * premium build-up, `reinvest` governs every reinvestment once that phase
 * ends (i.e., what happens as the initially-picked instruments mature) —
 * see almSim()'s doc comment for the full rationale.
 */
export interface PortfolioDecision {
  initial: Allocation;
  reinvest: Allocation;
}

/**
 * Guards against a stored PortfolioAllocation.allocation predating the
 * initial/reinvest split (a flat {instrumentId: weight} object) — reads
 * should treat that as "no decision submitted yet" rather than crash on
 * `.initial`/`.reinvest` being undefined.
 */
export function isPortfolioDecision(value: unknown): value is PortfolioDecision {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.initial === "object" && v.initial !== null && typeof v.reinvest === "object" && v.reinvest !== null;
}
