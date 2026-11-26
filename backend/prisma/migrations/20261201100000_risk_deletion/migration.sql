-- Risk Yönetimi kayıtları (risk, risk kontrolü, risk aksiyonu) için yönetici onaylı silme talebi.
-- Kayıtlar fiziksel silinmez; deletedAt ile işaretlenir.
ALTER TABLE "Risk"
  ADD COLUMN "deletionRequestedById" TEXT,
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletionReason" TEXT,
  ADD COLUMN "deletionRejectionReason" TEXT,
  ADD COLUMN "deletionDecidedById" TEXT,
  ADD COLUMN "deletionDecidedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;
CREATE INDEX "Risk_deletedAt_idx" ON "Risk"("deletedAt");

ALTER TABLE "RiskControl"
  ADD COLUMN "deletionRequestedById" TEXT,
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletionReason" TEXT,
  ADD COLUMN "deletionRejectionReason" TEXT,
  ADD COLUMN "deletionDecidedById" TEXT,
  ADD COLUMN "deletionDecidedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;
CREATE INDEX "RiskControl_deletedAt_idx" ON "RiskControl"("deletedAt");

ALTER TABLE "RiskAction"
  ADD COLUMN "deletionRequestedById" TEXT,
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletionReason" TEXT,
  ADD COLUMN "deletionRejectionReason" TEXT,
  ADD COLUMN "deletionDecidedById" TEXT,
  ADD COLUMN "deletionDecidedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;
CREATE INDEX "RiskAction_deletedAt_idx" ON "RiskAction"("deletedAt");
