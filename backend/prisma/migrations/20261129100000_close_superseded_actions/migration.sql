-- "Yeni Aksiyon Gerekli" takip onayıyla yerine yeni aksiyon açılmış ama açık kalmış eski aksiyonlar kapatılır
-- (kullanıcı kararı 2026-11: eski aksiyon "yerine yeni aksiyon açıldı" olarak kapanır). Bu kayıtlar kendine
-- takip açılmadığı için bulgunun kapanışa gönderilmesini kalıcı olarak engelliyordu.
WITH superseded AS (
  SELECT DISTINCT a.id
  FROM "Action" a
  JOIN "FindingFollowUp" fu ON fu."actionId" = a.id
  WHERE fu.status = 'ONAYLANDI'
    AND fu.result = 'YENI_AKSIYON_GEREKLI'
    AND fu."newActionId" IS NOT NULL
    AND fu."deletedAt" IS NULL
    AND a."deletedAt" IS NULL
    AND a.status NOT IN ('KAPATILDI', 'CLOSED', 'IPTAL')
    AND NOT EXISTS (
      SELECT 1 FROM "FindingFollowUp" o
      WHERE o."actionId" = a.id AND o."deletedAt" IS NULL AND o.status IN ('BEKLIYOR', 'DEVAM_EDIYOR', 'TAMAMLANDI')
    )
)
UPDATE "Action" SET status = 'KAPATILDI', "completedAt" = COALESCE("completedAt", now())
WHERE id IN (SELECT id FROM superseded);

-- Tüm (iptal/silinmiş olmayan) aksiyonları artık kapalı olan açık bulgular "Kapanışa hazır" olur.
UPDATE "Finding" f
SET status = 'PARTIALLY_CLOSED', "resolutionStatus" = 'KAPANISA_HAZIR'
WHERE f.status IN ('IN_PROGRESS', 'PARTIALLY_CLOSED', 'OPEN')
  AND f."deletedAt" IS NULL
  AND f."workflowStatus" <> 'IPTAL'
  AND EXISTS (SELECT 1 FROM "Action" a WHERE a."findingId" = f.id AND a."deletedAt" IS NULL AND a.status <> 'IPTAL')
  AND NOT EXISTS (
    SELECT 1 FROM "Action" a
    WHERE a."findingId" = f.id AND a."deletedAt" IS NULL AND a.status NOT IN ('KAPATILDI', 'CLOSED', 'IPTAL')
  );
