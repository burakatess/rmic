-- Risk simülasyonu çalışma alanı: simülasyon türü + Kontrol Alanı (RiskControl) kaynak referansı. Yalnız ekleme.

-- CreateEnum
CREATE TYPE "RiskSimulationMode" AS ENUM ('SCENARIO', 'WORKSPACE');

-- AlterTable
ALTER TABLE "RiskSimulation" ADD COLUMN     "mode" "RiskSimulationMode" NOT NULL DEFAULT 'SCENARIO';

-- AlterTable
ALTER TABLE "RiskSimulationControl" ADD COLUMN     "sourceRiskControlId" TEXT;

-- CreateIndex
CREATE INDEX "RiskSimulationControl_sourceRiskControlId_idx" ON "RiskSimulationControl"("sourceRiskControlId");

