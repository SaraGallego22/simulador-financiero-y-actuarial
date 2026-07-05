-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TEAM');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cohort" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UniverseRun" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "data" BYTEA,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UniverseRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationRun" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "params" JSONB NOT NULL,
    "resultData" BYTEA,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamSimResult" (
    "id" TEXT NOT NULL,
    "simulationRunId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "insuredCount" INTEGER NOT NULL,
    "totalPremium" DOUBLE PRECISION NOT NULL,
    "claimsCount" INTEGER NOT NULL,
    "claimsAmount" DOUBLE PRECISION NOT NULL,
    "rejectedCount" INTEGER NOT NULL,
    "extra" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TeamSimResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffSubmission" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "meanPremium" DOUBLE PRECISION,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TariffSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioAllocation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "allocation" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "conceptId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsRecommendation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "segmentKey" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,

    CONSTRAINT "AnalyticsRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RubricConfig" (
    "id" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "subjectiveWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.30,
    "actuarialWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.50,
    "maxScale" INTEGER NOT NULL DEFAULT 5,
    "objectiveMode" TEXT NOT NULL DEFAULT 'relative',
    "tolerancePerfect" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "toleranceZero" DOUBLE PRECISION NOT NULL DEFAULT 0.40,

    CONSTRAINT "RubricConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "rubricConfigId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "value" DOUBLE PRECISION,
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberScore" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "value" DOUBLE PRECISION,
    "published" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MemberScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_teamId_key" ON "User"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Cohort_name_key" ON "Cohort"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Team_cohortId_name_key" ON "Team"("cohortId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TeamSimResult_simulationRunId_teamId_key" ON "TeamSimResult"("simulationRunId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TariffSubmission_teamId_day_key" ON "TariffSubmission"("teamId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioAllocation_teamId_day_key" ON "PortfolioAllocation"("teamId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Deliverable_teamId_day_conceptId_key" ON "Deliverable"("teamId", "day", "conceptId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsRecommendation_teamId_day_segmentKey_key" ON "AnalyticsRecommendation"("teamId", "day", "segmentKey");

-- CreateIndex
CREATE UNIQUE INDEX "RubricConfig_cohortId_key" ON "RubricConfig"("cohortId");

-- CreateIndex
CREATE UNIQUE INDEX "Score_teamId_skillId_day_key" ON "Score"("teamId", "skillId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "MemberScore_teamMemberId_skillId_day_key" ON "MemberScore"("teamMemberId", "skillId", "day");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniverseRun" ADD CONSTRAINT "UniverseRun_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationRun" ADD CONSTRAINT "SimulationRun_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSimResult" ADD CONSTRAINT "TeamSimResult_simulationRunId_fkey" FOREIGN KEY ("simulationRunId") REFERENCES "SimulationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSimResult" ADD CONSTRAINT "TeamSimResult_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffSubmission" ADD CONSTRAINT "TariffSubmission_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioAllocation" ADD CONSTRAINT "PortfolioAllocation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsRecommendation" ADD CONSTRAINT "AnalyticsRecommendation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubricConfig" ADD CONSTRAINT "RubricConfig_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_rubricConfigId_fkey" FOREIGN KEY ("rubricConfigId") REFERENCES "RubricConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberScore" ADD CONSTRAINT "MemberScore_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberScore" ADD CONSTRAINT "MemberScore_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
