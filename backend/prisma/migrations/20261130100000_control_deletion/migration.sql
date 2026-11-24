-- Kontrol için yönetici onaylı silme talebi (yalnız geçmişi olmayan kontrol). Kayıt fiziksel silinmez.
ALTER TABLE "Control"
  ADD COLUMN "deletionRequestedById" TEXT,
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletionReason" TEXT,
  ADD COLUMN "deletionRejectionReason" TEXT,
  ADD COLUMN "deletionDecidedById" TEXT,
  ADD COLUMN "deletionDecidedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;

CREATE INDEX "Control_deletedAt_idx" ON "Control"("deletedAt");
