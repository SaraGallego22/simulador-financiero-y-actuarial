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

/** Minimum fraction of exposures that must have been priced (sent, in either sense below) for a submission to count as complete. */
export const MIN_COVERAGE = 0.95;

/**
 * Sentinel premium meaning "this team never priced this exposure" — distinct
 * from an explicit premium of 0, which a team can legitimately submit (odd
 * as that is for insurance) and which still makes the exposure eligible to
 * pick that team. An unpriced exposure can never be assigned to the team
 * that didn't price it (see runSimulation.ts's isPriced()).
 *
 * NaN survives the Float32Array <-> bytea round trip untouched, and can
 * never be produced by a real CSV value: csvSchemas.ts's numericString
 * rejects any row that doesn't parse as a finite number before it reaches
 * this array, so NaN can only mean "never touched by an uploaded row."
 */
export const UNSENT_PREMIUM = NaN;

/** Whether `premium` represents a value the team actually submitted (0 included) rather than the UNSENT_PREMIUM default. */
export function isSentPremium(premium: number): boolean {
  return !Number.isNaN(premium);
}

/**
 * Little-endian IEEE754 float32 NaN as hex byte pairs — `00 00 c0 7f`, the
 * same bit pattern `new Float32Array(1).fill(NaN)` produces on Node's typed
 * arrays (platform-native = little-endian on every real deployment target
 * here). Used to seed a fresh/incomplete TariffSubmission.data blob as
 * "nothing priced yet" instead of "everything priced at 0" — see its use in
 * teams/tariffs/route.ts's overlay() calls.
 */
export const UNSENT_PREMIUM_FLOAT32_LE_HEX = "0000c07f";
