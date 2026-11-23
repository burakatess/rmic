-- AlterTable
ALTER TABLE "ControlYearScope" ADD COLUMN     "deletionDecidedAt" TIMESTAMP(3),
ADD COLUMN     "deletionDecidedById" TEXT,
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "deletionRejectionReason" TEXT,
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionRequestedById" TEXT,
ADD COLUMN     "reviewApprovedAt" TIMESTAMP(3),
ADD COLUMN     "reviewApprovedById" TEXT,
ADD COLUMN     "reviewReturnReason" TEXT,
ADD COLUMN     "reviewReturnedAt" TIMESTAMP(3),
ADD COLUMN     "reviewSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "reviewSubmittedById" TEXT;

-- AlterTable
ALTER TABLE "ControlTest" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "deletionDecidedAt" TIMESTAMP(3),
ADD COLUMN     "deletionDecidedById" TEXT,
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "deletionRejectionReason" TEXT,
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionRequestedById" TEXT;

-- CreateTable
CREATE TABLE "ControlTestFindingLink" (
    "id" TEXT NOT NULL,
    "controlTestId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "linkedById" TEXT NOT NULL,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "ControlTestFindingLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTransition" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStage" TEXT NOT NULL,
    "toStage" TEXT NOT NULL,
    "userId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowTransition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ControlTestFindingLink_findingId_idx" ON "ControlTestFindingLink"("findingId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlTestFindingLink_controlTestId_findingId_key" ON "ControlTestFindingLink"("controlTestId", "findingId");

-- CreateIndex
CREATE INDEX "WorkflowTransition_entityType_entityId_createdAt_idx" ON "WorkflowTransition"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "ControlTestFindingLink" ADD CONSTRAINT "ControlTestFindingLink_controlTestId_fkey" FOREIGN KEY ("controlTestId") REFERENCES "ControlTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlTestFindingLink" ADD CONSTRAINT "ControlTestFindingLink_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "Finding"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: mevcut tekil bulgu referansları yeni çoklu bağlantı tablosuna taşınır (eski alan korunur).
INSERT INTO "ControlTestFindingLink" ("id", "controlTestId", "findingId", "linkedById", "linkedAt", "note")
SELECT 'ctfl_' || md5(t."id" || t."referencedFindingId"), t."id", t."referencedFindingId", COALESCE(t."assigneeId", 'SYSTEM'), COALESCE(t."completedAt", t."updatedAt"), t."referenceReason"
FROM "ControlTest" t
WHERE t."referencedFindingId" IS NOT NULL
ON CONFLICT ("controlTestId", "findingId") DO NOTHING;
