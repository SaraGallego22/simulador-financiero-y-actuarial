import type { ColombiaExposure } from "./types";

/**
 * Mean claim severity for a Colombia exposure, as a fraction of insured
 * vehicle value adjusted by type/zone/vintage. Feeds a Gamma draw at
 * generation time (see generateColombia). Ported verbatim from
 * calcMediaSev() in the legacy prototype, line ~2533.
 */
export function calcMediaSev(e: ColombiaExposure): number {
  const typeFactor =
    e.tipo === "deportivo"
      ? 0.19
      : e.tipo === "suv" || e.tipo === "pickup" || e.tipo === "van"
        ? 0.15
        : 0.12;

  let base = e.valor * typeFactor;
  if (e.zona === "urbana") base *= 1.28;
  else if (e.zona === "rural") base *= 0.82;

  if (e.antig <= 3) base *= 1.22;
  else if (e.antig > 10) base *= 0.72;

  return base;
}
