import { describe, expect, it } from "vitest";
import { computeSegmentData, recomendacionCorrecta, scoreAnalitica, segmentKeysFor, SEGMENTS } from "./analytics";

describe("recomendacionCorrecta", () => {
  it("recommends disminuir above LR_ALTO, crecer below LR_BAJO, mantener in between", () => {
    expect(recomendacionCorrecta(1.2)).toBe("disminuir");
    expect(recomendacionCorrecta(0.5)).toBe("crecer");
    expect(recomendacionCorrecta(0.92)).toBe("mantener");
    expect(recomendacionCorrecta(null)).toBeNull();
  });
});

describe("segmentKeysFor / computeSegmentData", () => {
  it("buckets an exposure into all 4 dimensions", () => {
    const keys = segmentKeysFor({ zona: "urbana", uso: "comercial", edad: 25, estrato: 1 });
    expect(keys).toEqual(["zona:urbana", "uso:comercial", "edad:joven", "estrato:bajo"]);
  });

  it("aggregates premium/claims per segment across rows", () => {
    const rows = [
      { premium: 100, hasClaim: false, claimAmount: 0, segmentKeys: segmentKeysFor({ zona: "urbana", uso: "personal", edad: 25, estrato: 1 }) },
      { premium: 100, hasClaim: true, claimAmount: 150, segmentKeys: segmentKeysFor({ zona: "urbana", uso: "personal", edad: 40, estrato: 3 }) },
    ];
    const data = computeSegmentData(rows);
    expect(data["zona:urbana"].prima).toBe(200);
    expect(data["zona:urbana"].sev).toBe(150);
    expect(data["zona:urbana"].lr).toBeCloseTo(0.75, 6);
  });
});

describe("scoreAnalitica", () => {
  it("scores 100 when every recommendation matches the actual loss ratio", () => {
    const segmentData = Object.fromEntries(SEGMENTS.map((s) => [s.key, { prima: 100, sev: 120, lr: 1.2 }]));
    const recommendations = Object.fromEntries(SEGMENTS.map((s) => [s.key, "disminuir" as const]));
    expect(scoreAnalitica(recommendations, segmentData)).toBe(100);
  });

  it("returns null when there is nothing gradable", () => {
    expect(scoreAnalitica({}, {})).toBeNull();
  });

  it("scores partial credit for partially correct recommendations", () => {
    const segmentData = {
      "zona:urbana": { prima: 100, sev: 120, lr: 1.2 }, // should be "disminuir"
      "zona:rural": { prima: 100, sev: 50, lr: 0.5 }, // should be "crecer"
    };
    const recommendations = { "zona:urbana": "disminuir" as const, "zona:rural": "disminuir" as const };
    expect(scoreAnalitica(recommendations, segmentData)).toBe(50);
  });
});
