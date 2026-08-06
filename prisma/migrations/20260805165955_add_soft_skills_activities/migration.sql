-- CreateEnum
CREATE TYPE "SoftSkillCompetency" AS ENUM ('TRABAJO_EQUIPO', 'TRABAJO_PRESION', 'ORIENTACION_LOGRO', 'TOLERANCIA_FRUSTRACION', 'COMUNICACION', 'CREATIVIDAD', 'LIDERAZGO', 'PROACTIVIDAD');

-- CreateEnum
CREATE TYPE "SoftSkillRating" AS ENUM ('EXCELENTE', 'BUENO', 'REGULAR', 'NO_EVIDENCIA');

-- CreateTable
CREATE TABLE "SoftSkillEvaluation" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "activity" INTEGER NOT NULL,
    "competency" "SoftSkillCompetency" NOT NULL,
    "rating" "SoftSkillRating" NOT NULL,

    CONSTRAINT "SoftSkillEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoftSkillComment" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "activity" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoftSkillComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamActivityNote" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "activity" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamActivityNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SoftSkillEvaluation_teamMemberId_activity_competency_key" ON "SoftSkillEvaluation"("teamMemberId", "activity", "competency");

-- CreateIndex
CREATE INDEX "SoftSkillComment_teamMemberId_activity_idx" ON "SoftSkillComment"("teamMemberId", "activity");

-- CreateIndex
CREATE UNIQUE INDEX "TeamActivityNote_teamId_activity_key" ON "TeamActivityNote"("teamId", "activity");

-- AddForeignKey
ALTER TABLE "SoftSkillEvaluation" ADD CONSTRAINT "SoftSkillEvaluation_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoftSkillComment" ADD CONSTRAINT "SoftSkillComment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamActivityNote" ADD CONSTRAINT "TeamActivityNote_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
