import { describe, expect, it } from "vitest";
import { generateColombia } from "@/domain/generation/generateColombia";
import { deserializeColombiaUniverse, serializeColombiaUniverse } from "./binary";

describe("Colombia universe binary (de)serialization", () => {
  it("round-trips every field exactly", () => {
    const original = generateColombia(42, 777);
    const buf = serializeColombiaUniverse(original);
    const restored = deserializeColombiaUniverse(buf);

    expect(restored.n).toBe(original.n);
    for (const key of [
      "edad",
      "tipo",
      "zona",
      "antig",
      "km",
      "hist",
      "valor",
      "uso",
      "parq",
      "edu",
      "estrato",
      "genero",
      "marca",
      "lam",
      "siniestro",
      "sev",
      "fechaSinEpochDay",
      "fechaAvisoEpochDay",
    ] as const) {
      expect(Array.from(restored[key])).toEqual(Array.from(original[key]));
    }
  });

  it("survives a round-trip through Buffer.concat at an odd byte offset (alignment check)", () => {
    // Prepend a single stray byte before concatenating, forcing every
    // subsequent field's subarray to start at a non-aligned offset — this is
    // exactly the scenario deserializeColombiaUniverse's aligned-copy guards.
    const original = generateColombia(1, 50);
    const packed = serializeColombiaUniverse(original);
    const withPadding = Buffer.concat([Buffer.from([0]), packed]).subarray(1);
    const restored = deserializeColombiaUniverse(Buffer.from(withPadding));
    expect(Array.from(restored.lam)).toEqual(Array.from(original.lam));
    expect(Array.from(restored.km)).toEqual(Array.from(original.km));
  });
});
