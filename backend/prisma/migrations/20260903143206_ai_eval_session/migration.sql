-- CreateEnum
CREATE TYPE "AiEvalStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AiEvalRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AiEvalAttachmentKind" AS ENUM ('DOCUMENT', 'IMAGE', 'EMAIL', 'TEXT');

-- CreateTable
CREATE TABLE "AiEvalSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "controlRefId" TEXT,
    "controlText" TEXT,
    "controlSnapshot" JSONB,
    "regulationArticleIds" TEXT[],
    "regulationSnapshot" JSONB,
    "createdById" TEXT NOT NULL,
    "status" "AiEvalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEvalSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEvalMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "AiEvalRole" NOT NULL,
    "content" TEXT NOT NULL,
    "evaluation" JSONB,
    "modelName" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "latencyMs" INTEGER,
    "errorText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvalMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEvalAttachment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "kind" "AiEvalAttachmentKind" NOT NULL,
    "extractedText" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiEvalSession_createdById_idx" ON "AiEvalSession"("createdById");

-- CreateIndex
CREATE INDEX "AiEvalSession_controlRefId_idx" ON "AiEvalSession"("controlRefId");

-- CreateIndex
CREATE INDEX "AiEvalSession_status_idx" ON "AiEvalSession"("status");

-- CreateIndex
CREATE INDEX "AiEvalMessage_sessionId_idx" ON "AiEvalMessage"("sessionId");

-- CreateIndex
CREATE INDEX "AiEvalAttachment_sessionId_idx" ON "AiEvalAttachment"("sessionId");

-- AddForeignKey
ALTER TABLE "AiEvalMessage" ADD CONSTRAINT "AiEvalMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiEvalSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvalAttachment" ADD CONSTRAINT "AiEvalAttachment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiEvalSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

