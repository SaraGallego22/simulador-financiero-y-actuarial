import { describe, expect, it } from "vitest";
import {
  BYTES_PER_PREMIUM,
  TARIFF_CHUNK_ROWS,
  UNSENT_PREMIUM,
  UNSENT_PREMIUM_FLOAT32_LE_HEX,
  chunkByteRange,
  chunkCount,
  isSentPremium,
} from "./tariffUpload";

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

describe("UNSENT_PREMIUM sentinel", () => {
  it("is NaN, and isSentPremium distinguishes it from an explicit premium of 0", () => {
    expect(Number.isNaN(UNSENT_PREMIUM)).toBe(true);
    expect(isSentPremium(UNSENT_PREMIUM)).toBe(false);
    expect(isSentPremium(0)).toBe(true);
    expect(isSentPremium(1_000_000)).toBe(true);
  });

  it("survives a Float32Array round trip as NaN", () => {
    const arr = new Float32Array(3).fill(UNSENT_PREMIUM);
    arr[1] = 0;
    expect(Number.isNaN(arr[0])).toBe(true);
    expect(arr[1]).toBe(0);
    expect(Number.isNaN(arr[2])).toBe(true);
  });

  it("UNSENT_PREMIUM_FLOAT32_LE_HEX matches the actual little-endian byte pattern Node produces for a NaN-filled Float32Array", () => {
    const arr = new Float32Array(1).fill(UNSENT_PREMIUM);
    const hex = Buffer.from(arr.buffer).toString("hex");
    expect(hex).toBe(UNSENT_PREMIUM_FLOAT32_LE_HEX);
  });
});
