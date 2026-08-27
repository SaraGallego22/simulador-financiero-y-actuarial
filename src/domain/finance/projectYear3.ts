import { CLAIMS_INFLATION_ANNUAL } from "../generation/constants";
import { ACCIDENT_YEAR_PAYMENT_SHARE, PAID_WITHIN_ACCIDENT_YEAR } from "../reserving/constants";

/**
 * Everything the Año 3 projection needs, in raw form — deliberately not
 * `FinBenchInput`/`PnL` shaped, so finBenchHelper.ts can build the
 * projection *before* calling finBench() (it needs prima3/costo3 to fund and
 * pay Año 3's real-ALM continuation, whose own result then feeds back into
 * finBench as almYear3). Both callers run this same function on the same
 * inputs, so there is exactly one definition of what Año 3 looks like.
 */
export interface Year3ProjectionInput {
  /** Año 1's real policy count — the denominator of the observed Año1->Año2 retention rate. */
  year1InsuredCount: number;
  year2InsuredCount: number;
  /** Año 2's real Prima Emitida (what the team actually collected). */
  year2PrimaEmitida: number;
  /** Año 2's real market outcome, from TeamSimResult.extra. */
  year2Retention: { retainedCount: number; newCount: number };
  /** development.claimCountY2 — Año 2's own accident-year claim count. */
  claimCountY2: number;
  /** development.ultY2 — Año 2's own accident-year ultimate. */
  ultY2: number;
  /** development.osY1endY3 / osY2endY3 — what's still open on Año 1's/Año 2's claims once calendar Año 3 closes. */
  osY1endY3: number;
  osY2endY3: number;
  /** development.paidY2inY2 — how much of Año 2's own ultimate was actually paid within Año 2 itself. Sets how fast Año 3's own claims are assumed to settle; omitted (or with ultY2 = 0) falls back to PAID_WITHIN_ACCIDENT_YEAR, the kernel's own generic rate. */
  paidY2inY2?: number;
  /**
   * A team's own Día-3 "Prima emitida A3 (proy.)" submission, when it
   * exceeds the mechanical baseline below — Año 3 has no real market to
   * observe, so a team is allowed to propose a genuine growth strategy for
   * it instead of only ever reproducing the mechanical projection (see
   * concepts.ts's p3_primaEmitida: `scoringMode: "atLeast"` grades the
   * baseline as the floor, not the target — more is never penalized).
   * Ignored (baseline wins, as if this were omitted) when null/undefined or
   * not strictly greater than the baseline — a team can't shrink Año 3
   * below the mechanical floor this way, only grow it.
   */
  primaOverride?: number | null;
}

export interface Year3Projection {
  insuredCount3: number;
  prima3: number;
  /** Año 3's own projected accident-year ultimate — the P&G's `costo` line. */
  costo3: number;
  /** Reserva técnica at Año 3's close: Año 1's and Año 2's remaining tails plus Año 3's own unpaid share. */
  reservas3: number;
  /** The 12 monthly payments Año 3's OWN projected claims settle within Año 3 itself — the caller adds Año 1's and Año 2's real tails landing in the same calendar year before handing the schedule to almSimRealYear(3, ...). Σ = costo3 × the payment speed described in the doc comment; the reserve below is exactly the complement. */
  ownClaimsSchedule12: number[];
}

