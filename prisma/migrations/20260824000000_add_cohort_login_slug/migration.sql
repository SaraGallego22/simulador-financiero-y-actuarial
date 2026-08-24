-- AlterTable
ALTER TABLE "Cohort" ADD COLUMN "loginSlug" TEXT;

-- Backfill existing cohorts with their login word before enforcing NOT NULL.
UPDATE "Cohort" SET "loginSlug" = 'demo' WHERE "name" = 'Cohorte demo';

-- AlterTable
ALTER TABLE "Cohort" ALTER COLUMN "loginSlug" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Cohort_loginSlug_key" ON "Cohort"("loginSlug");
