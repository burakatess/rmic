-- CreateEnum
CREATE TYPE "SourceIndexStatus" AS ENUM ('NONE', 'QUEUED', 'RUNNING', 'READY', 'ERROR', 'STALE');

-- AlterTable
ALTER TABLE "AiEvalMessage" ADD COLUMN     "citedSourceRefs" JSONB,
ADD COLUMN     "runInputSnapshot" JSONB,
ADD COLUMN     "sentSourceUnitIds" TEXT[];

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "isTestFixture" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rightsBasis" TEXT,
ADD COLUMN     "rightsVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "rightsVerifiedById" TEXT;

-- AlterTable
ALTER TABLE "SourceVersion" ADD COLUMN     "contentChangedAt" TIMESTAMP(3),
ADD COLUMN     "contentReviewedAt" TIMESTAMP(3),
ADD COLUMN     "contentReviewedById" TEXT,
ADD COLUMN     "indexAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "indexChunkCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "indexError" TEXT,
ADD COLUMN     "indexStatus" "SourceIndexStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "indexedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SourceIndexJob" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "status" "SourceIndexStatus" NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "chunkCount" INTEGER,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "SourceIndexJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceIndexJob_versionId_idx" ON "SourceIndexJob"("versionId");

-- CreateIndex
CREATE INDEX "SourceIndexJob_status_idx" ON "SourceIndexJob"("status");

-- CreateIndex
CREATE INDEX "Source_isTestFixture_idx" ON "Source"("isTestFixture");

-- AddForeignKey
ALTER TABLE "SourceIndexJob" ADD CONSTRAINT "SourceIndexJob_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "SourceVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

