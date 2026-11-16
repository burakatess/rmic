-- CreateEnum
CREATE TYPE "RiskSimulationTestStatus" AS ENUM ('ACTIVE', 'FINISHED');

-- CreateTable
CREATE TABLE "RiskSimulationTest" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "RiskSimulationTestStatus" NOT NULL DEFAULT 'ACTIVE',
    "activeFor" TEXT,
    "baseline" JSONB NOT NULL,
    "finalState" JSONB,
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedById" TEXT,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RiskSimulationTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiskSimulationTest_activeFor_key" ON "RiskSimulationTest"("activeFor");

-- CreateIndex
CREATE INDEX "RiskSimulationTest_simulationId_idx" ON "RiskSimulationTest"("simulationId");

-- CreateIndex
CREATE INDEX "RiskSimulationTest_startedById_idx" ON "RiskSimulationTest"("startedById");

-- AddForeignKey
ALTER TABLE "RiskSimulationTest" ADD CONSTRAINT "RiskSimulationTest_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "RiskSimulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSimulationTest" ADD CONSTRAINT "RiskSimulationTest_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSimulationTest" ADD CONSTRAINT "RiskSimulationTest_finishedById_fkey" FOREIGN KEY ("finishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

