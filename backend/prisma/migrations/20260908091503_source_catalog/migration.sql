-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('REGULATION', 'STANDARD_FRAMEWORK', 'AUDIT_METHODOLOGY', 'CORPORATE_POLICY', 'PRODUCT_DOC', 'CONTROL_TEST_CARD', 'EVIDENCE_GUIDE', 'PRECEDENT_FINDING', 'TRAINING_EXAMPLE', 'EVAL_SCENARIO');

-- CreateEnum
CREATE TYPE "SourceConfidentiality" AS ENUM ('PUBLIC', 'INTERNAL', 'RESTRICTED', 'CONFIDENTIAL');

-- CreateEnum
CREATE TYPE "SourceApprovalStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "UsagePermission" AS ENUM ('UNKNOWN', 'ALLOWED', 'DENIED');

-- CreateEnum
CREATE TYPE "MappingMatchType" AS ENUM ('FULL', 'PARTIAL', 'SUPPORTS', 'RELATED');

-- CreateEnum
CREATE TYPE "MappingStatus" AS ENUM ('PENDING', 'AI_DRAFT', 'USER_CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MappingTargetType" AS ENUM ('CONTROL', 'CONTROL_TEST_CARD', 'PROCESS_SCOPE_CARD', 'RISK');

-- CreateEnum
CREATE TYPE "TestCardOrigin" AS ENUM ('AI_DRAFT', 'INTERNAL_METHODOLOGY', 'IMPORTED');

-- CreateEnum
CREATE TYPE "TestCardStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EvalDatasetPurpose" AS ENUM ('RAG_SOURCE', 'TRAINING_EXAMPLE', 'EVAL_HOLDOUT');

-- CreateEnum
CREATE TYPE "ScenarioKind" AS ENUM ('SUFFICIENT_EVIDENCE', 'CONTROL_GAP', 'INSUFFICIENT_EVIDENCE', 'CONFLICTING_EVIDENCE', 'WRONG_PERIOD_SCOPE');

-- CreateEnum
CREATE TYPE "ScenarioStatus" AS ENUM ('SYNTHETIC_PENDING_REVIEW', 'EXPERT_APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QualityRunStatus" AS ENUM ('RUNNING', 'DONE', 'ERROR');

-- AlterTable
ALTER TABLE "AiEvalSession" ADD COLUMN     "sourceSnapshot" JSONB,
ADD COLUMN     "sourceUnitIds" TEXT[],
ADD COLUMN     "suggestedSourceUnitIds" TEXT[],
ADD COLUMN     "usedSourceUnitIds" TEXT[];

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "kind" "SourceKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publisher" TEXT,
    "officialUrl" TEXT,
    "docCode" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "owner" TEXT,
    "confidentiality" "SourceConfidentiality" NOT NULL DEFAULT 'PUBLIC',
    "tags" TEXT[],
    "rightRefLink" "UsagePermission" NOT NULL DEFAULT 'UNKNOWN',
    "rightFullText" "UsagePermission" NOT NULL DEFAULT 'UNKNOWN',
    "rightRag" "UsagePermission" NOT NULL DEFAULT 'UNKNOWN',
    "rightFineTune" "UsagePermission" NOT NULL DEFAULT 'UNKNOWN',
    "rightExport" "UsagePermission" NOT NULL DEFAULT 'UNKNOWN',
    "rightsNote" TEXT,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceVersion" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "publishDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "accessedAt" TIMESTAMP(3),
    "contentHash" TEXT,
    "contentRetrieved" BOOLEAN NOT NULL DEFAULT false,
    "fullText" TEXT,
    "storageNote" TEXT,
    "approvalStatus" "SourceApprovalStatus" NOT NULL DEFAULT 'DRAFT',
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceUnit" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "stableKey" TEXT NOT NULL,
    "unitCode" TEXT NOT NULL,
    "unitType" TEXT NOT NULL DEFAULT 'clause',
    "title" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "translationTr" TEXT,
    "commentaryTr" TEXT,
    "locator" JSONB,
    "scope" TEXT,
    "riskAreas" TEXT[],
    "parentKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceMapping" (
    "id" TEXT NOT NULL,
    "targetType" "MappingTargetType" NOT NULL,
    "controlId" TEXT,
    "testCardId" TEXT,
    "processCardId" TEXT,
    "versionId" TEXT NOT NULL,
    "unitId" TEXT,
    "matchType" "MappingMatchType" NOT NULL,
    "status" "MappingStatus" NOT NULL DEFAULT 'PENDING',
    "rationale" TEXT,
    "bindingType" TEXT,
    "applicabilityRationale" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlTestCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "topicNo" INTEGER,
    "title" TEXT NOT NULL,
    "origin" "TestCardOrigin" NOT NULL DEFAULT 'AI_DRAFT',
    "status" "TestCardStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "purposeRisk" TEXT NOT NULL,
    "scopePrereq" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "expectedState" TEXT NOT NULL,
    "requestedEvidence" JSONB NOT NULL,
    "evidenceSufficiency" TEXT NOT NULL,
    "decisionCriteria" JSONB NOT NULL,
    "misleadingSignals" TEXT NOT NULL,
    "sampleControlResult" TEXT NOT NULL,
    "sampleEvidenceRequest" TEXT NOT NULL,
    "relatedControlId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlTestCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessScopeCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "status" "TestCardStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT NOT NULL,
    "criticalAssets" JSONB NOT NULL,
    "paramSpec" JSONB NOT NULL,
    "linkedControlIds" TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessScopeCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceSufficiencyRule" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "goodExample" TEXT,
    "badExample" TEXT,
    "scoringSpec" JSONB,
    "status" "TestCardStatus" NOT NULL DEFAULT 'DRAFT',
    "orderNo" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceSufficiencyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceChunk" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "unitId" TEXT,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "embedModel" TEXT,
    "tokenCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalDataset" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" "EvalDatasetPurpose" NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvalDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalScenario" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "familyKey" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "testCardId" TEXT,
    "kind" "ScenarioKind" NOT NULL,
    "status" "ScenarioStatus" NOT NULL DEFAULT 'SYNTHETIC_PENDING_REVIEW',
    "synthetic" BOOLEAN NOT NULL DEFAULT true,
    "inputEvidence" JSONB NOT NULL,
    "expectedDecision" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "requiredRefs" JSONB NOT NULL,
    "forbiddenInferences" JSONB NOT NULL,
    "missingEvidence" JSONB NOT NULL,
    "labeledById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvalScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalScenarioRef" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "EvalScenarioRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalScenarioSource" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,

    CONSTRAINT "EvalScenarioSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityRun" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "modelName" TEXT,
    "promptVersion" TEXT,
    "retrievalVersion" TEXT,
    "status" "QualityRunStatus" NOT NULL DEFAULT 'RUNNING',
    "metrics" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,

    CONSTRAINT "QualityRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityRunItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "predictedDecision" TEXT,
    "expectedDecision" TEXT,
    "correct" BOOLEAN,
    "usedRefs" JSONB,
    "issues" JSONB,
    "latencyMs" INTEGER,
    "rawOutput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityRunItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_slug_key" ON "Source"("slug");

-- CreateIndex
CREATE INDEX "Source_kind_idx" ON "Source"("kind");

-- CreateIndex
CREATE INDEX "Source_confidentiality_idx" ON "Source"("confidentiality");

-- CreateIndex
CREATE UNIQUE INDEX "SourceVersion_supersededById_key" ON "SourceVersion"("supersededById");

-- CreateIndex
CREATE INDEX "SourceVersion_sourceId_idx" ON "SourceVersion"("sourceId");

-- CreateIndex
CREATE INDEX "SourceVersion_approvalStatus_idx" ON "SourceVersion"("approvalStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SourceVersion_sourceId_versionLabel_key" ON "SourceVersion"("sourceId", "versionLabel");

-- CreateIndex
CREATE INDEX "SourceUnit_versionId_idx" ON "SourceUnit"("versionId");

-- CreateIndex
CREATE INDEX "SourceUnit_stableKey_idx" ON "SourceUnit"("stableKey");

-- CreateIndex
CREATE UNIQUE INDEX "SourceUnit_versionId_stableKey_key" ON "SourceUnit"("versionId", "stableKey");

-- CreateIndex
CREATE INDEX "SourceMapping_controlId_idx" ON "SourceMapping"("controlId");

-- CreateIndex
CREATE INDEX "SourceMapping_testCardId_idx" ON "SourceMapping"("testCardId");

-- CreateIndex
CREATE INDEX "SourceMapping_processCardId_idx" ON "SourceMapping"("processCardId");

-- CreateIndex
CREATE INDEX "SourceMapping_versionId_idx" ON "SourceMapping"("versionId");

-- CreateIndex
CREATE INDEX "SourceMapping_status_idx" ON "SourceMapping"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ControlTestCard_code_key" ON "ControlTestCard"("code");

-- CreateIndex
CREATE INDEX "ControlTestCard_status_idx" ON "ControlTestCard"("status");

-- CreateIndex
CREATE INDEX "ControlTestCard_topicNo_idx" ON "ControlTestCard"("topicNo");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessScopeCard_code_key" ON "ProcessScopeCard"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceSufficiencyRule_code_key" ON "EvidenceSufficiencyRule"("code");

-- CreateIndex
CREATE INDEX "SourceChunk_versionId_idx" ON "SourceChunk"("versionId");

-- CreateIndex
CREATE INDEX "SourceChunk_unitId_idx" ON "SourceChunk"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "EvalDataset_code_key" ON "EvalDataset"("code");

-- CreateIndex
CREATE UNIQUE INDEX "EvalScenario_scenarioId_key" ON "EvalScenario"("scenarioId");

-- CreateIndex
CREATE INDEX "EvalScenario_datasetId_idx" ON "EvalScenario"("datasetId");

-- CreateIndex
CREATE INDEX "EvalScenario_familyKey_idx" ON "EvalScenario"("familyKey");

-- CreateIndex
CREATE INDEX "EvalScenario_status_idx" ON "EvalScenario"("status");

-- CreateIndex
CREATE INDEX "EvalScenario_testCardId_idx" ON "EvalScenario"("testCardId");

-- CreateIndex
CREATE INDEX "EvalScenarioRef_unitId_idx" ON "EvalScenarioRef"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "EvalScenarioRef_scenarioId_unitId_key" ON "EvalScenarioRef"("scenarioId", "unitId");

-- CreateIndex
CREATE INDEX "EvalScenarioSource_versionId_idx" ON "EvalScenarioSource"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "EvalScenarioSource_scenarioId_versionId_key" ON "EvalScenarioSource"("scenarioId", "versionId");

-- CreateIndex
CREATE INDEX "QualityRun_datasetId_idx" ON "QualityRun"("datasetId");

-- CreateIndex
CREATE INDEX "QualityRun_status_idx" ON "QualityRun"("status");

-- CreateIndex
CREATE INDEX "QualityRunItem_runId_idx" ON "QualityRunItem"("runId");

-- AddForeignKey
ALTER TABLE "SourceVersion" ADD CONSTRAINT "SourceVersion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceVersion" ADD CONSTRAINT "SourceVersion_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "SourceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceUnit" ADD CONSTRAINT "SourceUnit_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMapping" ADD CONSTRAINT "SourceMapping_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMapping" ADD CONSTRAINT "SourceMapping_testCardId_fkey" FOREIGN KEY ("testCardId") REFERENCES "ControlTestCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMapping" ADD CONSTRAINT "SourceMapping_processCardId_fkey" FOREIGN KEY ("processCardId") REFERENCES "ProcessScopeCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMapping" ADD CONSTRAINT "SourceMapping_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceMapping" ADD CONSTRAINT "SourceMapping_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SourceUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestCard" ADD CONSTRAINT "ControlTestCard_relatedControlId_fkey" FOREIGN KEY ("relatedControlId") REFERENCES "Control"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceChunk" ADD CONSTRAINT "SourceChunk_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceChunk" ADD CONSTRAINT "SourceChunk_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SourceUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalScenario" ADD CONSTRAINT "EvalScenario_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "EvalDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalScenario" ADD CONSTRAINT "EvalScenario_testCardId_fkey" FOREIGN KEY ("testCardId") REFERENCES "ControlTestCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalScenarioRef" ADD CONSTRAINT "EvalScenarioRef_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "EvalScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalScenarioRef" ADD CONSTRAINT "EvalScenarioRef_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SourceUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalScenarioSource" ADD CONSTRAINT "EvalScenarioSource_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "EvalScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalScenarioSource" ADD CONSTRAINT "EvalScenarioSource_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityRunItem" ADD CONSTRAINT "QualityRunItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "QualityRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

