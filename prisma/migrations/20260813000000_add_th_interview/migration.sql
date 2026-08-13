-- CreateEnum
CREATE TYPE "InterviewSkill" AS ENUM ('EXCEL', 'PROGRAMACION');

-- CreateTable
CREATE TABLE "InterviewSkillRating" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "skill" "InterviewSkill" NOT NULL,
    "rating" "SoftSkillRating" NOT NULL,

    CONSTRAINT "InterviewSkillRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewComment" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewSkillRating_teamMemberId_skill_key" ON "InterviewSkillRating"("teamMemberId", "skill");

-- CreateIndex
CREATE INDEX "InterviewComment_teamMemberId_idx" ON "InterviewComment"("teamMemberId");

-- AddForeignKey
ALTER TABLE "InterviewSkillRating" ADD CONSTRAINT "InterviewSkillRating_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewComment" ADD CONSTRAINT "InterviewComment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
