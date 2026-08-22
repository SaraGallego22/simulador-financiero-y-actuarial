-- CreateTable
CREATE TABLE "TeamClaimAggregate" (
    "id" TEXT NOT NULL,
    "simulationRunId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "noticeMonth" INTEGER NOT NULL,
    "severitySum" DOUBLE PRECISION NOT NULL,
    "claimCount" INTEGER NOT NULL,

    CONSTRAINT "TeamClaimAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamClaimAggregate_simulationRunId_kind_idx" ON "TeamClaimAggregate"("simulationRunId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "TeamClaimAggregate_simulationRunId_teamId_kind_noticeMonth_key" ON "TeamClaimAggregate"("simulationRunId", "teamId", "kind", "noticeMonth");

-- AddForeignKey
ALTER TABLE "TeamClaimAggregate" ADD CONSTRAINT "TeamClaimAggregate_simulationRunId_fkey" FOREIGN KEY ("simulationRunId") REFERENCES "SimulationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamClaimAggregate" ADD CONSTRAINT "TeamClaimAggregate_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
