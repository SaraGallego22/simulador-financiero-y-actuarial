import type { ColombiaUniverse } from "@/domain/generation/generateColombia";

type TypedArrayCtor =
  | typeof Uint8Array
  | typeof Uint32Array
  | typeof Int32Array
  | typeof Float32Array
  | typeof Float64Array;

const FIELD_SPECS: { key: keyof ColombiaUniverse; ctor: TypedArrayCtor }[] = [
  { key: "edad", ctor: Uint8Array },
  { key: "tipo", ctor: Uint8Array },
  { key: "zona", ctor: Uint8Array },
  { key: "antig", ctor: Uint8Array },
  { key: "km", ctor: Uint32Array },
  { key: "hist", ctor: Uint8Array },
  { key: "valor", ctor: Float64Array },
  { key: "uso", ctor: Uint8Array },
  { key: "parq", ctor: Uint8Array },
  { key: "edu", ctor: Uint8Array },
  { key: "estrato", ctor: Uint8Array },
  { key: "genero", ctor: Uint8Array },
  { key: "marca", ctor: Uint8Array },
  { key: "lam", ctor: Float32Array },
  { key: "siniestro", ctor: Uint8Array },
  { key: "sev", ctor: Float32Array },
  { key: "fechaSinEpochDay", ctor: Int32Array },
  { key: "fechaAvisoEpochDay", ctor: Int32Array },
];

/**
 * Packs the Colombia universe's parallel typed arrays into a single Buffer
 * (4-byte row count header, then each field's raw bytes back to back, in a
 * fixed order). NOT currently used to persist the live universe — reading
 * back a ~40MB value this way measured 84-100s on Neon's free tier
 * regardless of connection method, so the app regenerates from the stored
 * `seed` instead (generation is deterministic and ~1s; see CLAUDE.md §4.1).
 * Kept for any future bulk-export/audit use where round-tripping through
 * Postgres is actually needed; covered by the round-trip tests below.
 */
export function serializeColombiaUniverse(u: ColombiaUniverse): Buffer {
  const parts: Buffer[] = [Buffer.alloc(4)];
  parts[0].writeUInt32LE(u.n, 0);
  for (const spec of FIELD_SPECS) {
    const arr = u[spec.key] as InstanceType<TypedArrayCtor>;
    parts.push(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength));
  }
  return Buffer.concat(parts);
}

export function deserializeColombiaUniverse(buf: Buffer): ColombiaUniverse {
  let offset = 0;
  const n = buf.readUInt32LE(offset);
  offset += 4;

  const result: Partial<ColombiaUniverse> & { n: number } = { n };
  for (const spec of FIELD_SPECS) {
    const byteLength = n * spec.ctor.BYTES_PER_ELEMENT;
    // Buffer.subarray's offset isn't guaranteed aligned to the element size,
    // so wrapping it directly in e.g. a Float64Array can throw. Copy into a
    // freshly-allocated (aligned) buffer instead.
    const aligned = new Uint8Array(byteLength);
    aligned.set(buf.subarray(offset, offset + byteLength));
    (result as Record<string, unknown>)[spec.key] = new spec.ctor(aligned.buffer);
    offset += byteLength;
  }
  return result as ColombiaUniverse;
}

/**
 * Safely views a byte buffer as a Float32Array of `length` elements,
 * regardless of the underlying buffer's byteOffset alignment — a
 * `Uint8Array` read back from Postgres (or copied via `Buffer.from`) isn't
 * guaranteed to start at a 4-byte-aligned offset, which would throw if
 * wrapped directly in a `Float32Array`. Copies only when actually needed.
 */
export function toFloat32View(data: Uint8Array, length: number): Float32Array {
  return toTypedArrayView(data, length, Float32Array, Float32Array.BYTES_PER_ELEMENT);
}

/** Same alignment-safety guarantee as toFloat32View, for Int32Array (e.g. SimulationRun.resultData). */
export function toInt32View(data: Uint8Array, length: number): Int32Array {
  return toTypedArrayView(data, length, Int32Array, Int32Array.BYTES_PER_ELEMENT);
}

function toTypedArrayView<T extends Float32Array | Int32Array>(
  data: Uint8Array,
  length: number,
  Ctor: new (buffer: ArrayBufferLike, byteOffset: number, length: number) => T,
  bytesPerElement: number
): T {
  const byteLength = length * bytesPerElement;
  if (data.byteOffset % bytesPerElement === 0 && data.buffer.byteLength >= data.byteOffset + byteLength) {
    return new Ctor(data.buffer, data.byteOffset, length);
  }
  const aligned = new Uint8Array(byteLength);
  aligned.set(data.subarray(0, byteLength));
  return new Ctor(aligned.buffer, 0, length);
}

/** Chile is a heterogeneous array of policy objects (not parallel typed arrays), so a single JSON blob is simplest — still one Bytes value per run, not one row per policy. */
export function serializeChilePolicies(policies: unknown): Buffer {
  return Buffer.from(JSON.stringify(policies), "utf-8");
}

export function deserializeChilePolicies<T>(buf: Buffer): T {
  return JSON.parse(buf.toString("utf-8")) as T;
}
