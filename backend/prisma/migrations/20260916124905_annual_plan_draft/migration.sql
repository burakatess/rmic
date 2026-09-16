-- CreateEnum
CREATE TYPE "AnnualPlanDraftStatus" AS ENUM ('OPEN', 'APPLIED');

-- CreateTable
CREATE TABLE "AnnualPlanDraft" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "status" "AnnualPlanDraftStatus" NOT NULL DEFAULT 'OPEN',
    "updatedById" TEXT NOT NULL,
    "lastAppliedAt" TIMESTAMP(3),
    "lastAppliedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualPlanDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnualPlanDraftItem" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "inScope" BOOLEAN NOT NULL,
    "frequency" "ControlFrequency",
    "selectedMonths" TEXT[],
    "controlDate" TIMESTAMP(3),
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnnualPlanDraftItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnnualPlanDraft_year_key" ON "AnnualPlanDraft"("year");

-- CreateIndex
CREATE INDEX "AnnualPlanDraftItem_controlId_idx" ON "AnnualPlanDraftItem"("controlId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualPlanDraftItem_draftId_controlId_key" ON "AnnualPlanDraftItem"("draftId", "controlId");

-- AddForeignKey
ALTER TABLE "AnnualPlanDraft" ADD CONSTRAINT "AnnualPlanDraft_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualPlanDraft" ADD CONSTRAINT "AnnualPlanDraft_lastAppliedById_fkey" FOREIGN KEY ("lastAppliedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualPlanDraftItem" ADD CONSTRAINT "AnnualPlanDraftItem_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "AnnualPlanDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnualPlanDraftItem" ADD CONSTRAINT "AnnualPlanDraftItem_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "Control"("id") ON DELETE CASCADE ON UPDATE CASCADE;
