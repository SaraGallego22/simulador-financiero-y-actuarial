-- AlterTable: AnalyticsRecommendation moves from one row per single-dimension
-- segment (segmentKey/recommendation) to one row per ranked pick within a
-- team's "crecer"/"disminuir" list, where a "sector" is a cross of two
-- dimensions (dimA=valA x dimB=valB) — see domain/grading/sectors.ts.
DROP TABLE IF EXISTS "AnalyticsRecommendation";

CREATE TABLE "AnalyticsRecommendation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "list" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "dimA" TEXT NOT NULL,
    "valA" TEXT NOT NULL,
    "dimB" TEXT NOT NULL,
    "valB" TEXT NOT NULL,

    CONSTRAINT "AnalyticsRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AnalyticsRecommendation_teamId_day_list_rank_key" ON "AnalyticsRecommendation"("teamId", "day", "list", "rank");

ALTER TABLE "AnalyticsRecommendation" ADD CONSTRAINT "AnalyticsRecommendation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
