import { describe, expect, it } from "vitest";
import { seedRand } from "./rng";

describe("seedRand", () => {
  it("is deterministic for a given seed", () => {
    const a = seedRand(42);
    const b = seedRand(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = seedRand(42);
    const b = seedRand(43);
    expect(a()).not.toBeCloseTo(b(), 5);
  });

  it("stays within (0, 1)", () => {
    const r = seedRand(1);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("matches the legacy prototype's first draws for seed=42", () => {
    // Cross-checked against seedRand() in Pasantia_SURA_v3_inversiones_dinamicas.html
    const r = seedRand(42);
    expect(r()).toBeCloseTo(0.0003287070433876543, 12);
    expect(r()).toBeCloseTo(0.5245871017916008, 12);
  });
});
