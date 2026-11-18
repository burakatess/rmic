-- CreateEnum
CREATE TYPE "RecordApprovalState" AS ENUM ('TASLAK', 'ONAY_BEKLIYOR', 'ONAYLANDI', 'REDDEDILDI');

-- AlterTable
ALTER TABLE "Action" ADD COLUMN     "approvalEffects" JSONB,
ADD COLUMN     "approvalState" "RecordApprovalState" NOT NULL DEFAULT 'TASLAK',
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "deletionRejectionReason" TEXT,
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionRequestedById" TEXT,
ADD COLUMN     "firstControllerId" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "revertReason" TEXT,
ADD COLUMN     "revertedAt" TIMESTAMP(3),
ADD COLUMN     "secondControllerId" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Finding" ADD COLUMN     "firstControllerId" TEXT,
ADD COLUMN     "secondControllerId" TEXT;

-- AlterTable
ALTER TABLE "FindingFollowUp" ADD COLUMN     "approvalEffects" JSONB,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "deletionReason" TEXT,
ADD COLUMN     "deletionRejectionReason" TEXT,
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionRequestedById" TEXT,
ADD COLUMN     "revertReason" TEXT,
ADD COLUMN     "revertedAt" TIMESTAMP(3),
ADD COLUMN     "revertedById" TEXT;

-- CreateIndex
CREATE INDEX "Action_approvalState_idx" ON "Action"("approvalState");

-- CreateIndex
CREATE INDEX "Action_firstControllerId_idx" ON "Action"("firstControllerId");

-- CreateIndex
CREATE INDEX "Action_secondControllerId_idx" ON "Action"("secondControllerId");

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_firstControllerId_fkey" FOREIGN KEY ("firstControllerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_secondControllerId_fkey" FOREIGN KEY ("secondControllerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_firstControllerId_fkey" FOREIGN KEY ("firstControllerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Action" ADD CONSTRAINT "Action_secondControllerId_fkey" FOREIGN KEY ("secondControllerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Veri taşıma ────────────────────────────────────────────────────────────────
-- Mevcut aksiyonlar bu akıştan önce oluşturulmuş ve takipleri açılmıştır: onaylı sayılır.
UPDATE "Action" SET "approvalState" = 'ONAYLANDI' WHERE "approvalState" = 'TASLAK';

-- Bulgu kontrolcüleri: kontrol testinin kontrolcüleri (yoksa eski atanan) — yeni varsayılan zinciri.
UPDATE "Finding" f SET
  "firstControllerId"  = COALESCE(ct."assigneeId", f."assigneeId"),
  "secondControllerId" = ct."secondControllerId"
FROM "ControlTest" ct
WHERE f."controlTestId" = ct."id";
UPDATE "Finding" SET "firstControllerId" = "assigneeId" WHERE "firstControllerId" IS NULL AND "assigneeId" IS NOT NULL;
-- Birinci ve ikinci kontrolcü aynı kişi olamaz: çakışmada ikinci kontrolcü boş bırakılır.
UPDATE "Finding" SET "secondControllerId" = NULL WHERE "secondControllerId" = "firstControllerId";

-- Aksiyon kontrolcüleri: bulgunun kontrolcüleri.
UPDATE "Action" a SET "firstControllerId" = f."firstControllerId", "secondControllerId" = f."secondControllerId"
FROM "Finding" f WHERE a."findingId" = f."id";
