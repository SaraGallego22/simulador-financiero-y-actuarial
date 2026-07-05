import { describe, expect, it } from "vitest";
import { generateColombia } from "@/domain/generation/generateColombia";
import { deserializeColombiaUniverse, serializeColombiaUniverse, toFloat32View, toInt32View } from "./binary";

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

describe("toFloat32View", () => {
  const values = Float32Array.from([1, 2, 3, 4.5, -6]);

  it("reads back the same values when the source is already aligned", () => {
    const bytes = new Uint8Array(values.buffer);
    expect(Array.from(toFloat32View(bytes, values.length))).toEqual(Array.from(values));
  });

  it("reads back the same values when the source is NOT 4-byte aligned", () => {
    const padded = new Uint8Array(values.byteLength + 1);
    padded.set(new Uint8Array(values.buffer), 1);
    const misaligned = padded.subarray(1); // byteOffset = 1, not a multiple of 4
    expect(misaligned.byteOffset % 4).not.toBe(0);
    expect(Array.from(toFloat32View(misaligned, values.length))).toEqual(Array.from(values));
  });
});

describe("toInt32View", () => {
  const values = Int32Array.from([1, -2, 3, 400000, -5]);

  it("reads back the same values when the source is already aligned", () => {
    const bytes = new Uint8Array(values.buffer);
    expect(Array.from(toInt32View(bytes, values.length))).toEqual(Array.from(values));
  });

  it("reads back the same values when the source is NOT 4-byte aligned", () => {
    const padded = new Uint8Array(values.byteLength + 1);
    padded.set(new Uint8Array(values.buffer), 1);
    const misaligned = padded.subarray(1);
    expect(misaligned.byteOffset % 4).not.toBe(0);
    expect(Array.from(toInt32View(misaligned, values.length))).toEqual(Array.from(values));
  });
});
