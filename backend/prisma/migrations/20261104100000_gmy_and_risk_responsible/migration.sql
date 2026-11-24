-- GMY tablosu; direktörlük ve risk GMY'ye, risk sorumlusu kullanıcıya bağlanır.

-- AlterTable
ALTER TABLE "Directorate" ADD COLUMN     "gmyId" TEXT;

-- AlterTable
ALTER TABLE "Risk" ADD COLUMN     "gmyId" TEXT,
ADD COLUMN     "riskSorumlusuId" TEXT;

-- CreateTable
CREATE TABLE "Gmy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "responsibleUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gmy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gmy_name_key" ON "Gmy"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Gmy_code_key" ON "Gmy"("code");

-- CreateIndex
CREATE INDEX "Gmy_isActive_idx" ON "Gmy"("isActive");

-- CreateIndex
CREATE INDEX "Risk_gmyId_idx" ON "Risk"("gmyId");

-- CreateIndex
CREATE INDEX "Risk_riskSorumlusuId_idx" ON "Risk"("riskSorumlusuId");

-- AddForeignKey
ALTER TABLE "Gmy" ADD CONSTRAINT "Gmy_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Directorate" ADD CONSTRAINT "Directorate_gmyId_fkey" FOREIGN KEY ("gmyId") REFERENCES "Gmy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_gmyId_fkey" FOREIGN KEY ("gmyId") REFERENCES "Gmy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_riskSorumlusuId_fkey" FOREIGN KEY ("riskSorumlusuId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Eski serbest metinden GMY kayıtları (yalnız BİREBİR metin; bulanık eşleme yok) ──
-- Direktörlük.gmy ve Risk.ilgiliGmy'deki dolu değerler GMY olarak tanımlanır ve aynı
-- metne sahip kayıtlar bağlanır. Risk sorumlusu (kişi) için OTOMATİK eşleme YAPILMAZ:
-- serbest metin olduğu gibi kalır; eşleme prisma/risk-responsible-dry-run.ts raporuyla
-- yetkili kişi tarafından yapılır.
INSERT INTO "Gmy" ("id", "name", "isActive", "createdAt", "updatedAt")
SELECT 'gmy_' || substr(md5(v), 1, 20), v, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
    SELECT DISTINCT btrim("gmy") AS v FROM "Directorate" WHERE btrim(coalesce("gmy", '')) <> ''
    UNION
    SELECT DISTINCT btrim("ilgiliGmy") FROM "Risk" WHERE btrim(coalesce("ilgiliGmy", '')) <> ''
) s
ON CONFLICT ("name") DO NOTHING;

UPDATE "Directorate" d SET "gmyId" = g."id" FROM "Gmy" g WHERE d."gmyId" IS NULL AND g."name" = btrim(d."gmy");
UPDATE "Risk" r SET "gmyId" = g."id" FROM "Gmy" g WHERE r."gmyId" IS NULL AND g."name" = btrim(r."ilgiliGmy");
