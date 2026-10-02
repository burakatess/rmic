ALTER TYPE "AnnualPlanDraftStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "AnnualPlanDraftStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';
ALTER TYPE "AnnualPlanDraftStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

ALTER TABLE "AnnualPlanDraft"
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "submittedById" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedRevision" INTEGER,
ADD COLUMN "decisionNote" TEXT,
ADD COLUMN "decidedById" TEXT;

ALTER TABLE "AnnualPlanDraft"
ADD CONSTRAINT "AnnualPlanDraft_submittedById_fkey"
FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnnualPlanDraft"
ADD CONSTRAINT "AnnualPlanDraft_approvedById_fkey"
FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AnnualPlanDraft"
ADD CONSTRAINT "AnnualPlanDraft_decidedById_fkey"
FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AnnualPlanDraft_submittedById_idx" ON "AnnualPlanDraft"("submittedById");
CREATE INDEX "AnnualPlanDraft_approvedById_idx" ON "AnnualPlanDraft"("approvedById");
