-- Mevcut veriyi düzelt: tüm (iptal/silinmiş olmayan) aksiyonları kapalı, açık bulgular "Kapanışa hazır" olur.
UPDATE "Finding" f
SET "resolutionStatus" = 'KAPANISA_HAZIR'
WHERE f."status" = 'PARTIALLY_CLOSED'
  AND f."deletedAt" IS NULL
  AND f."workflowStatus" <> 'IPTAL'
  AND EXISTS (SELECT 1 FROM "Action" a WHERE a."findingId" = f.id AND a."deletedAt" IS NULL AND a."status" <> 'IPTAL')
  AND NOT EXISTS (
    SELECT 1 FROM "Action" a
    WHERE a."findingId" = f.id AND a."deletedAt" IS NULL AND a."status" NOT IN ('KAPATILDI', 'CLOSED', 'IPTAL')
  );

-- Kapanış değerlendirmesindeki bulgular da (tüm aksiyonları kapalıdır) aynı çözüm durumunu taşır.
UPDATE "Finding" SET "resolutionStatus" = 'KAPANISA_HAZIR'
WHERE "status" = 'PENDING_REVIEW' AND "resolutionStatus" = 'KISMEN_KAPATILDI';
