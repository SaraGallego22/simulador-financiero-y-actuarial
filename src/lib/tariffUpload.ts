/**
 * Shared between client (chunking a Float32Array before upload) and server
 * (reassembling chunks into the stored buffer). Kept isomorphic — no
 * server-only or browser-only APIs — see CLAUDE.md §4.3 for why uploads are
 * chunked in the first place (Vercel's 4.5 MB request body limit).
 */
export const TARIFF_CHUNK_ROWS = 200_000;
export const BYTES_PER_PREMIUM = 4; // Float32

export function chunkCount(totalRows: number): number {
  return Math.ceil(totalRows / TARIFF_CHUNK_ROWS);
}

export function chunkByteRange(chunkIndex: number, totalRows: number): { start: number; end: number } {
  const start = chunkIndex * TARIFF_CHUNK_ROWS * BYTES_PER_PREMIUM;
  const end = Math.min(start + TARIFF_CHUNK_ROWS * BYTES_PER_PREMIUM, totalRows * BYTES_PER_PREMIUM);
  return { start, end };
}

/**
 * Minimum fraction of exposures that must have a nonzero premium for a
 * submission to count as complete. A premium of exactly 0 — whether a row
 * was never in the team's CSV at all, or the row was there with an explicit
 * 0 — reads identically once stored (a fresh TariffSubmission.data blob
 * starts zero-filled, see teams/tariffs/route.ts's overlay() calls), so
 * both are treated as "not priced" everywhere downstream: this coverage
 * check, meanPremium/medianPremium (tariffAccess.ts's medianOfPositive),
 * and the market engine's own eligibility gate (runSimulation.ts's
 * isPriced()) all use the same ">0" rule for exactly this reason — a team
 * is simply not a candidate for an exposure it left at 0, by design, not
 * just as an upload-completeness threshold.
 */
export const MIN_COVERAGE = 0.95;
