export type SegmentDimension = "zona" | "uso" | "edad" | "estrato";
export type Recommendation = "crecer" | "disminuir" | "mantener";

export interface SegmentDef {
  key: string;
  dim: SegmentDimension;
  val: string;
  label: string;
}

const SEG_DIMS: { dim: SegmentDimension; label: string; keys: string[] }[] = [
  { dim: "zona", label: "Zona", keys: ["urbana", "suburbana", "rural"] },
  { dim: "uso", label: "Uso", keys: ["personal", "comercial", "mixto"] },
  { dim: "edad", label: "Edad", keys: ["joven", "medio", "mayor"] },
  { dim: "estrato", label: "Estrato", keys: ["bajo", "medio", "alto"] },
];

/** Sector segmentation dimensions, ported from SEG_DIMS/SEGMENTOS, line ~1200. */
export const SEGMENTS: SegmentDef[] = SEG_DIMS.flatMap((d) =>
  d.keys.map((k) => ({ key: `${d.dim}:${k}`, dim: d.dim, val: k, label: `${d.label}: ${k}` }))
);
export const SEGMENT_BY_KEY: Record<string, SegmentDef> = Object.fromEntries(SEGMENTS.map((s) => [s.key, s]));

export const LR_ALTO = 1.0;
export const LR_BAJO = 0.85;

/** Ported from recomendacionCorrecta(), line ~1221. */
export function recomendacionCorrecta(lossRatio: number | null): Recommendation | null {
  if (lossRatio == null) return null;
  if (lossRatio > LR_ALTO) return "disminuir";
  if (lossRatio < LR_BAJO) return "crecer";
  return "mantener";
}

/** Assigns an exposure to its 4 segment keys (one per dimension), mirroring each SEG_DIMS.fn(). */
export function segmentKeysFor(exposure: { zona: string; uso: string; edad: number; estrato: number }): string[] {
  const edadBucket = exposure.edad < 30 ? "joven" : exposure.edad <= 50 ? "medio" : "mayor";
  const estratoBucket = exposure.estrato <= 2 ? "bajo" : exposure.estrato <= 4 ? "medio" : "alto";
  return [`zona:${exposure.zona}`, `uso:${exposure.uso}`, `edad:${edadBucket}`, `estrato:${estratoBucket}`];
}

export interface SegmentLossRatio {
  prima: number;
  sev: number;
  lr: number | null;
}

/**
 * Aggregates premium/claims by segment for one team's book of business.
 * Ported from the accumulation loop inside precomputeSegmentos(), line ~1209.
 */
export function computeSegmentData(
  rows: { premium: number; hasClaim: boolean; claimAmount: number; segmentKeys: string[] }[]
): Record<string, SegmentLossRatio> {
  const acc: Record<string, { p: number; s: number }> = {};
  for (const row of rows) {
    for (const key of row.segmentKeys) {
      if (!acc[key]) acc[key] = { p: 0, s: 0 };
      acc[key].p += row.premium;
      if (row.hasClaim) acc[key].s += row.claimAmount;
    }
  }
  const out: Record<string, SegmentLossRatio> = {};
  for (const [key, v] of Object.entries(acc)) {
    out[key] = { prima: v.p, sev: v.s, lr: v.p > 0 ? v.s / v.p : null };
  }
  return out;
}

/**
 * Grades a team's Day-4 sector recommendations against actual segment loss
 * ratios. Ported from scoreAnalitica(), line ~1222.
 */
export function scoreAnalitica(
  recommendations: Partial<Record<string, Recommendation>>,
  segmentData: Record<string, SegmentLossRatio>
): number | null {
  let hits = 0;
  let total = 0;
  for (const seg of SEGMENTS) {
    const d = segmentData[seg.key];
    if (!d || d.lr == null) continue;
    const rec = recommendations[seg.key];
    if (rec == null) continue;
    total++;
    if (rec === recomendacionCorrecta(d.lr)) hits++;
  }
  return total > 0 ? (100 * hits) / total : null;
}
