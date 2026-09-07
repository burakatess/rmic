-- CreateEnum
CREATE TYPE "KnowledgeDocKind" AS ENUM ('POLICY', 'PROCEDURE', 'METHODOLOGY', 'RUBRIC', 'GLOSSARY', 'PRECEDENT');

-- AlterTable
ALTER TABLE "AiEvalSession" ADD COLUMN     "knowledgeDocIds" TEXT[],
ADD COLUMN     "knowledgeSnapshot" JSONB;

-- CreateTable
CREATE TABLE "KnowledgeDoc" (
    "id" TEXT NOT NULL,
    "kind" "KnowledgeDocKind" NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "tags" TEXT[],
    "sourceRef" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDoc_code_key" ON "KnowledgeDoc"("code");

-- CreateIndex
CREATE INDEX "KnowledgeDoc_kind_idx" ON "KnowledgeDoc"("kind");

-- CreateIndex
CREATE INDEX "KnowledgeDoc_isActive_idx" ON "KnowledgeDoc"("isActive");
