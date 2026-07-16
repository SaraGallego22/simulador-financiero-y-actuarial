-- A team's own guess at a named sector's true multiplier, alongside the
-- dimension/value pair already stored per (team, day, list, rank). Optional
-- (nullable) — a row can still be created with just the sector named and no
-- estimate, same as before this migration; it simply scores 0 for the
-- multiplier half of that slot (see scoreSectorPicks() in
-- src/domain/grading/sectors.ts).
ALTER TABLE "AnalyticsRecommendation" ADD COLUMN "estimatedMultiplier" DOUBLE PRECISION;
