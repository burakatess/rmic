-- AI Kontrol & Kanıt Değerlendirme çalışma alanı: yaşam döngüsü, işlem durumu,
-- sonuç, sürümleme, çoğaltma, kanıt meta/okuma durumu/sürüm zinciri.

-- CreateEnum
CREATE TYPE "AiEvalReadStatus" AS ENUM ('PENDING', 'READING', 'READ', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "AiEvalRunStatus" AS ENUM ('DRAFT', 'RUNNING', 'AWAITING_REVIEW', 'COMPLETED', 'ERROR');

-- CreateEnum
CREATE TYPE "AiEvalOutcome" AS ENUM ('MET', 'PARTIALLY_MET', 'NOT_MET', 'INCONCLUSIVE');

-- AlterEnum
ALTER TYPE "AiEvalStatus" ADD VALUE 'TRASHED';

-- AlterTable: AiEvalAttachment
ALTER TABLE "AiEvalAttachment"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "docDate" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "readNote" TEXT,
  ADD COLUMN "readStatus" "AiEvalReadStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "relatedSample" TEXT,
  ADD COLUMN "relatedSystem" TEXT,
  ADD COLUMN "relatedTestStep" TEXT,
  ADD COLUMN "supersededById" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- updatedAt yalnızca mevcut satırları geriye dönük doldurmak için DEFAULT aldı;
-- Prisma @updatedAt uygulama tarafında yönetildiği için DB default'u kaldırılır
-- (şema ile birebir uyum: migrate diff drift üretmesin).
ALTER TABLE "AiEvalAttachment" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Mevcut kayıtların extractedText'i varsa okuma durumunu READ yap (geriye dönük tutarlılık).
UPDATE "AiEvalAttachment" SET "readStatus" = 'READ' WHERE "extractedText" IS NOT NULL AND "extractedText" <> '';

-- AlterTable: AiEvalMessage
ALTER TABLE "AiEvalMessage"
  ADD COLUMN "cancelled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "editedEvaluation" JSONB,
  ADD COLUMN "evidenceRefs" JSONB,
  ADD COLUMN "inputVersion" INTEGER,
  ADD COLUMN "promptVersion" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "stale" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: AiEvalSession
ALTER TABLE "AiEvalSession"
  ADD COLUMN "clonedFromId" TEXT,
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "completedById" TEXT,
  ADD COLUMN "contentVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "inputsDirty" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "outcome" "AiEvalOutcome",
  ADD COLUMN "period" TEXT,
  ADD COLUMN "runStatus" "AiEvalRunStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "runStartedAt" TIMESTAMP(3),
  ADD COLUMN "runProgress" JSONB,
  ADD COLUMN "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "titleEditedByUser" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "trashedAt" TIMESTAMP(3);

-- Mevcut oturumlarda asistan mesajı varsa işlem durumunu AWAITING_REVIEW yap.
UPDATE "AiEvalSession" s SET "runStatus" = 'AWAITING_REVIEW'
WHERE EXISTS (
  SELECT 1 FROM "AiEvalMessage" m
  WHERE m."sessionId" = s.id AND m.role = 'ASSISTANT' AND m."evaluation" IS NOT NULL AND m."errorText" IS NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AiEvalAttachment_supersededById_key" ON "AiEvalAttachment"("supersededById");
CREATE INDEX "AiEvalAttachment_sessionId_active_idx" ON "AiEvalAttachment"("sessionId", "active");
CREATE INDEX "AiEvalMessage_sessionId_createdAt_idx" ON "AiEvalMessage"("sessionId", "createdAt");
CREATE INDEX "AiEvalSession_runStatus_idx" ON "AiEvalSession"("runStatus");
CREATE INDEX "AiEvalSession_createdById_status_updatedAt_idx" ON "AiEvalSession"("createdById", "status", "updatedAt");

-- AddForeignKey
ALTER TABLE "AiEvalSession" ADD CONSTRAINT "AiEvalSession_clonedFromId_fkey" FOREIGN KEY ("clonedFromId") REFERENCES "AiEvalSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiEvalAttachment" ADD CONSTRAINT "AiEvalAttachment_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "AiEvalAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
