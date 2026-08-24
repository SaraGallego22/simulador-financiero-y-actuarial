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
 * repricing both lines with the same rate, not an independent result.
 */
export function projectYear3(i: Year3ProjectionInput): Year3Projection | null {
  if (i.year1InsuredCount <= 0 || i.year2InsuredCount <= 0 || i.claimCountY2 <= 0) return null;

  const retentionRate = i.year2Retention.retainedCount / i.year1InsuredCount;
  const insuredCount3 = retentionRate * i.year2InsuredCount + i.year2Retention.newCount;
  const avgPremiumPerPolicy2 = i.year2PrimaEmitida / i.year2InsuredCount;
  const prima3 = insuredCount3 * avgPremiumPerPolicy2 * (1 + CLAIMS_INFLATION_ANNUAL);

  const frecuencia2 = i.claimCountY2 / i.year2InsuredCount;
  const severidad3 = (i.ultY2 / i.claimCountY2) * (1 + CLAIMS_INFLATION_ANNUAL);
  const costo3 = insuredCount3 * frecuencia2 * severidad3;

  // Cuánto del siniestro propio de Año 3 alcanza a pagarse dentro del mismo
  // Año 3: la velocidad real que el equipo ya mostró en Año 2 (paidY2inY2 ÷
  // ultY2), no una convención — misma lógica que la frecuencia y la severidad,
  // que también salen del Año 2 observado. Sin ese dato cae al ritmo genérico
  // del kernel.
  //
  // No es DEV_FRAC[0]: ese 55% es lo que se paga en los primeros 12 meses
  // *desde el primer pago*, que llega 3 meses después del aviso — usarlo como
  // si fuera "dentro del año de accidente" triplicaba los pagos del año y
  // dejaba la reserva de Año 3 en 45% del último, contra el ~83% que la
  // convolución real deja en Año 1 y Año 2.
  const velocidadPago =
    i.paidY2inY2 != null && i.ultY2 > 0 ? Math.min(1, Math.max(0, i.paidY2inY2 / i.ultY2)) : PAID_WITHIN_ACCIDENT_YEAR;
  // El perfil mensual sí viene del kernel (nada se paga los primeros meses,
  // y de ahí en adelante crece), reescalado a esa velocidad.
  const escala = PAID_WITHIN_ACCIDENT_YEAR > 0 ? velocidadPago / PAID_WITHIN_ACCIDENT_YEAR : 0;
  const ownClaimsSchedule12 = ACCIDENT_YEAR_PAYMENT_SHARE.map((share) => costo3 * share * escala);
  const reservas3 = i.osY1endY3 + i.osY2endY3 + costo3 * (1 - velocidadPago);

  return { insuredCount3, prima3, costo3, reservas3, ownClaimsSchedule12 };
}
