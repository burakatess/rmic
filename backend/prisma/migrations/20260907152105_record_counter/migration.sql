-- Atomik kayıt numarası sayacı (yarış-koşulu güvenli ID üretimi).
-- CreateTable
CREATE TABLE "RecordCounter" (
    "scope" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecordCounter_pkey" PRIMARY KEY ("scope")
);

-- Mevcut kayıtlardan sayaçları tohumla: yalnızca "A-YYYY-NNNN" / "T-YYYY-NNNN"
-- formatındaki numaraların son parçasından en büyük NNNN'yi al.
INSERT INTO "RecordCounter" ("scope", "value", "updatedAt")
VALUES (
    'action',
    COALESCE((
        SELECT MAX(split_part("actionId", '-', 3)::int)
        FROM "Action"
        WHERE "actionId" ~ '^A-[0-9]{4}-[0-9]+$'
    ), 0),
    NOW()
)
ON CONFLICT ("scope") DO NOTHING;

INSERT INTO "RecordCounter" ("scope", "value", "updatedAt")
VALUES (
    'followup',
    COALESCE((
        SELECT MAX(split_part("followUpId", '-', 3)::int)
        FROM "FindingFollowUp"
        WHERE "followUpId" ~ '^T-[0-9]{4}-[0-9]+$'
    ), 0),
    NOW()
)
ON CONFLICT ("scope") DO NOTHING;
