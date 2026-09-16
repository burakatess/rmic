-- AlterTable
ALTER TABLE "AnnualPlanDraftItem" ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "referenceMonth" INTEGER,
ADD COLUMN     "secondControllerId" TEXT;

-- AlterTable
ALTER TABLE "ControlYearScope" ADD COLUMN     "assigneeId" TEXT,
ADD COLUMN     "referenceMonth" INTEGER,
ADD COLUMN     "secondControllerId" TEXT;

-- CreateTable
CREATE TABLE "CodeAlias" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldCode" TEXT NOT NULL,
    "newCode" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MIGRATION',
    "mappedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mappedById" TEXT,

    CONSTRAINT "CodeAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CodeAlias_entityType_entityId_idx" ON "CodeAlias"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "CodeAlias_newCode_idx" ON "CodeAlias"("newCode");

-- CreateIndex
CREATE UNIQUE INDEX "CodeAlias_entityType_oldCode_key" ON "CodeAlias"("entityType", "oldCode");

-- CreateIndex
CREATE INDEX "ControlYearScope_assigneeId_idx" ON "ControlYearScope"("assigneeId");

-- CreateIndex
CREATE INDEX "ControlYearScope_secondControllerId_idx" ON "ControlYearScope"("secondControllerId");

-- AddForeignKey
ALTER TABLE "ControlYearScope" ADD CONSTRAINT "ControlYearScope_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlYearScope" ADD CONSTRAINT "ControlYearScope_secondControllerId_fkey" FOREIGN KEY ("secondControllerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
