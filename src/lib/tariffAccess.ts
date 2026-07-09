import { toFloat32View } from "./binary";
import { prisma } from "./prisma";
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

/**
 * Whether a team's objective results for `day` are already published to
 * them — the same signal the team's own results tab already gates on. Used
 * to withhold an *outsourced* tariff's actual premium/CSV until then: seeing
 * it before that day's market has cleared would hint at relative risk
 * levels a team could otherwise only get by doing its own pricing analysis
 * (see the outsource route's doc comment).
 */
export async function hasPublishedResults(teamId: string, day: number): Promise<boolean> {
  const result = await prisma.teamSimResult.findFirst({
    where: { teamId, published: true, simulationRun: { day } },
    select: { id: true },
  });
  return !!result;
}
