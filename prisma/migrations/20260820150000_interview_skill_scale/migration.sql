-- Switch InterviewSkillRating.rating from the qualitative SoftSkillRating
-- enum to a 1-5 integer scale (INTERVIEW_SKILL_SCALE in src/lib/interview.ts).
-- No lossless mapping exists from EXCELENTE/BUENO/REGULAR/NO_EVIDENCIA to
-- 1-5, so existing interview ratings are cleared; evaluators re-rate under
-- the new scale.
DELETE FROM "InterviewSkillRating";

ALTER TABLE "InterviewSkillRating" DROP COLUMN "rating";
ALTER TABLE "InterviewSkillRating" ADD COLUMN "rating" INTEGER NOT NULL;
