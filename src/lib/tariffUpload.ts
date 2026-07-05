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

/** Minimum fraction of exposures that must have a nonzero premium for a submission to count as complete. */
export const MIN_COVERAGE = 0.95;
