-- Both Día 1 and Día 2 now score the tariff with notaTarifacionAbsoluta
-- (model-anchored), so the cohort-relative scorer this setting configured —
-- "relative" (percentil 10-90) vs "ranking" — no longer exists.
-- See src/domain/grading/composite.ts.

-- AlterTable
ALTER TABLE "RubricConfig" DROP COLUMN "objectiveMode";
