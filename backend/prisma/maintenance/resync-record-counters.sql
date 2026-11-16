-- RecordCounter yeniden hizalama — veri aktarımı / dış kaynaktan kayıt yükleme SONRASI.
--
-- Neden: iş kimlikleri (B-YYYY-NNNN, A-…-NN, T-…-NN, BTK.NNNN, YYYY.BTK.NNNN.TN) RecordCounter
-- sayacından üretilir. Sayaçlar yalnız ilgili migration anında mevcut kayıtlardan tohumlandı;
-- sonradan doğrudan INSERT ile gelen kayıtlar sayacı ilerletmez ve uygulama ilk yeni kayıtta
-- "Unique constraint failed (findingId)" ile 500 verir.
--
-- Güvenlik: yalnız ARTIRIR (GREATEST); sayaç asla geri alınmaz, iptal edilmiş numara tekrar
-- kullanılmaz. Tekrar çalıştırılabilir. Tek transaction. Kayıt verisine dokunmaz.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/maintenance/resync-record-counters.sql
BEGIN;

WITH src AS (
    SELECT 'finding:' || (m)[1] AS scope, MAX(((m)[2])::int) AS value
    FROM (SELECT regexp_match("findingId", '^B-(\d{4})-(\d{4,})$') AS m FROM "Finding") x
    WHERE m IS NOT NULL GROUP BY (m)[1]
  UNION ALL
    SELECT 'action:' || "findingId", MAX((regexp_match("actionId", '-(\d{2,})$'))[1]::int)
    FROM "Action" WHERE "actionId" ~ '^A-\d{4}-\d{4,}-\d{2,}$' GROUP BY "findingId"
  UNION ALL
    SELECT 'followup:' || "actionId", MAX((regexp_match("followUpId", '-(\d{2,})$'))[1]::int)
    FROM "FindingFollowUp" WHERE "actionId" IS NOT NULL AND "followUpId" ~ '^T-\d{4}-\d{4,}-\d{2,}-\d{2,}$' GROUP BY "actionId"
  UNION ALL
    SELECT 'control-code', MAX((regexp_match("controlId", '^BTK\.(\d{4,})$'))[1]::int)
    FROM "Control" WHERE "controlId" ~ '^BTK\.\d{4,}$'
  UNION ALL
    SELECT 'test-code:' || "controlId" || ':' || (m)[1], MAX(((m)[2])::int)
    FROM (SELECT "controlId", regexp_match("testNo", '^(\d{4})\.BTK\.\d{4,}\.T(\d+)$') AS m FROM "ControlTest") x
    WHERE m IS NOT NULL GROUP BY "controlId", (m)[1]
)
INSERT INTO "RecordCounter" ("scope", "value", "updatedAt")
SELECT scope, value, NOW() FROM src WHERE value IS NOT NULL
ON CONFLICT ("scope") DO UPDATE
    SET "value" = GREATEST("RecordCounter"."value", EXCLUDED."value"), "updatedAt" = NOW()
    WHERE "RecordCounter"."value" < EXCLUDED."value";

COMMIT;
