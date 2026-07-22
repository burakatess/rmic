-- İkinci kontrolcü onay akışı (BEKLIYOR/DEVAM_EDIYOR/TAMAMLANDI/ONAYLANDI mevcuttu)
ALTER TYPE "ControlTestStatus" ADD VALUE IF NOT EXISTS 'GERI_GONDERILDI';
ALTER TYPE "ControlTestStatus" ADD VALUE IF NOT EXISTS 'IPTAL';

-- ControlTest: geri gönderme / final iptal / bulgu referansı alanları
ALTER TABLE "ControlTest" ADD COLUMN IF NOT EXISTS "returnedById" TEXT;
ALTER TABLE "ControlTest" ADD COLUMN IF NOT EXISTS "returnedAt" TIMESTAMP(3);
ALTER TABLE "ControlTest" ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3);
ALTER TABLE "ControlTest" ADD COLUMN IF NOT EXISTS "cancelledById" TEXT;
ALTER TABLE "ControlTest" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE "ControlTest" ADD COLUMN IF NOT EXISTS "referencedFindingId" TEXT;
ALTER TABLE "ControlTest" ADD COLUMN IF NOT EXISTS "referenceReason" TEXT;

DO $$ BEGIN
  ALTER TABLE "ControlTest"
    ADD CONSTRAINT "ControlTest_referencedFindingId_fkey"
    FOREIGN KEY ("referencedFindingId") REFERENCES "Finding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ControlTest_secondControllerId_idx" ON "ControlTest"("secondControllerId");
CREATE INDEX IF NOT EXISTS "ControlTest_referencedFindingId_idx" ON "ControlTest"("referencedFindingId");
