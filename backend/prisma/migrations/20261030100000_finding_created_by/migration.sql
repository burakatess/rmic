-- Bulgu oluşturucusu: AUDITOR'ın yalnız KENDİ taslağını silebilmesi (finding:delete:own)
-- için sunucu tarafından doğrulanmış dayanak. Additive; mevcut veri silinmez.
ALTER TABLE "Finding" ADD COLUMN "createdById" TEXT;
CREATE INDEX "Finding_createdById_idx" ON "Finding"("createdById");

-- Geriye dönük doldurma: bulgunun en eski CREATE denetim kaydındaki kullanıcı.
-- Denetim kaydı yoksa NULL kalır (oluşturucu bilinmeyen taslağı yalnız
-- finding:delete yetkilisi silebilir; kendi-taslağı kuralı uygulanmaz).
UPDATE "Finding" f
SET "createdById" = src."userId"
FROM (
    SELECT DISTINCT ON (a."entityId") a."entityId", a."userId"
    FROM "AuditLog" a
    WHERE a."entityType" = 'Finding' AND a."action" = 'CREATE' AND a."userId" IS NOT NULL
    ORDER BY a."entityId", a."createdAt" ASC
) src
WHERE f."id" = src."entityId" AND f."createdById" IS NULL;
