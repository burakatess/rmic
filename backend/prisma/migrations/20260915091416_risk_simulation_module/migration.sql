-- CreateEnum
CREATE TYPE "RiskSimulationStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScenarioSourceType" AS ENUM ('EXISTING_RISK', 'HYPOTHETICAL');

-- CreateEnum
CREATE TYPE "SimFinalImpactChoice" AS ENUM ('BUSINESS', 'INFOSEC');

-- CreateEnum
CREATE TYPE "SimP1" AS ENUM ('MANUEL', 'BT_MANUEL', 'OTOMATIK');

-- CreateEnum
CREATE TYPE "SimP2" AS ENUM ('TESPIT_EDICI', 'DUZELTICI', 'ONLEYICI');

-- CreateEnum
CREATE TYPE "SimP3" AS ENUM ('IZ_KAYDI_YOK', 'KULLANICI_SIFRE_SES_EMAIL', 'SISTEM_LOG_ISLAK_IMZA', 'ELEKTRONIK_IMZA');

-- CreateEnum
CREATE TYPE "SimP4" AS ENUM ('YOK', 'AYNI_EKIP', 'FARKLI_EKIP', 'HER_IKISI');

-- CreateEnum
CREATE TYPE "SimP5" AS ENUM ('YOK', 'DUZENSIZ_UST_AMIR', 'DUZENLI_UST_AMIR', 'FARKLI_BIRIM_GOZETIM');

-- CreateEnum
CREATE TYPE "SimKtsMode" AS ENUM ('FROM_TEST', 'MANUAL');

-- CreateEnum
CREATE TYPE "SimImpactArea" AS ENUM ('PROBABILITY', 'IMPACT', 'BOTH');

-- CreateEnum
CREATE TYPE "SimActionEffectMode" AS ENUM ('P1P5_KTS', 'TARGET_KEP');

-- CreateTable
CREATE TABLE "SimulationMethodology" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "changeNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulationMethodology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSimulation" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "RiskSimulationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskSimulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSimulationScenario" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "methodologyVersionId" TEXT NOT NULL,
    "contentVersion" INTEGER NOT NULL DEFAULT 0,
    "sourceType" "ScenarioSourceType" NOT NULL,
    "sourceRiskId" TEXT,
    "sourceRiskSnapshot" JSONB,
    "sourceCapturedVersion" INTEGER,
    "sourceCapturedAt" TIMESTAMP(3),
    "naturalProbability" INTEGER NOT NULL,
    "finansalEtki" INTEGER,
    "itibarEtkisi" INTEGER,
    "regulasyonEtkisi" INTEGER,
    "musteriEtkisi" INTEGER,
    "gizlilikEtkisi" INTEGER,
    "butunlukEtkisi" INTEGER,
    "erisilebilirlikEtkisi" INTEGER,
    "finalImpactChoice" "SimFinalImpactChoice" NOT NULL,
    "residualOverrideProbability" INTEGER,
    "residualOverrideImpact" INTEGER,
    "residualOverrideReason" TEXT,
    "residualIsOverridden" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskSimulationScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSimulationControl" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "sourceControlId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "p1" "SimP1" NOT NULL,
    "p2" "SimP2" NOT NULL,
    "p3" "SimP3" NOT NULL,
    "p4" "SimP4" NOT NULL,
    "p5" "SimP5" NOT NULL,
    "ktsMode" "SimKtsMode" NOT NULL,
    "ktsManualValue" DOUBLE PRECISION,
    "ktsSourceTestId" TEXT,
    "weight" DOUBLE PRECISION NOT NULL,
    "impactArea" "SimImpactArea" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskSimulationControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSimulationAction" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "sourceActionId" TEXT,
    "targetControlSimId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "effectMode" "SimActionEffectMode" NOT NULL,
    "targetP1" "SimP1",
    "targetP2" "SimP2",
    "targetP3" "SimP3",
    "targetP4" "SimP4",
    "targetP5" "SimP5",
    "targetKts" DOUBLE PRECISION,
    "targetKep" DOUBLE PRECISION,
    "targetKepReason" TEXT,
    "isApplied" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskSimulationAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskSimulationTransfer" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "scenarioVersionAtTransfer" INTEGER NOT NULL,
    "performedById" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultSummary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskSimulationTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SimulationMethodology_version_key" ON "SimulationMethodology"("version");

-- CreateIndex
CREATE INDEX "SimulationMethodology_isActive_idx" ON "SimulationMethodology"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RiskSimulation_simulationId_key" ON "RiskSimulation"("simulationId");

-- CreateIndex
CREATE INDEX "RiskSimulation_status_idx" ON "RiskSimulation"("status");

-- CreateIndex
CREATE INDEX "RiskSimulation_createdById_idx" ON "RiskSimulation"("createdById");

-- CreateIndex
CREATE INDEX "RiskSimulationScenario_simulationId_idx" ON "RiskSimulationScenario"("simulationId");

-- CreateIndex
CREATE INDEX "RiskSimulationScenario_sourceRiskId_idx" ON "RiskSimulationScenario"("sourceRiskId");

-- CreateIndex
CREATE INDEX "RiskSimulationScenario_methodologyVersionId_idx" ON "RiskSimulationScenario"("methodologyVersionId");

-- CreateIndex
CREATE INDEX "RiskSimulationControl_scenarioId_idx" ON "RiskSimulationControl"("scenarioId");

-- CreateIndex
CREATE INDEX "RiskSimulationControl_sourceControlId_idx" ON "RiskSimulationControl"("sourceControlId");

-- CreateIndex
CREATE INDEX "RiskSimulationAction_scenarioId_idx" ON "RiskSimulationAction"("scenarioId");

-- CreateIndex
CREATE INDEX "RiskSimulationAction_targetControlSimId_idx" ON "RiskSimulationAction"("targetControlSimId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskSimulationTransfer_transferId_key" ON "RiskSimulationTransfer"("transferId");

-- CreateIndex
CREATE INDEX "RiskSimulationTransfer_scenarioId_idx" ON "RiskSimulationTransfer"("scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "RiskSimulationTransfer_scenarioId_scenarioVersionAtTransfer_key" ON "RiskSimulationTransfer"("scenarioId", "scenarioVersionAtTransfer");

-- AddForeignKey
ALTER TABLE "SimulationMethodology" ADD CONSTRAINT "SimulationMethodology_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSimulation" ADD CONSTRAINT "RiskSimulation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSimulationScenario" ADD CONSTRAINT "RiskSimulationScenario_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "RiskSimulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSimulationScenario" ADD CONSTRAINT "RiskSimulationScenario_methodologyVersionId_fkey" FOREIGN KEY ("methodologyVersionId") REFERENCES "SimulationMethodology"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSimulationScenario" ADD CONSTRAINT "RiskSimulationScenario_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSimulationControl" ADD CONSTRAINT "RiskSimulationControl_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "RiskSimulationScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSimulationAction" ADD CONSTRAINT "RiskSimulationAction_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "RiskSimulationScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSimulationAction" ADD CONSTRAINT "RiskSimulationAction_targetControlSimId_fkey" FOREIGN KEY ("targetControlSimId") REFERENCES "RiskSimulationControl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSimulationTransfer" ADD CONSTRAINT "RiskSimulationTransfer_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "RiskSimulationScenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskSimulationTransfer" ADD CONSTRAINT "RiskSimulationTransfer_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
