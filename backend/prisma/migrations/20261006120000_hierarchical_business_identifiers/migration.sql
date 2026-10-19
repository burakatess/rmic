-- Finding → Action → Follow-up kurumsal kayıt numaraları.
-- Deterministik sıra: createdAt ASC, id ASC. Internal PK/FK değerleri değişmez.
-- Aksiyonsuz legacy takiplerin parent'ı olmadığı için kodları korunur; uygulama
-- bundan sonra yeni aksiyonsuz takip oluşturmaz.

CREATE TEMP TABLE "_FindingNoBackfill" AS
SELECT
    f."id",
    'B-' || y."year" || '-' || LPAD(
        ROW_NUMBER() OVER (PARTITION BY y."year" ORDER BY f."createdAt", f."id")::text,
        4,
        '0'
    ) AS "newNo",
    y."year"::integer AS "year",
    ROW_NUMBER() OVER (PARTITION BY y."year" ORDER BY f."createdAt", f."id")::integer AS "sequence"
FROM "Finding" f
CROSS JOIN LATERAL (
    -- Prisma DateTime bu şemada TIMESTAMP WITHOUT TIME ZONE olarak saklanır;
    -- ek timezone dönüşümü yıl sınırında 1 Ocak'ı önceki yıla çekebilir.
    SELECT EXTRACT(YEAR FROM COALESCE(f."testDate", f."createdAt"))::text AS "year"
) y;

CREATE TEMP TABLE "_ActionNoBackfill" AS
SELECT
    a."id",
    a."findingId",
    'A-' || SUBSTRING(fm."newNo" FROM 3) || '-' || LPAD(
        ROW_NUMBER() OVER (PARTITION BY a."findingId" ORDER BY a."createdAt", a."id")::text,
        2,
        '0'
    ) AS "newNo",
    ROW_NUMBER() OVER (PARTITION BY a."findingId" ORDER BY a."createdAt", a."id")::integer AS "sequence"
FROM "Action" a
JOIN "_FindingNoBackfill" fm ON fm."id" = a."findingId";

CREATE TEMP TABLE "_FollowUpNoBackfill" AS
SELECT
    fu."id",
    fu."actionId",
    'T-' || SUBSTRING(am."newNo" FROM 3) || '-' || LPAD(
        ROW_NUMBER() OVER (PARTITION BY fu."actionId" ORDER BY fu."createdAt", fu."id")::text,
        2,
        '0'
    ) AS "newNo",
    ROW_NUMBER() OVER (PARTITION BY fu."actionId" ORDER BY fu."createdAt", fu."id")::integer AS "sequence"
FROM "FindingFollowUp" fu
JOIN "_ActionNoBackfill" am ON am."id" = fu."actionId"
WHERE fu."actionId" IS NOT NULL;

-- Unique indekslerle ara çakışmayı önlemek için önce kayıt-başına benzersiz geçici değer.
UPDATE "Finding" SET "findingId" = '__MIGRATION_FINDING__' || "id";
UPDATE "Action" SET "actionId" = '__MIGRATION_ACTION__' || "id";
UPDATE "FindingFollowUp" fu
SET "followUpId" = '__MIGRATION_FOLLOWUP__' || fu."id"
WHERE fu."actionId" IS NOT NULL;

UPDATE "Finding" f SET "findingId" = m."newNo" FROM "_FindingNoBackfill" m WHERE m."id" = f."id";
UPDATE "Action" a SET "actionId" = m."newNo" FROM "_ActionNoBackfill" m WHERE m."id" = a."id";
UPDATE "FindingFollowUp" fu SET "followUpId" = m."newNo" FROM "_FollowUpNoBackfill" m WHERE m."id" = fu."id";

INSERT INTO "RecordCounter" ("scope", "value", "updatedAt")
SELECT 'finding:' || "year", MAX("sequence"), NOW()
FROM "_FindingNoBackfill"
GROUP BY "year"
ON CONFLICT ("scope") DO UPDATE SET "value" = GREATEST("RecordCounter"."value", EXCLUDED."value"), "updatedAt" = NOW();

INSERT INTO "RecordCounter" ("scope", "value", "updatedAt")
SELECT 'action:' || "findingId", MAX("sequence"), NOW()
FROM "_ActionNoBackfill"
GROUP BY "findingId"
ON CONFLICT ("scope") DO UPDATE SET "value" = GREATEST("RecordCounter"."value", EXCLUDED."value"), "updatedAt" = NOW();

INSERT INTO "RecordCounter" ("scope", "value", "updatedAt")
SELECT 'followup:' || "actionId", MAX("sequence"), NOW()
FROM "_FollowUpNoBackfill"
GROUP BY "actionId"
ON CONFLICT ("scope") DO UPDATE SET "value" = GREATEST("RecordCounter"."value", EXCLUDED."value"), "updatedAt" = NOW();

CREATE OR REPLACE FUNCTION "reject_business_identifier_change"()
RETURNS trigger AS $$
BEGIN
    IF (to_jsonb(NEW) ->> TG_ARGV[0]) IS DISTINCT FROM (to_jsonb(OLD) ->> TG_ARGV[0]) THEN
        RAISE EXCEPTION '% is immutable', TG_ARGV[0] USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Finding_business_id_immutable" BEFORE UPDATE ON "Finding"
FOR EACH ROW EXECUTE FUNCTION "reject_business_identifier_change"('findingId');
CREATE TRIGGER "Action_business_id_immutable" BEFORE UPDATE ON "Action"
FOR EACH ROW EXECUTE FUNCTION "reject_business_identifier_change"('actionId');
CREATE TRIGGER "FindingFollowUp_business_id_immutable" BEFORE UPDATE ON "FindingFollowUp"
FOR EACH ROW EXECUTE FUNCTION "reject_business_identifier_change"('followUpId');
