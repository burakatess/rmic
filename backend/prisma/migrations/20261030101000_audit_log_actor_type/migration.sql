-- Denetim izi aktör bağlamı: USER (HTTP isteği) / SYSTEM (cron, arka plan).
-- Eski kayıtlar NULL kalır (bağlam bilinmiyor); geriye dönük tahmin yapılmaz.
ALTER TABLE "AuditLog" ADD COLUMN "actorType" TEXT;
CREATE INDEX "AuditLog_actorType_idx" ON "AuditLog"("actorType");
