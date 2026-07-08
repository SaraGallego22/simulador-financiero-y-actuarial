import { toFloat32View } from "./binary";
import { generateOutsourcedTariff } from "@/domain/pricing/outsourced";
import { N_COLOMBIA } from "@/domain/generation/constants";
import type { ColombiaUniverse } from "@/domain/generation/generateColombia";

/**
 * Resolves a TariffSubmission's per-exposure premium array — the one branch
 * point every reader (simulation route, team report route) needs, since an
 * outsourced submission has no stored `data` (see schema.prisma's doc
 * comment on TariffSubmission.data): it's regenerated on demand from the
 * universe instead, exactly like the universe itself never being persisted
 * (CLAUDE.md §4.1).
 */
export function getTariffArray(
  submission: { data: Uint8Array | null; outsourced: boolean },
  universe: ColombiaUniverse
): Float32Array {
  if (submission.outsourced) return generateOutsourcedTariff(universe);
  if (!submission.data) throw new Error("La tarifa no tiene datos y no está marcada como tercerizada.");
  return toFloat32View(submission.data, N_COLOMBIA);
}
