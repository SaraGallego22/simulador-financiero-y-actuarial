import { describe, expect, it } from "vitest";
import { BYTES_PER_PREMIUM, TARIFF_CHUNK_ROWS, chunkByteRange, chunkCount } from "./tariffUpload";

describe("tariff upload chunking", () => {
  it("computes the expected number of chunks", () => {
    expect(chunkCount(1_000_000)).toBe(Math.ceil(1_000_000 / TARIFF_CHUNK_ROWS));
    expect(chunkCount(TARIFF_CHUNK_ROWS)).toBe(1);
    expect(chunkCount(TARIFF_CHUNK_ROWS + 1)).toBe(2);
  });

  it("produces contiguous, non-overlapping byte ranges covering the whole buffer", () => {
    const totalRows = 1_000_000;
    const total = chunkCount(totalRows);
    let expectedStart = 0;
    for (let i = 0; i < total; i++) {
      const { start, end } = chunkByteRange(i, totalRows);
      expect(start).toBe(expectedStart);
      expect(end).toBeGreaterThan(start);
      expectedStart = end;
    }
    expect(expectedStart).toBe(totalRows * BYTES_PER_PREMIUM);
  });

  it("keeps every chunk under Vercel's 4.5MB request body limit", () => {
    const totalRows = 1_000_000;
    const total = chunkCount(totalRows);
    for (let i = 0; i < total; i++) {
      const { start, end } = chunkByteRange(i, totalRows);
      expect(end - start).toBeLessThan(4.5 * 1024 * 1024);
    }
  });
});
