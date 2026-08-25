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
/**
 * Median of the positive-priced entries in a per-policy premium array — same
 * "> 0 counts as covered" inclusion rule the mean premium calc already uses
 * (see tariffs/route.ts's coverage check and MIN_COVERAGE's doc comment in
 * tariffUpload.ts), so the two numbers describe the same underlying set of
 * rows: a premium of exactly 0 — whether the row was never in the team's
 * CSV, or was there with an explicit 0 — is excluded here for the same
 * reason it's excluded from the market entirely (see runSimulation.ts's
 * isPriced()). Copies into a plain array to sort (Float32Array has no
 * comparator-based sort that runs in-place safely alongside the caller's own
 * reference), O(n log n) on up to 1,000,000 entries — a few hundred ms,
 * negligible next to the multi-second work already happening wherever this
 * is called (last-chunk tariff upload, outsourced tariff generation, or the
 * market simulation's own compute pass).
 */
export function medianOfPositive(premiums: Float32Array): number {
  const positive: number[] = [];
  for (let i = 0; i < premiums.length; i++) {
    if (premiums[i] > 0) positive.push(premiums[i]);
  }
  if (positive.length === 0) return 0;
  positive.sort((a, b) => a - b);
  const mid = Math.floor(positive.length / 2);
  return positive.length % 2 === 0 ? (positive[mid - 1] + positive[mid]) / 2 : positive[mid];
}

/**
 * Median premium actually charged on each team's own won book — restricted
 * to the policies `assignment` gave that team (rejected policies, -1, count
 * for no one). Computed from the same tariff arrays/assignment already in
 * memory right after a market-clearing run (see /api/simulation/route.ts),
 * never a separate read: the ~4MB-per-team bytea cost this would otherwise
 * re-incur on every admin page load is exactly what CLAUDE.md §4.1 point 5
 * warns about (see medianOfPositive's own doc comment for the sibling case).
 * The `tariff[k] > 0 ? ... : fallback` branch below is defensive rather than
 * load-bearing: by construction `assignment` can no longer hand a team an
 * exposure it priced at 0 or never priced at all (see runSimulation.ts's
 * isPriced()), so every policy reaching this loop should already have a
 * positive `tariff[k]`.
 */
export function computeMedianWonPremiumByNumericId(
  n: number,
  assignment: Int32Array,
  tariffsByNumericId: Map<number, Float32Array>,
  fallbackPremiumByNumericId: Map<number, number>
): Map<number, number> {
  const bucketsByNumericId = new Map<number, number[]>();
  for (const numericId of tariffsByNumericId.keys()) bucketsByNumericId.set(numericId, []);
  for (let k = 0; k < n; k++) {
    const numericId = assignment[k];
    if (numericId === -1) continue;
    const tariff = tariffsByNumericId.get(numericId);
    if (!tariff) continue;
    const price = tariff[k] > 0 ? tariff[k] : (fallbackPremiumByNumericId.get(numericId) ?? 0);
    bucketsByNumericId.get(numericId)!.push(price);
  }
  const result = new Map<number, number>();
  for (const [numericId, bucket] of bucketsByNumericId) {
    if (bucket.length === 0) continue;
    bucket.sort((a, b) => a - b);
    const mid = Math.floor(bucket.length / 2);
    result.set(numericId, bucket.length % 2 === 0 ? (bucket[mid - 1] + bucket[mid]) / 2 : bucket[mid]);
  }
  return result;
}

export function getTariffArray(
  submission: { data: Uint8Array | null; outsourced: boolean },
  universe: ColombiaUniverse
): Float32Array {
  if (submission.outsourced) return generateOutsourcedTariff(universe);
  if (!submission.data) throw new Error("La tarifa no tiene datos y no está marcada como tercerizada.");
  return toFloat32View(submission.data, N_COLOMBIA);
}

/**
 * Whether a team's objective results for `day` exist yet — the same signal
 * the team's own results tab already gates on. Used to withhold an
 * *outsourced* tariff's actual premium/CSV until then: seeing it before that
 * day's market has cleared would hint at relative risk levels a team could
 * otherwise only get by doing its own pricing analysis (see the outsource
 * route's doc comment).
 */
export async function hasDaySimResult(teamId: string, day: number): Promise<boolean> {
  const result = await prisma.teamSimResult.findFirst({
    where: { teamId, simulationRun: { day, status: "DONE" } },
    select: { id: true },
  });
  return !!result;
}
