-- Replaces per-skill subjective grading (RubricConfig.skills, Score,
-- MemberScore) with a fixed per-participant, per-day evaluation: a 1-5
-- overall grade, an independent pass/fail check, a categorical profile,
-- and a free-text comment + comment author. Applies only to Días 2-4 (Día 1
-- has no subjective grade) — enforced at the app layer, not in the schema.
DROP TABLE IF EXISTS "MemberScore";
DROP TABLE IF EXISTS "Score";
DROP TABLE IF EXISTS "Skill";

ALTER TABLE "RubricConfig" DROP COLUMN IF EXISTS "maxScale";

CREATE TYPE "EvaluationProfile" AS ENUM ('ACTUARIAL', 'FINANCIERO', 'GENERALISTA');

CREATE TABLE "MemberDayEvaluation" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "notaGeneral" DOUBLE PRECISION,
    "aprobado" BOOLEAN,
    "perfil" "EvaluationProfile",
    "comentario" TEXT,
    "comentarioAutor" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MemberDayEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberDayEvaluation_teamMemberId_day_key" ON "MemberDayEvaluation"("teamMemberId", "day");

ALTER TABLE "MemberDayEvaluation" ADD CONSTRAINT "MemberDayEvaluation_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
