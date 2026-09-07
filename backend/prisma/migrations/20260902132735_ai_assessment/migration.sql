-- CreateEnum
CREATE TYPE "AiAssessmentKind" AS ENUM ('PREP_PLAN', 'EVIDENCE_READ', 'ASSESSMENT', 'RESULT_DRAFT', 'FINDING_DRAFT');

-- CreateEnum
CREATE TYPE "AiAssessmentStatus" AS ENUM ('PROCESSING', 'SUGGESTED', 'ACCEPTED', 'EDITED', 'REJECTED', 'FAILED');

-- CreateTable
CREATE TABLE "AiAssessment" (
    "id" TEXT NOT NULL,
    "kind" "AiAssessmentKind" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" "AiAssessmentStatus" NOT NULL DEFAULT 'PROCESSING',
    "tier" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "latencyMs" INTEGER,
    "errorText" TEXT,
    "output" JSONB,
    "confidence" DOUBLE PRECISION,
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "editedOutput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiAssessment_entityType_entityId_idx" ON "AiAssessment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AiAssessment_kind_idx" ON "AiAssessment"("kind");

-- CreateIndex
CREATE INDEX "AiAssessment_status_idx" ON "AiAssessment"("status");

-- CreateIndex
CREATE INDEX "AiAssessment_inputHash_idx" ON "AiAssessment"("inputHash");

-- CreateIndex
CREATE INDEX "AiAssessment_createdById_idx" ON "AiAssessment"("createdById");

