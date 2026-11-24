-- CreateEnum
CREATE TYPE "SimTransferRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "SimulationMethodology" ADD COLUMN     "basedOnVersion" INTEGER,
ADD COLUMN     "isTrial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "trialSimulationId" TEXT,
ALTER COLUMN "version" DROP NOT NULL;

-- CreateTable
CREATE TABLE "RiskSimulationTransferRequest" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "simulationId" TEXT,
    "simulationLabel" TEXT NOT NULL,
    "status" "SimTransferRequestStatus" NOT NULL DEFAULT 'PENDING',
    "scenarioIds" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "note" TEXT,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "result" JSONB,

    CONSTRAINT "RiskSimulationTransferRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RiskSimulationTransferRequest_requestNo_key" ON "RiskSimulationTransferRequest"("requestNo");

-- CreateIndex
CREATE INDEX "RiskSimulationTransferRequest_status_idx" ON "RiskSimulationTransferRequest"("status");

-- CreateIndex
CREATE INDEX "RiskSimulationTransferRequest_simulationId_idx" ON "RiskSimulationTransferRequest"("simulationId");

-- CreateIndex
CREATE INDEX "RiskSimulationTransferRequest_requestedById_idx" ON "RiskSimulationTransferRequest"("requestedById");

-- CreateIndex
CREATE INDEX "SimulationMethodology_trialSimulationId_idx" ON "SimulationMethodology"("trialSimulationId");

-- AddForeignKey
ALTER TABLE "RiskSimulationTransferRequest" ADD CONSTRAINT "RiskSimulationTransferRequest_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "RiskSimulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSimulationTransferRequest" ADD CONSTRAINT "RiskSimulationTransferRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSimulationTransferRequest" ADD CONSTRAINT "RiskSimulationTransferRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