/**
 * Año 3 is never simulated — there is no third market and no third accident
 * year — so its P&G is projected from what Año 1 and Año 2 really produced.
 * Returns null when the real inputs it needs don't exist yet (no Año 2
 * result, no retention split, a team with no claims at all in Año 2), which
 * is what makes finBench() fall back to its flat growth-rate projection.
 *
 * Prima: retained + new policies (Año 2's real market outcome), not a flat
 * growth rate on the premium total — but each policy's own premium is
 * repriced by CLAIMS_INFLATION_ANNUAL, since a team repricing for Año 3
 * would carry the same claims-inflation assumption into next year's rate
 * rather than hold last year's average premium per policy flat.
 *
 * Costo: only Año 3's own projected accident-year claims — frequency held at
 * Año 2's observed rate, severity inflated by the same CLAIMS_INFLATION_ANNUAL
 * (see that constant's doc comment for why this isn't double-counted against
 * the Chile real-trend clue). Año 1's/Año 2's real payment tails landing in
 * calendar Año 3 are deliberately NOT part of `costo3`: that money was
 * already recognized as incurred cost in its own accident year's P&G, so
 * counting it again here would double it. It is purely a Balance-side
 * reserve run-off — which is exactly why it belongs in the ALM's *cash*
 * schedule (real money leaving the portfolio) while staying out of the P&G.
 *
 * Note that `insuredCount3` and the inflation factor cancel in
 * `costo3 / prima3`: the projected loss ratio of Año 3 comes out identical
 * to Año 2's, whatever the retention. That's a direct consequence of
 * repricing both lines with the same rate, not an independent result. This
 * still holds under a growth override (see `primaOverride` below): scaling
 * `costo3` by the exact same factor as `prima3` cancels the factor out of
 * their ratio too, so growing Año 3 changes its size, never its loss ratio.
 *
 * `primaOverride`, when it genuinely exceeds this baseline `prima3`, replaces
 * it — the team's own growth hypothesis becomes Año 3's real premium — and
 * `costo3` scales by that exact same factor (`primaOverride / prima3`), by
 * construction preserving the baseline loss ratio: a team that grows the
 * book doesn't get to also improve (or worsen) its underlying risk quality
 * by choosing this number, only its volume. That same growth factor also
 * scales `ownClaimsSchedule12` (a pure linear function of `costo3`) and the
 * Año-3-own share of `reservas3` — never `osY1endY3`/`osY2endY3`, Año 1's and
 * Año 2's own tails, which have nothing to do with Año 3's growth.
 * `insuredCount3` is deliberately NOT rescaled to match: the override doesn't
 * specify whether the growth comes from more policies or a higher average
 * premium, so this number keeps describing the baseline retention outcome,
 * not a back-solved policy count for the grown premium.
 */
export function projectYear3(i: Year3ProjectionInput): Year3Projection | null {
  if (i.year1InsuredCount <= 0 || i.year2InsuredCount <= 0 || i.claimCountY2 <= 0) return null;

  const retentionRate = i.year2Retention.retainedCount / i.year1InsuredCount;
  const insuredCount3 = retentionRate * i.year2InsuredCount + i.year2Retention.newCount;
  const avgPremiumPerPolicy2 = i.year2PrimaEmitida / i.year2InsuredCount;
  const baselinePrima3 = insuredCount3 * avgPremiumPerPolicy2 * (1 + CLAIMS_INFLATION_ANNUAL);

  const frecuencia2 = i.claimCountY2 / i.year2InsuredCount;
  const severidad3 = (i.ultY2 / i.claimCountY2) * (1 + CLAIMS_INFLATION_ANNUAL);
  const baselineCosto3 = insuredCount3 * frecuencia2 * severidad3;

  const hasGrowth = i.primaOverride != null && i.primaOverride > baselinePrima3;
  const growthFactor = hasGrowth ? i.primaOverride! / baselinePrima3 : 1;
  const prima3 = hasGrowth ? i.primaOverride! : baselinePrima3;
  const costo3 = baselineCosto3 * growthFactor;

  // Cuánto del siniestro propio de Año 3 alcanza a pagarse dentro del mismo
  // Año 3: la velocidad real que el equipo ya mostró en Año 2 (paidY2inY2 ÷
  // ultY2), no una convención — misma lógica que la frecuencia y la severidad,
  // que también salen del Año 2 observado. Sin ese dato cae al ritmo genérico
  // del kernel.
  //
  // Ojo con no confundirla con el rezago de pago en sí: un siniestro se paga
  // completo 3 meses después de su aviso, pero lo que se paga *dentro del año
  // de accidente* depende además de cuándo se avisó cada uno — los de octubre
  // en adelante no alcanzan a pagarse dentro del año, y son parte de la
  // reserva de cierre.
  const velocidadPago =
    i.paidY2inY2 != null && i.ultY2 > 0 ? Math.min(1, Math.max(0, i.paidY2inY2 / i.ultY2)) : PAID_WITHIN_ACCIDENT_YEAR;
  // El perfil mensual sí viene del kernel (nada se paga los primeros meses,
  // y de ahí en adelante crece), reescalado a esa velocidad.
  const escala = PAID_WITHIN_ACCIDENT_YEAR > 0 ? velocidadPago / PAID_WITHIN_ACCIDENT_YEAR : 0;
  const ownClaimsSchedule12 = ACCIDENT_YEAR_PAYMENT_SHARE.map((share) => costo3 * share * escala);
  const reservas3 = i.osY1endY3 + i.osY2endY3 + costo3 * (1 - velocidadPago);

  return { insuredCount3, prima3, costo3, reservas3, ownClaimsSchedule12 };
}
