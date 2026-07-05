import { CAL_FREQ } from "../generation/constants";
import type { Brand, ColombiaExposure } from "./types";

/**
 * Claim-frequency (lambda) model for a Colombia exposure. Multiplicative
 * GLM-style build-up with two-way interactions, plus two deliberately weak
 * "trap" variables (gender, brand) with near-zero net effect once other risk
 * factors are controlled for — interns overfitting to these should be a red
 * flag when grading, not a sign of skill. Truncated to [0.01, 0.94].
 *
 * Ported verbatim (same coefficients/thresholds) from calcLambda() in the
 * legacy prototype, line ~2490.
 */
export function calcLambda(e: ColombiaExposure): number {
  let f = 0.065;

  const ed = e.edad;
  if (ed <= 24) f *= 1.9;
  else if (ed <= 35) f *= 1.0;
  else if (ed <= 55) f *= 0.82;
  else if (ed <= 65) f *= 1.2;
  else f *= 1.55;

  if (e.zona === "urbana") f *= 1.45;
  else if (e.zona === "rural") f *= 0.7;

  if (e.tipo === "deportivo") f *= 1.38;
  else if (e.tipo === "suv" || e.tipo === "pickup") f *= 1.12;
  else if (e.tipo === "van") f *= 1.08;

  const historyFactor = [0.75, 1.3, 1.85, 2.6, 3.2, 3.2];
  f *= historyFactor[Math.min(e.hist, 5)];

  f *= CAL_FREQ;

  const km = e.km;
  if (km < 15000) f *= 0.75;
  else if (km <= 40000) f *= 1.0;
  else if (km <= 70000) f *= 1.25;
  else f *= 1.6;

  if (e.uso === "comercial") f *= 1.7;
  else if (e.uso === "mixto") f *= 1.3;

  if (e.parq === "si") f *= 0.82;

  if (e.edu === "basica") f *= 1.25;
  else if (e.edu === "tecnica") f *= 1.1;
  else if (e.edu === "posgrado") f *= 0.9;

  if (e.antig <= 3) f *= 1.05;
  else if (e.antig > 12) f *= 1.08;

  // Interactions
  if (ed <= 24 && e.tipo === "deportivo") f *= 1.4;
  else if (ed <= 24 && (e.tipo === "suv" || e.tipo === "pickup")) f *= 1.15;

  if (e.zona === "urbana" && e.uso === "comercial") f *= 1.35;
  else if (e.zona === "rural" && e.uso === "comercial") f *= 1.1;

  if (e.hist >= 2 && e.antig >= 8) f *= 1.25;
  if (ed <= 24 && e.edu === "basica") f *= 1.2;

  // Weak "trap" variables
  if (e.genero === "M") f *= 1.04;
  else f *= 0.96;

  const estratoFactor = [1.05, 1.03, 1.01, 0.99, 0.97, 0.95];
  f *= estratoFactor[Math.min(e.estrato - 1, 5)];

  const marcaFactor: Record<Brand, number> = {
    chevrolet: 1.02,
    renault: 1.01,
    mazda: 0.99,
    toyota: 0.97,
    nissan: 1.01,
    hyundai: 0.99,
    kia: 0.98,
    ford: 1.02,
  };
  f *= marcaFactor[e.marca] ?? 1.0;

  return Math.min(Math.max(f, 0.01), 0.94);
}
