-- Manuel aksiyon planı: bulgudan bağımsız aksiyon ve ondan türeyen takip çalışması.
-- Yalnız kısıt gevşetme + yeni alan; mevcut kayıtlar değişmez (hepsinde findingId dolu kalır).
ALTER TABLE "Action" ALTER COLUMN "findingId" DROP NOT NULL;
ALTER TABLE "Action" ADD COLUMN "title" TEXT;
ALTER TABLE "FindingFollowUp" ALTER COLUMN "findingId" DROP NOT NULL;
ALTER TABLE "FindingStatusHistory" ALTER COLUMN "findingId" DROP NOT NULL;
ALTER TABLE "FindingStatusLog" ALTER COLUMN "findingId" DROP NOT NULL;
CREATE INDEX "Action_findingId_null_idx" ON "Action" ("createdAt") WHERE "findingId" IS NULL;
